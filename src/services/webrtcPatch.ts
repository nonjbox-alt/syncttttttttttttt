import { webrtcManager } from './webrtc.ts';
import type { SignalingMessage } from '../types.ts';

type ManagerInternals = {
  peerConnections: Map<string, RTCPeerConnection>;
};

const manager = webrtcManager as typeof webrtcManager & ManagerInternals;
const originalHandle = manager.handleSignalingMessage.bind(manager);
const originalSetEvents = manager.setEvents.bind(manager);

const pendingIce = new Map<string, RTCIceCandidateInit[]>();
const remoteAudio = new Map<string, HTMLAudioElement>();
const pendingAudioUnlock = new Set<HTMLAudioElement>();
let unlockListenersInstalled = false;

function retryAudioPlayback(audio: HTMLAudioElement) {
  audio.muted = false;
  audio.autoplay = true;
  audio.playsInline = true;
  const result = audio.play();
  if (result && typeof result.catch === 'function') {
    result.catch(() => {
      pendingAudioUnlock.add(audio);
      installAudioUnlockListeners();
    });
  }
}

function installAudioUnlockListeners() {
  if (unlockListenersInstalled) return;
  unlockListenersInstalled = true;

  const unlock = () => {
    for (const audio of Array.from(pendingAudioUnlock)) {
      retryAudioPlayback(audio);
      if (!audio.paused) pendingAudioUnlock.delete(audio);
    }
    if (pendingAudioUnlock.size === 0) {
      for (const type of ['pointerdown', 'touchstart', 'click', 'keydown']) {
        document.removeEventListener(type, unlock, true);
      }
      unlockListenersInstalled = false;
    }
  };

  for (const type of ['pointerdown', 'touchstart', 'click', 'keydown']) {
    document.addEventListener(type, unlock, true);
  }
}

function removeRemoteAudio(peerId: string) {
  const audio = remoteAudio.get(peerId);
  if (!audio) return;
  pendingAudioUnlock.delete(audio);
  audio.pause();
  audio.srcObject = null;
  audio.remove();
  remoteAudio.delete(peerId);
}

function findExistingAudioElement(stream: MediaStream): HTMLAudioElement | null {
  const elements = Array.from(document.querySelectorAll('audio'));
  for (const element of elements) {
    if ((element as HTMLAudioElement).srcObject === stream) {
      return element as HTMLAudioElement;
    }
  }
  return null;
}

function ensureRemoteAudio(peerId: string, stream: MediaStream) {
  const hasAudio = stream.getAudioTracks().length > 0;
  const hasVideo = stream.getVideoTracks().length > 0;
  if (!hasAudio || hasVideo) {
    if (hasVideo) removeRemoteAudio(peerId);
    return;
  }

  const existing = findExistingAudioElement(stream);
  const audio = existing ?? remoteAudio.get(peerId) ?? document.createElement('audio');

  if (!existing && !remoteAudio.has(peerId)) {
    audio.setAttribute('aria-hidden', 'true');
    audio.style.position = 'fixed';
    audio.style.width = '1px';
    audio.style.height = '1px';
    audio.style.opacity = '0';
    audio.style.pointerEvents = 'none';
    audio.style.left = '-10px';
    audio.style.top = '-10px';
    document.body.appendChild(audio);
  }

  audio.srcObject = stream;
  audio.volume = 1;
  audio.muted = false;
  audio.autoplay = true;
  audio.playsInline = true;
  remoteAudio.set(peerId, audio);
  retryAudioPlayback(audio);
}

function watchRemoteStream(peerId: string, stream: MediaStream) {
  ensureRemoteAudio(peerId, stream);
  const reconcile = () => ensureRemoteAudio(peerId, stream);
  stream.addEventListener('addtrack', reconcile);
  stream.addEventListener('removetrack', reconcile);
}

function getPc(peerId: string) {
  return manager.peerConnections?.get(peerId);
}

async function flushPendingIce(peerId: string) {
  const pc = getPc(peerId);
  const candidates = pendingIce.get(peerId);
  if (!pc || !pc.remoteDescription || !candidates?.length) return;

  pendingIce.delete(peerId);
  for (const candidate of candidates) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.warn('Failed to apply queued ICE candidate:', error);
    }
  }
}

manager.handleSignalingMessage = async (msg: SignalingMessage) => {
  const peerId = msg.fromUserId;
  if (!peerId) return;

  if (msg.type === 'webrtc-ice') {
    const candidate = msg.payload?.candidate;
    if (!candidate) return;

    const pc = getPc(peerId);
    if (!pc || !pc.remoteDescription) {
      const queue = pendingIce.get(peerId) ?? [];
      queue.push(candidate);
      pendingIce.set(peerId, queue);
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.warn('Failed to apply ICE candidate:', error);
    }
    return;
  }

  await originalHandle(msg);
  if (msg.type === 'webrtc-offer' || msg.type === 'webrtc-answer') {
    await flushPendingIce(peerId);
  }
};

manager.setEvents = (events) => {
  originalSetEvents({
    ...events,
    onRemoteStream: (peerId, stream, type) => {
      events.onRemoteStream(peerId, stream, type);
      if (type === 'cam') {
        window.setTimeout(() => watchRemoteStream(peerId, stream), 80);
      }
    },
    onRemoteStreamRemoved: (peerId, type) => {
      events.onRemoteStreamRemoved(peerId, type);
      if (type === 'cam') removeRemoteAudio(peerId);
    },
  });
};

const originalCreatePeerConnection = manager.createPeerConnection.bind(manager);
manager.createPeerConnection = (peerId: string, isInitiator: boolean) => {
  const pc = originalCreatePeerConnection(peerId, isInitiator);
  void flushPendingIce(peerId);
  return pc;
};

const originalRemovePeer = manager.removePeer.bind(manager);
manager.removePeer = (peerId: string) => {
  pendingIce.delete(peerId);
  removeRemoteAudio(peerId);
  originalRemovePeer(peerId);
};
