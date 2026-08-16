import { socketService } from './socket.ts';
import { IceServerConfig, SignalingMessage } from '../types.ts';

export interface WebRTCEvents {
  onRemoteStream: (peerId: string, stream: MediaStream, type: 'cam' | 'screen') => void;
  onRemoteStreamRemoved: (peerId: string, type: 'cam' | 'screen') => void;
  onLocalSpeakingChange: (isSpeaking: boolean) => void;
}

class WebRTCManager {
  private localCamStream: MediaStream | null = null;
  private localScreenStream: MediaStream | null = null;
  private peerConnections = new Map<string, RTCPeerConnection>();
  private remoteStreams = new Map<string, { camStream?: MediaStream; screenStream?: MediaStream }>();
  private iceServers: IceServerConfig[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private speechDetectionInterval: any = null;
  private isCurrentlySpeaking: boolean = false;
  private events: WebRTCEvents | null = null;
  private isMuted: boolean = true;
  private isCamDisabled: boolean = true;

  constructor() {
    this.fetchIceServers();
  }

  public async fetchIceServers() {
    try {
      const res = await fetch('/api/config/ice');
      const data = await res.json();
      if (data.iceServers && data.iceServers.length > 0) {
        this.iceServers = data.iceServers;
      }
    } catch (err) {
      console.warn('Using fallback STUN servers:', err);
    }
  }

  public setEvents(events: WebRTCEvents) {
    this.events = events;
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
      // Stop existing tracks if any
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

      // Update all existing peer connections
      this.syncTracksToAllPeers();

      return stream;
    } catch (err) {
      console.error('Error accessing local user media:', err);
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
      // Need to acquire mic track
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
        console.error('Failed to enable mic track:', err);
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
        console.error('Failed to enable camera track:', err);
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
        audio: true, // capture tab/system audio if allowed by browser
      });

      this.localScreenStream = stream;

      // Handle user clicking native browser "Stop Sharing" bar
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
        const speaking = average > 18; // Sensible threshold

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

    // Track handler (receive remote streams)
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (!remoteStream) return;

      const track = event.track;
      // Determine if screen or camera based on stream ID or video dimensions
      const isScreen = remoteStream.id.includes('screen') || (track.kind === 'video' && track.label.toLowerCase().includes('screen'));
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

  private addLocalTracksToPeer(pc: RTCPeerConnection) {
    const senders = pc.getSenders();

    if (this.localCamStream) {
      this.localCamStream.getTracks().forEach((track) => {
        const existing = senders.find((s) => s.track && s.track.kind === track.kind && s.track.id === track.id);
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
        const existing = senders.find((s) => s.track && s.track.kind === track.kind && s.track.id === track.id);
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

      // Collect active local tracks
      const activeTracks = new Set<MediaStreamTrack>();
      if (this.localCamStream) {
        this.localCamStream.getTracks().forEach((t) => activeTracks.add(t));
      }
      if (this.localScreenStream) {
        this.localScreenStream.getTracks().forEach((t) => activeTracks.add(t));
      }

      // Remove obsolete senders
      senders.forEach((sender) => {
        if (sender.track && !activeTracks.has(sender.track)) {
          try {
            pc.removeTrack(sender);
          } catch {}
        }
      });

      // Add newly added tracks
      this.addLocalTracksToPeer(pc);

      // Renegotiate with offer
      this.initiateOffer(remoteUserId, pc);
    });
  }

  private async initiateOffer(remoteUserId: string, pc: RTCPeerConnection) {
    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
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
          console.error('Error handling webrtc-offer:', err);
        }
        break;
      }

      case 'webrtc-answer': {
        const pc = this.peerConnections.get(fromUserId);
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.payload.answer));
          } catch (err) {
            console.error('Error setting remote answer:', err);
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
  }

  private stopLocalCamTracks() {
    if (this.localCamStream) {
      this.localCamStream.getTracks().forEach((t) => t.stop());
      this.localCamStream = null;
    }
  }

  public cleanup() {
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
  }
}

export const webrtcManager = new WebRTCManager();
