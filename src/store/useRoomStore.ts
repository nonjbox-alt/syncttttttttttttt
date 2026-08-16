import { create } from 'zustand';
import {
  RoomMode,
  Participant,
  SharedBrowserState,
  SharedVideoState,
  ChatMessage,
  BrowserEvent,
  WebRTCDiagnostics,
} from '../types.ts';
import { socketService } from '../services/socket.ts';
import { webrtcManager } from '../services/webrtc.ts';

interface RoomStoreState {
  // Connection & Identity
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
  roomId: string | null;
  currentUserId: string | null;
  currentUserName: string;
  isHost: boolean;
  isController: boolean;

  // Diagnostics
  diagnostics: WebRTCDiagnostics;

  // Room State
  mode: RoomMode;
  participants: Record<string, Participant>;
  browserState: SharedBrowserState;
  videoState: SharedVideoState;
  followHost: boolean;
  activeScreenSharerId: string | null;
  activeScreenSharerName: string | null;
  pendingControlRequest: { userId: string; userName: string } | null;

  // Chat & UI Panels
  chatMessages: ChatMessage[];
  unreadChatCount: number;
  isChatOpen: boolean;
  isParticipantsOpen: boolean;
  isSettingsOpen: boolean;

  // Media Controls
  isMicOn: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  isPushToTalk: boolean;
  pushToTalkActive: boolean;
  localCamStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  remoteCamStreams: Record<string, MediaStream>;
  remoteScreenStreams: Record<string, MediaStream>;

  // Settings
  selectedAudioDevice: string;
  selectedVideoDevice: string;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;

  // Floating Reactions
  floatingReactions: Array<{ id: string; emoji: string; senderName: string }>;

  // Actions
  setUserName: (name: string) => void;
  joinRoom: (roomId: string, name: string) => Promise<void>;
  leaveRoom: () => void;
  setMode: (mode: RoomMode) => void;
  toggleMic: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  flipCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  setPushToTalk: (enabled: boolean) => void;
  setPushToTalkActive: (active: boolean) => Promise<void>;
  setParticipantVolume: (userId: string, volume: number) => void;

  // Browser Actions
  navigateBrowser: (url: string, title?: string) => void;
  browserBack: () => void;
  browserForward: () => void;
  browserReload: () => void;
  browserScroll: (x: number, y: number) => void;
  setFollowHost: (follow: boolean) => void;
  requestControl: () => void;
  respondControl: (targetUserId: string, approved: boolean) => void;

  // Video Actions
  setVideoUrl: (url: string, mediaType?: 'youtube' | 'direct' | 'embed', title?: string) => void;
  playVideo: (position?: number) => void;
  pauseVideo: (position?: number) => void;
  seekVideo: (position: number) => void;
  setVideoPlaybackRate: (rate: number) => void;

  // Chat & Reactions
  sendChatMessage: (text: string) => void;
  sendReaction: (emoji: string) => void;
  toggleChat: () => void;
  toggleParticipants: () => void;
  toggleSettings: () => void;
  updateSettings: (settings: Partial<{
    selectedAudioDevice: string;
    selectedVideoDevice: string;
    echoCancellation: boolean;
    noiseSuppression: boolean;
    autoGainControl: boolean;
  }>) => void;
}

const initialBrowserState: SharedBrowserState = {
  url: 'https://en.wikipedia.org/wiki/Main_Page',
  title: 'Wikipedia, the free encyclopedia',
  history: ['https://en.wikipedia.org/wiki/Main_Page'],
  historyIndex: 0,
  scrollX: 0,
  scrollY: 0,
  controllerId: '',
  controllerName: '',
  isEmbeddable: true,
  lastUpdated: Date.now(),
};

const initialVideoState: SharedVideoState = {
  url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  mediaType: 'direct',
  isPlaying: false,
  position: 0,
  serverTime: Date.now(),
  playbackRate: 1,
  title: 'Big Buck Bunny (Sample HD)',
  duration: 596,
};

