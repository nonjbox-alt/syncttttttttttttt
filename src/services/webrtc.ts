import { socketService } from './socket.ts';
import { IceServerConfig, SignalingMessage, WebRTCDiagnostics } from '../types.ts';

export interface WebRTCEvents {
  onRemoteStream: (peerId: string, stream: MediaStream, type: 'cam' | 'screen') => void;
  onRemoteStreamRemoved: (peerId: string, type: 'cam' | 'screen') => void;
  onLocalSpeakingChange: (isSpeaking: boolean) => void;
  onDiagnosticsChange?: (diagnostics: WebRTCDiagnostics) => void;
}

// Default fallback public STUN servers (Cloudflare & Google)
const DEFAULT_STUN_SERVERS: IceServerConfig[] = [
  {
    urls: [
      'stun:stun.cloudflare.com:3478',
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
    ],
  },
];

class WebRTCManager {
  private localCamStream: MediaStream | null = null;
  private localScreenStream: MediaStream | null = null;
  private peerConnections = new Map<string, RTCPeerConnection>();
  private remoteStreams = new Map<string, { camStream?: MediaStream; screenStream?: MediaStream }>();
  private iceServers: IceServerConfig[] = DEFAULT_STUN_SERVERS;
  private lastIceServerFetchTime: number = 0;
  private iceRefreshTimer: any = null;

  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private speechDetectionInterval: any = null;
  private isCurrentlySpeaking: boolean = false;
  private events: WebRTCEvents | null = null;
  private isMuted: boolean = true;
  private isCamDisabled: boolean = true;

  // Diagnostics State
  private diagnostics: WebRTCDiagnostics = {
    stunStatus: 'available',
    turnStatus: 'unconfigured',
    iceGatheringState: 'new',
    iceConnectionState: 'new',
    peerConnectionState: 'new',
    activePeerCount: 0,
    lastIceServerRefresh: Date.now(),
    serverUrl: 'stun.cloudflare.com:3478',
  };

  constructor() {
    this.fetchIceServers();
    // Cache & Refresh short-lived TURN/ICE servers every 15 minutes
    this.iceRefreshTimer = setInterval(() => {
      this.fetchIceServers();
    }, 15 * 60 * 1000);
  }

  public getDiagnostics(): WebRTCDiagnostics {
    return { ...this.diagnostics };
  }

  private updateDiagnostics(updates: Partial<WebRTCDiagnostics>) {
    this.diagnostics = {
      ...this.diagnostics,
      ...updates,
      activePeerCount: this.peerConnections.size,
    };
    if (this.events?.onDiagnosticsChange) {
      this.events.onDiagnosticsChange(this.diagnostics);
    }
  }

  public async fetchIceServers() {
    try {
      // Primary endpoint for short-lived credentials
      const res = await fetch('/api/webrtc/ice-servers').catch(() => fetch('/api/config/ice'));
      if (res && res.ok) {
        const data = await res.json();
        if (data.iceServers && Array.isArray(data.iceServers) && data.iceServers.length > 0) {
          this.iceServers = data.iceServers;
          this.lastIceServerFetchTime = Date.now();

          // Check if TURN is configured in returned ice servers
          const hasTurn = this.iceServers.some((s) => {
            const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
            return urls.some((u) => u.startsWith('turn:') || u.startsWith('turns:'));
          });

          const primaryUrl = Array.isArray(this.iceServers[0]?.urls)
            ? this.iceServers[0].urls[0]
            : this.iceServers[0]?.urls || 'stun.cloudflare.com:3478';

          this.updateDiagnostics({
            stunStatus: 'available',
            turnStatus: hasTurn ? 'configured' : 'unconfigured',
            lastIceServerRefresh: this.lastIceServerFetchTime,
            serverUrl: primaryUrl.replace('stun:', '').replace('turns:', '').replace('turn:', ''),
          });
          return;
        }
      }
    } catch (err) {
      console.warn('Using default Cloudflare/Google STUN fallback:', err);
    }

    // Default fallback
    this.iceServers = DEFAULT_STUN_SERVERS;
    this.updateDiagnostics({
      stunStatus: 'available',
      turnStatus: 'unconfigured',
      serverUrl: 'stun.cloudflare.com:3478',
      lastIceServerRefresh: Date.now(),
    });
  }

  public setEvents(events: WebRTCEvents) {
    this.events = events;
    if (events.onDiagnosticsChange) {
      events.onDiagnosticsChange(this.diagnostics);
    }
  }

  // --- AUDIO / VIDEO MEDIA STREAM CONTROLS ---

