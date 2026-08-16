export type RoomMode = 'BROWSE' | 'SCREEN_SHARE' | 'CAMERAS' | 'VIDEO';

export interface Participant {
  id: string;
  name: string;
  avatarColor: string;
  isHost: boolean;
  isController: boolean;
  hasRequestedControl: boolean;
  isMicOn: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  isSpeaking: boolean;
  volume: number; // 0 to 1
  joinedAt: number;
}

export type BrowserEventType =
  | 'NAVIGATE'
  | 'BACK'
  | 'FORWARD'
  | 'RELOAD'
  | 'SCROLL'
  | 'MEDIA_PLAY'
  | 'MEDIA_PAUSE'
  | 'MEDIA_SEEK';

export type BrowserEvent =
  | { type: 'NAVIGATE'; url: string; title?: string }
  | { type: 'BACK' }
  | { type: 'FORWARD' }
  | { type: 'RELOAD' }
  | { type: 'SCROLL'; x: number; y: number }
  | { type: 'MEDIA_PLAY'; position: number; serverTime: number }
  | { type: 'MEDIA_PAUSE'; position: number }
  | { type: 'MEDIA_SEEK'; position: number };

export interface SharedBrowserState {
  url: string;
  title: string;
  history: string[];
  historyIndex: number;
  scrollX: number;
  scrollY: number;
  controllerId: string;
  controllerName: string;
  isEmbeddable: boolean;
  lastUpdated: number;
}

export interface SharedVideoState {
  url: string;
  mediaType: 'youtube' | 'direct' | 'embed';
  isPlaying: boolean;
  position: number;
  serverTime: number;
  playbackRate: number;
  title: string;
  duration?: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderColor: string;
  text: string;
  timestamp: number;
  type: 'chat' | 'system' | 'reaction';
}

export interface RoomState {
  id: string;
  name: string;
  hostId: string;
  mode: RoomMode;
  participants: Record<string, Participant>;
  browserState: SharedBrowserState;
  videoState: SharedVideoState;
  activeScreenSharerId: string | null;
  activeScreenSharerName: string | null;
  pendingControlRequest: { userId: string; userName: string } | null;
  createdAt: number;
}

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface WebRTCDiagnostics {
  stunStatus: 'available' | 'checking' | 'failed';
  turnStatus: 'configured' | 'unconfigured' | 'active';
  iceGatheringState: RTCIceGatheringState | string;
  iceConnectionState: RTCIceConnectionState | string;
  peerConnectionState: RTCPeerConnectionState | string;
  activePeerCount: number;
  lastIceServerRefresh: number;
  serverUrl?: string;
}

export interface SignalingMessage {
  type:
    | 'join'
    | 'leave'
    | 'room-state'
    | 'user-joined'
    | 'user-left'
    | 'user-updated'
    | 'mode-change'
    | 'browser-event'
    | 'video-event'
    | 'request-control'
    | 'respond-control'
    | 'chat-message'
    | 'webrtc-offer'
    | 'webrtc-answer'
    | 'webrtc-ice'
    | 'time-sync-req'
    | 'time-sync-res'
    | 'reaction'
    | 'ping'
    | 'pong';
  payload?: any;
  roomId?: string;
  userId?: string;
  toUserId?: string;
  fromUserId?: string;
  timestamp?: number;
  clientTimestamp?: number;
  serverTimestamp?: number;
}