export const useRoomStore = create<RoomStoreState>((set, get) => ({
  connectionStatus: 'disconnected',
  roomId: null,
  currentUserId: null,
  currentUserName: localStorage.getItem('syncroom_username') || `User${Math.floor(1000 + Math.random() * 9000)}`,
  isHost: false,
  isController: false,

  mode: 'BROWSE',
  participants: {},
  browserState: initialBrowserState,
  videoState: initialVideoState,
  followHost: true,
  activeScreenSharerId: null,
  activeScreenSharerName: null,
  pendingControlRequest: null,

  chatMessages: [],
  unreadChatCount: 0,
  isChatOpen: false,
  isParticipantsOpen: false,
  isSettingsOpen: false,

  diagnostics: webrtcManager.getDiagnostics(),

  isMicOn: false,
  isCameraOn: false,
  isScreenSharing: false,
  isPushToTalk: false,
  pushToTalkActive: false,
  localCamStream: null,
  localScreenStream: null,
  remoteCamStreams: {},
  remoteScreenStreams: {},

  selectedAudioDevice: '',
  selectedVideoDevice: '',
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,

  floatingReactions: [],

  setUserName: (name: string) => {
    localStorage.setItem('syncroom_username', name);
    set({ currentUserName: name });
  },

  joinRoom: async (roomId: string, name: string) => {
    const cleanRoomId = roomId.trim().toUpperCase();
    const cleanName = name.trim() || `User${Math.floor(1000 + Math.random() * 9000)}`;

    localStorage.setItem('syncroom_username', cleanName);
    set({
      roomId: cleanRoomId,
      currentUserName: cleanName,
      connectionStatus: 'connecting',
      chatMessages: [],
      participants: {},
      remoteCamStreams: {},
      remoteScreenStreams: {},
    });

    // Setup WebRTC callbacks
    webrtcManager.setEvents({
      onRemoteStream: (peerId, stream, type) => {
        if (type === 'screen') {
          set((state) => ({
            remoteScreenStreams: { ...state.remoteScreenStreams, [peerId]: stream },
          }));
        } else {
          set((state) => ({
            remoteCamStreams: { ...state.remoteCamStreams, [peerId]: stream },
          }));
        }
      },
      onRemoteStreamRemoved: (peerId, type) => {
        if (type === 'screen') {
          set((state) => {
            const next = { ...state.remoteScreenStreams };
            delete next[peerId];
            return { remoteScreenStreams: next };
          });
        } else {
          set((state) => {
            const next = { ...state.remoteCamStreams };
            delete next[peerId];
            return { remoteCamStreams: next };
          });
        }
      },
      onLocalSpeakingChange: (isSpeaking) => {
        const { currentUserId, isMicOn } = get();
        if (currentUserId) {
          socketService.send({
            type: 'user-updated',
            payload: { isSpeaking: isMicOn && isSpeaking },
          });
          set((state) => {
            if (state.currentUserId && state.participants[state.currentUserId]) {
              return {
                participants: {
                  ...state.participants,
                  [state.currentUserId]: {
                    ...state.participants[state.currentUserId],
                    isSpeaking: isMicOn && isSpeaking,
                  },
                },
              };
            }
            return state;
          });
        }
      },
      onDiagnosticsChange: (diagnostics) => {
        set({ diagnostics });
      },
    });

    // Connection change listener
    socketService.onConnectionChange = (status) => {
      set({ connectionStatus: status });
    };

    // Socket message listener
    socketService.subscribe((msg) => {
      const state = get();

      switch (msg.type) {
        case 'room-state': {
          const { room, currentUserId, messages } = msg.payload || {};
          if (room) {
            const isUserHost = room.hostId === currentUserId;
            const isUserController = room.browserState?.controllerId === currentUserId || isUserHost;

            set({
              currentUserId,
              isHost: isUserHost,
              isController: isUserController,
              mode: room.mode || 'BROWSE',
              participants: room.participants || {},
              browserState: room.browserState || initialBrowserState,
              videoState: room.videoState || initialVideoState,
              activeScreenSharerId: room.activeScreenSharerId || null,
              activeScreenSharerName: room.activeScreenSharerName || null,
              pendingControlRequest: room.pendingControlRequest || null,
              chatMessages: messages || [],
            });

            // Initialize WebRTC connections to existing users
            Object.keys(room.participants || {}).forEach((peerId) => {
              if (peerId !== currentUserId) {
                webrtcManager.createPeerConnection(peerId, true);
              }
            });
          }
          break;
        }

        case 'user-joined': {
          const participant: Participant = msg.payload?.participant;
          if (participant) {
            set((s) => ({
              participants: { ...s.participants, [participant.id]: participant },
            }));
            if (participant.id !== state.currentUserId) {
              webrtcManager.createPeerConnection(participant.id, false);
            }
          }
          break;
        }

        case 'user-left': {
          const { userId, newHostId, activeScreenSharerId } = msg.payload || {};
          if (userId) {
            webrtcManager.removePeer(userId);
            set((s) => {
              const nextParticipants = { ...s.participants };
              delete nextParticipants[userId];
              const isHostNow = newHostId === s.currentUserId;
              return {
                participants: nextParticipants,
                isHost: isHostNow || s.isHost,
                activeScreenSharerId: activeScreenSharerId !== undefined ? activeScreenSharerId : s.activeScreenSharerId,
              };
            });
          }
          break;
        }

        case 'user-updated': {
          const { userId, updates, activeScreenSharerId, activeScreenSharerName, mode } = msg.payload || {};
          if (userId && updates) {
            set((s) => {
              const current = s.participants[userId];
              if (!current) return s;
              return {
                participants: {
                  ...s.participants,
                  [userId]: { ...current, ...updates },
                },
                activeScreenSharerId: activeScreenSharerId !== undefined ? activeScreenSharerId : s.activeScreenSharerId,
                activeScreenSharerName: activeScreenSharerName !== undefined ? activeScreenSharerName : s.activeScreenSharerName,
                mode: mode || s.mode,
              };
            });
          }
          break;
        }

        case 'mode-change': {
          if (msg.payload?.mode) {
            set({ mode: msg.payload.mode });
          }
          break;
        }

        case 'browser-event': {
          const { browserState, event, fromUserId } = msg.payload || {};
          if (browserState) {
            const shouldApply = state.followHost || fromUserId === state.currentUserId;
            if (shouldApply) {
              set({ browserState });
            }
          }
          break;
        }

        case 'video-event': {
          const { videoState } = msg.payload || {};
          if (videoState) {
            set({ videoState });
          }
          break;
        }

        case 'request-control': {
          const { userId, userName } = msg.payload || {};
          if (state.isHost) {
            set({ pendingControlRequest: { userId, userName } });
          }
          break;
        }

        case 'respond-control': {
          const { approved } = msg.payload || {};
          if (approved !== undefined) {
            set((s) => ({
              isController: approved,
              pendingControlRequest: null,
            }));
          }
          break;
        }

        case 'chat-message': {
          const message: ChatMessage = msg.payload?.message;
          if (message) {
            set((s) => ({
              chatMessages: [...s.chatMessages, message],
              unreadChatCount: s.isChatOpen ? 0 : s.unreadChatCount + 1,
            }));
          }
          break;
        }

        case 'reaction': {
          const { emoji, senderName, id } = msg.payload || {};
          if (emoji) {
            set((s) => ({
              floatingReactions: [...s.floatingReactions, { id, emoji, senderName }],
            }));
            setTimeout(() => {
              set((s) => ({
                floatingReactions: s.floatingReactions.filter((r) => r.id !== id),
              }));
            }, 3500);
          }
          break;
        }

        case 'webrtc-offer':
        case 'webrtc-answer':
        case 'webrtc-ice': {
          webrtcManager.handleSignalingMessage(msg);
          break;
        }
      }
    });

    // Connect socket
    socketService.connect(cleanRoomId, cleanName, get().isMicOn, get().isCameraOn);
  },

  leaveRoom: () => {
    webrtcManager.cleanup();
    socketService.disconnect();
    set({
      roomId: null,
      connectionStatus: 'disconnected',
      isHost: false,
      isController: false,
      isMicOn: false,
      isCameraOn: false,
      isScreenSharing: false,
      localCamStream: null,
      localScreenStream: null,
      remoteCamStreams: {},
      remoteScreenStreams: {},
      chatMessages: [],
      participants: {},
    });
  },

  setMode: (mode: RoomMode) => {
    set({ mode });
    socketService.send({
      type: 'mode-change',
      payload: { mode },
    });
  },

  toggleMic: async () => {
    const { isMicOn } = get();
    const nextState = !isMicOn;
    const success = await webrtcManager.setAudioEnabled(nextState);
    if (success || !nextState) {
      set({
        isMicOn: nextState,
        localCamStream: webrtcManager.getLocalCamStream(),
      });
      socketService.send({
        type: 'user-updated',
        payload: { isMicOn: nextState },
      });
    }
  },

  toggleCamera: async () => {
    const { isCameraOn } = get();
    const nextState = !isCameraOn;
    const success = await webrtcManager.setVideoEnabled(nextState);
    if (success || !nextState) {
      set({
        isCameraOn: nextState,
        localCamStream: webrtcManager.getLocalCamStream(),
      });
      socketService.send({
        type: 'user-updated',
        payload: { isCameraOn: nextState },
      });
    }
  },

  flipCamera: async () => {
    const success = await webrtcManager.flipCamera();
    if (success) {
      set({ localCamStream: webrtcManager.getLocalCamStream() });
    }
  },

  toggleScreenShare: async () => {
    const { isScreenSharing } = get();
    if (isScreenSharing) {
      webrtcManager.stopScreenShare();
      set({
        isScreenSharing: false,
        localScreenStream: null,
      });
      socketService.send({
        type: 'user-updated',
        payload: { isScreenSharing: false },
      });
    } else {
      const stream = await webrtcManager.startScreenShare();
      if (stream) {
        set({
          isScreenSharing: true,
          localScreenStream: stream,
          mode: 'SCREEN_SHARE',
        });
        socketService.send({
          type: 'user-updated',
          payload: { isScreenSharing: true },
        });

        // Watch for stream termination
        stream.getVideoTracks()[0].onended = () => {
          set({
            isScreenSharing: false,
            localScreenStream: null,
          });
          socketService.send({
            type: 'user-updated',
            payload: { isScreenSharing: false },
          });
        };
      }
    }
  },

  setPushToTalk: (enabled: boolean) => {
    set({ isPushToTalk: enabled });
    if (enabled && get().isMicOn) {
      webrtcManager.setAudioEnabled(false);
      set({ isMicOn: false });
    }
  },

  setPushToTalkActive: async (active: boolean) => {
    const { isPushToTalk } = get();
    if (!isPushToTalk) return;

    set({ pushToTalkActive: active });
    await webrtcManager.setAudioEnabled(active);
    set({ isMicOn: active });
    socketService.send({
      type: 'user-updated',
      payload: { isMicOn: active },
    });
  },

  setParticipantVolume: (userId: string, volume: number) => {
    set((state) => {
      const participant = state.participants[userId];
      if (!participant) return state;
      return {
        participants: {
          ...state.participants,
          [userId]: { ...participant, volume },
        },
      };
    });
  },

  // --- BROWSER ACTIONS ---

  navigateBrowser: async (url: string, title?: string) => {
    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      if (cleanUrl.includes('.') && !cleanUrl.includes(' ')) {
        cleanUrl = `https://${cleanUrl}`;
      } else {
        cleanUrl = `https://www.bing.com/search?q=${encodeURIComponent(cleanUrl)}`;
      }
    }

    const event: BrowserEvent = {
      type: 'NAVIGATE',
      url: cleanUrl,
      title: title || cleanUrl,
    };

    socketService.send({
      type: 'browser-event',
      payload: { event },
    });
  },

  browserBack: () => {
    socketService.send({
      type: 'browser-event',
      payload: { event: { type: 'BACK' } },
    });
  },

  browserForward: () => {
    socketService.send({
      type: 'browser-event',
      payload: { event: { type: 'FORWARD' } },
    });
  },

  browserReload: () => {
    socketService.send({
      type: 'browser-event',
      payload: { event: { type: 'RELOAD' } },
    });
  },

  browserScroll: (x: number, y: number) => {
    socketService.send({
      type: 'browser-event',
      payload: { event: { type: 'SCROLL', x, y } },
    });
  },

  setFollowHost: (follow: boolean) => {
    set({ followHost: follow });
  },

  requestControl: () => {
    socketService.send({ type: 'request-control' });
  },

  respondControl: (targetUserId: string, approved: boolean) => {
    socketService.send({
      type: 'respond-control',
      payload: { targetUserId, approved },
    });
    set({ pendingControlRequest: null });
  },

  // --- VIDEO ACTIONS ---

  setVideoUrl: (url: string, mediaType?: 'youtube' | 'direct' | 'embed', title?: string) => {
    let detectedType: 'youtube' | 'direct' | 'embed' = mediaType || 'direct';
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      detectedType = 'youtube';
    }

    socketService.send({
      type: 'video-event',
      payload: {
        action: 'PLAY',
        url,
        mediaType: detectedType,
        title: title || 'Shared Video',
        position: 0,
        isPlaying: true,
      },
    });
    set({ mode: 'VIDEO' });
  },

  playVideo: (position?: number) => {
    socketService.send({
      type: 'video-event',
      payload: {
        action: 'PLAY',
        position,
      },
    });
  },

  pauseVideo: (position?: number) => {
    socketService.send({
      type: 'video-event',
      payload: {
        action: 'PAUSE',
        position,
      },
    });
  },

  seekVideo: (position: number) => {
    socketService.send({
      type: 'video-event',
      payload: {
        action: 'SEEK',
        position,
      },
    });
  },

  setVideoPlaybackRate: (rate: number) => {
    socketService.send({
      type: 'video-event',
      payload: {
        action: 'PLAY',
        playbackRate: rate,
      },
    });
  },

  // --- CHAT & UI ---

  sendChatMessage: (text: string) => {
    if (!text.trim()) return;
    socketService.send({
      type: 'chat-message',
      payload: { text: text.trim() },
    });
  },

  sendReaction: (emoji: string) => {
    socketService.send({
      type: 'reaction',
      payload: { emoji },
    });
  },

  toggleChat: () => {
    set((s) => ({
      isChatOpen: !s.isChatOpen,
      unreadChatCount: !s.isChatOpen ? 0 : s.unreadChatCount,
      isParticipantsOpen: false,
    }));
  },

  toggleParticipants: () => {
    set((s) => ({
      isParticipantsOpen: !s.isParticipantsOpen,
      isChatOpen: false,
    }));
  },

  toggleSettings: () => {
    set((s) => ({ isSettingsOpen: !s.isSettingsOpen }));
  },

  updateSettings: (settings) => {
    set((s) => ({ ...s, ...settings }));
  },
}));