  public async startLocalMedia(options: {
    audio: boolean;
    video: boolean;
    audioDeviceId?: string;
    videoDeviceId?: string;
    echoCancellation?: boolean;
    noiseSuppression?: boolean;
    autoGainControl?: boolean;
  }): Promise<MediaStream | null> {
    try {
      this.stopLocalCamTracks();

      if (!options.audio && !options.video) {
        this.localCamStream = null;
        return null;
      }

      const constraints: MediaStreamConstraints = {
        audio: options.audio
          ? {
              deviceId: options.audioDeviceId ? { exact: options.audioDeviceId } : undefined,
              echoCancellation: options.echoCancellation ?? true,
              noiseSuppression: options.noiseSuppression ?? true,
              autoGainControl: options.autoGainControl ?? true,
            }
          : false,
        video: options.video
          ? {
              deviceId: options.videoDeviceId ? { exact: options.videoDeviceId } : undefined,
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: 'user',
            }
          : false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.localCamStream = stream;
      this.isMuted = !options.audio;
      this.isCamDisabled = !options.video;

      if (options.audio) {
        this.setupAudioAnalysis(stream);
      }

      this.syncTracksToAllPeers();
      return stream;
    } catch (err) {
      console.warn('Local user media access error:', err);
      return null;
    }
  }

  public async setAudioEnabled(enabled: boolean): Promise<boolean> {
    this.isMuted = !enabled;
    if (this.localCamStream) {
      const audioTracks = this.localCamStream.getAudioTracks();
      if (audioTracks.length > 0) {
        audioTracks.forEach((t) => (t.enabled = enabled));
        if (enabled && !this.analyser) {
          this.setupAudioAnalysis(this.localCamStream);
        }
        return true;
      }
    }

    if (enabled) {
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
        const newTrack = audioStream.getAudioTracks()[0];
        if (this.localCamStream) {
          this.localCamStream.addTrack(newTrack);
        } else {
          this.localCamStream = audioStream;
        }
        this.setupAudioAnalysis(this.localCamStream);
        this.syncTracksToAllPeers();
        return true;
      } catch (err) {
        console.warn('Failed to enable microphone track:', err);
        return false;
      }
    }
    return false;
  }

  public async setVideoEnabled(enabled: boolean): Promise<boolean> {
    this.isCamDisabled = !enabled;
    if (this.localCamStream) {
      const videoTracks = this.localCamStream.getVideoTracks();
      if (videoTracks.length > 0) {
        videoTracks.forEach((t) => (t.enabled = enabled));
        return true;
      }
    }

    if (enabled) {
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: false,
        });
        const newTrack = videoStream.getVideoTracks()[0];
        if (this.localCamStream) {
          this.localCamStream.addTrack(newTrack);
        } else {
          this.localCamStream = videoStream;
        }
        this.syncTracksToAllPeers();
        return true;
      } catch (err) {
        console.warn('Failed to enable camera track:', err);
        return false;
      }
    }
    return false;
  }

  public async flipCamera(): Promise<boolean> {
    if (!this.localCamStream) return false;
    const currentTrack = this.localCamStream.getVideoTracks()[0];
    if (!currentTrack) return false;

    try {
      const currentFacing = currentTrack.getSettings().facingMode;
      const targetFacing = currentFacing === 'environment' ? 'user' : 'environment';

      currentTrack.stop();
      this.localCamStream.removeTrack(currentTrack);

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: targetFacing } },
      });
      const newTrack = newStream.getVideoTracks()[0];
      this.localCamStream.addTrack(newTrack);
      this.syncTracksToAllPeers();
      return true;
    } catch (err) {
      console.warn('Could not flip camera:', err);
      return false;
    }
  }

  // --- SCREEN SHARING ---

  public async startScreenShare(): Promise<MediaStream | null> {
    try {
      if (this.localScreenStream) {
        this.stopScreenShare();
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'browser' as any,
          frameRate: { ideal: 60, max: 60 },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: true,
      });

      this.localScreenStream = stream;

      stream.getVideoTracks()[0].onended = () => {
        this.stopScreenShare();
      };

      this.syncTracksToAllPeers();
      return stream;
    } catch (err) {
      console.warn('Screen share cancelled or rejected:', err);
      return null;
    }
  }

  public stopScreenShare() {
    if (this.localScreenStream) {
      this.localScreenStream.getTracks().forEach((t) => t.stop());
      this.localScreenStream = null;
      this.syncTracksToAllPeers();
    }
  }

  public getLocalCamStream(): MediaStream | null {
    return this.localCamStream;
  }

  public getLocalScreenStream(): MediaStream | null {
    return this.localScreenStream;
  }

  // --- AUDIO ANALYSIS (Speaking Detection) ---

  private setupAudioAnalysis(stream: MediaStream) {
    try {
      if (this.speechDetectionInterval) {
        clearInterval(this.speechDetectionInterval);
      }
      if (this.audioContext && this.audioContext.state !== 'closed') {
        this.audioContext.close().catch(() => {});
      }

      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) return;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass();
      const source = this.audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.4;
      source.connect(this.analyser);

      const buffer = new Uint8Array(this.analyser.frequencyBinCount);

      this.speechDetectionInterval = setInterval(() => {
        if (!this.analyser || this.isMuted) {
          if (this.isCurrentlySpeaking) {
            this.isCurrentlySpeaking = false;
            this.events?.onLocalSpeakingChange(false);
          }
          return;
        }

        this.analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const average = sum / buffer.length;
        const speaking = average > 18;

        if (speaking !== this.isCurrentlySpeaking) {
          this.isCurrentlySpeaking = speaking;
          this.events?.onLocalSpeakingChange(speaking);
        }
      }, 100);
    } catch (e) {
      console.warn('Audio analysis not supported or restricted:', e);
    }
  }

  // --- PEER CONNECTION MANAGEMENT ---

  public createPeerConnection(remoteUserId: string, isInitiator: boolean): RTCPeerConnection {
    let pc = this.peerConnections.get(remoteUserId);
    if (pc) {
      return pc;
    }

    pc = new RTCPeerConnection({
      iceServers: this.iceServers,
      bundlePolicy: 'max-bundle',
    });

    this.peerConnections.set(remoteUserId, pc);
    this.updateDiagnosticsState();

    // ICE Candidate handler
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketService.send({
          type: 'webrtc-ice',
          toUserId: remoteUserId,
          payload: { candidate: event.candidate },
        });
      }
    };

    // ICE Gathering state tracking
    pc.onicegatheringstatechange = () => {
      this.updateDiagnosticsState();
    };

    // ICE Connection state tracking (Decoupled from Room state)
    pc.oniceconnectionstatechange = () => {
      this.updateDiagnosticsState();
      if (pc.iceConnectionState === 'failed') {
        console.warn(`WebRTC ICE failed for peer ${remoteUserId}, attempting graceful ICE restart`);
        try {
          if (typeof (pc as any).restartIce === 'function') {
            (pc as any).restartIce();
          } else {
            this.initiateOffer(remoteUserId, pc, true);
          }
        } catch {}
      }
    };

    // Peer Connection State Tracking
    pc.onconnectionstatechange = () => {
      this.updateDiagnosticsState();
    };

    // Track handler (receive remote streams)
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (!remoteStream) return;

      const track = event.track;
      const isScreen =
        remoteStream.id.includes('screen') ||
        (track.kind === 'video' && track.label.toLowerCase().includes('screen'));
      const streamType = isScreen ? 'screen' : 'cam';

      let userStreams = this.remoteStreams.get(remoteUserId);
      if (!userStreams) {
        userStreams = {};
        this.remoteStreams.set(remoteUserId, userStreams);
      }

      if (streamType === 'screen') {
        userStreams.screenStream = remoteStream;
      } else {
        userStreams.camStream = remoteStream;
      }

      this.events?.onRemoteStream(remoteUserId, remoteStream, streamType);

      track.onended = () => {
        if (streamType === 'screen') {
          userStreams!.screenStream = undefined;
        } else {
          userStreams!.camStream = undefined;
        }
        this.events?.onRemoteStreamRemoved(remoteUserId, streamType);
      };
    };

    // Add local tracks
    this.addLocalTracksToPeer(pc);

    if (isInitiator) {
      this.initiateOffer(remoteUserId, pc);
    }

    return pc;
  }

  private updateDiagnosticsState() {
    let aggregateIceConn: RTCIceConnectionState = 'new';
    let aggregateIceGather: RTCIceGatheringState = 'new';
    let aggregatePeerState: RTCPeerConnectionState = 'new';

    const pcs = Array.from(this.peerConnections.values());
    if (pcs.length > 0) {
      // Find highest active state
      if (pcs.some((p) => p.iceConnectionState === 'connected')) {
        aggregateIceConn = 'connected';
      } else if (pcs.some((p) => p.iceConnectionState === 'checking')) {
        aggregateIceConn = 'checking';
      } else if (pcs.some((p) => p.iceConnectionState === 'completed')) {
        aggregateIceConn = 'completed';
      } else if (pcs.every((p) => p.iceConnectionState === 'failed')) {
        aggregateIceConn = 'failed';
      } else if (pcs.some((p) => p.iceConnectionState === 'disconnected')) {
        aggregateIceConn = 'disconnected';
      }

      if (pcs.some((p) => p.iceGatheringState === 'gathering')) {
        aggregateIceGather = 'gathering';
      } else if (pcs.every((p) => p.iceGatheringState === 'complete')) {
        aggregateIceGather = 'complete';
      }

      if (pcs.some((p) => p.connectionState === 'connected')) {
        aggregatePeerState = 'connected';
      } else if (pcs.some((p) => p.connectionState === 'connecting')) {
        aggregatePeerState = 'connecting';
      }
    }

    this.updateDiagnostics({
      iceConnectionState: aggregateIceConn,
      iceGatheringState: aggregateIceGather,
      peerConnectionState: aggregatePeerState,
      activePeerCount: this.peerConnections.size,
    });
  }

  private addLocalTracksToPeer(pc: RTCPeerConnection) {
    const senders = pc.getSenders();

    if (this.localCamStream) {
      this.localCamStream.getTracks().forEach((track) => {
        const existing = senders.find(
          (s) => s.track && s.track.kind === track.kind && s.track.id === track.id
        );
        if (!existing) {
          try {
            pc.addTrack(track, this.localCamStream!);
          } catch (e) {
            console.warn('Failed to add cam track to peer:', e);
          }
        }
      });
    }

    if (this.localScreenStream) {
      this.localScreenStream.getTracks().forEach((track) => {
        const existing = senders.find(
          (s) => s.track && s.track.kind === track.kind && s.track.id === track.id
        );
        if (!existing) {
          try {
            pc.addTrack(track, this.localScreenStream!);
          } catch (e) {
            console.warn('Failed to add screen track to peer:', e);
          }
        }
      });
    }
  }

  public syncTracksToAllPeers() {
    this.peerConnections.forEach((pc, remoteUserId) => {
      const senders = pc.getSenders();

      const activeTracks = new Set<MediaStreamTrack>();
      if (this.localCamStream) {
        this.localCamStream.getTracks().forEach((t) => activeTracks.add(t));
      }
      if (this.localScreenStream) {
        this.localScreenStream.getTracks().forEach((t) => activeTracks.add(t));
      }

      senders.forEach((sender) => {
        if (sender.track && !activeTracks.has(sender.track)) {
          try {
            pc.removeTrack(sender);
          } catch {}
        }
      });

      this.addLocalTracksToPeer(pc);
      this.initiateOffer(remoteUserId, pc);
    });
  }

  private async initiateOffer(
    remoteUserId: string,
    pc: RTCPeerConnection,
    iceRestart: boolean = false
  ) {
    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        iceRestart,
      });
      await pc.setLocalDescription(offer);

      socketService.send({
        type: 'webrtc-offer',
        toUserId: remoteUserId,
        payload: { offer },
      });
    } catch (err) {
      console.warn('Failed to create offer for peer', remoteUserId, err);
    }
  }

  public async handleSignalingMessage(msg: SignalingMessage) {
    const fromUserId = msg.fromUserId;
    if (!fromUserId) return;

    switch (msg.type) {
      case 'webrtc-offer': {
        const pc = this.createPeerConnection(fromUserId, false);
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.payload.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          socketService.send({
            type: 'webrtc-answer',
            toUserId: fromUserId,
            payload: { answer },
          });
        } catch (err) {
          console.warn('Error handling webrtc-offer:', err);
        }
        break;
      }

      case 'webrtc-answer': {
        const pc = this.peerConnections.get(fromUserId);
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.payload.answer));
          } catch (err) {
            console.warn('Error setting remote answer:', err);
          }
        }
        break;
      }

      case 'webrtc-ice': {
        const pc = this.peerConnections.get(fromUserId);
        if (pc && msg.payload.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(msg.payload.candidate));
          } catch (err) {
            console.warn('Error adding ICE candidate:', err);
          }
        }
        break;
      }
    }
  }

  public removePeer(userId: string) {
    const pc = this.peerConnections.get(userId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(userId);
    }
    const streams = this.remoteStreams.get(userId);
    if (streams) {
      if (streams.camStream) this.events?.onRemoteStreamRemoved(userId, 'cam');
      if (streams.screenStream) this.events?.onRemoteStreamRemoved(userId, 'screen');
      this.remoteStreams.delete(userId);
    }
    this.updateDiagnosticsState();
  }

  private stopLocalCamTracks() {
    if (this.localCamStream) {
      this.localCamStream.getTracks().forEach((t) => t.stop());
      this.localCamStream = null;
    }
  }

  public cleanup() {
    if (this.iceRefreshTimer) {
      clearInterval(this.iceRefreshTimer);
      this.iceRefreshTimer = null;
    }
    if (this.speechDetectionInterval) {
      clearInterval(this.speechDetectionInterval);
      this.speechDetectionInterval = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.stopLocalCamTracks();
    this.stopScreenShare();

    this.peerConnections.forEach((pc) => pc.close());
    this.peerConnections.clear();
    this.remoteStreams.clear();
    this.updateDiagnosticsState();
  }
}

export const webrtcManager = new WebRTCManager();
