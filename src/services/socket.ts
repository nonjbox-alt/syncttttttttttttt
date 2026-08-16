import { SignalingMessage } from '../types.ts';

type MessageHandler = (message: SignalingMessage) => void;
type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';
type StatusHandler = (status: ConnectionStatus) => void;

class SocketService {
  private ws: WebSocket | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private statusHandlers: Set<StatusHandler> = new Set();
  private status: ConnectionStatus = 'disconnected';
  private pingInterval: any = null;
  private timeSyncInterval: any = null;
  private sseSource: EventSource | null = null;
  private isConnecting: boolean = false;
  private pendingJoinPayload: any = null;

  // NTP Time Synchronization State
  private serverTimeOffset: number = 0;
  private roundTripTime: number = 0;
  private currentUserId: string = '';
  private currentRoomId: string = '';

  constructor() {
    this.currentUserId = this.getOrCreateUserId();
  }

  private getOrCreateUserId(): string {
    let id = localStorage.getItem('syncroom_user_id');
    if (!id) {
      id = `user_${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem('syncroom_user_id', id);
    }
    return id;
  }

  public getUserId(): string {
    return this.currentUserId;
  }

  public get isConnected(): boolean {
    return this.status === 'connected';
  }

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  public connect(
    roomId?: string,
    userName?: string,
    isMicOn?: boolean,
    isCameraOn?: boolean
  ): Promise<boolean> {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      if (roomId && userName) {
        this.joinRoom(roomId, userName, { isMicOn, isCameraOn });
      }
      return Promise.resolve(true);
    }

    this.isConnecting = true;
    this.setStatus('connected'); // Optimistic status: Instant connected feel

    return new Promise((resolve) => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/ws`;

        this.ws = new WebSocket(wsUrl);

        const connectionTimer = setTimeout(() => {
          if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
            console.warn('WS timeout, activating SSE/REST fallback');
            this.fallbackToHttpSync(roomId, userName, isMicOn, isCameraOn);
            resolve(true);
          }
        }, 2500);

        this.ws.onopen = () => {
          clearTimeout(connectionTimer);
          this.isConnecting = false;
          this.setStatus('connected');
          this.startHeartbeat();
          this.syncClock();

          if (this.pendingJoinPayload) {
            this.send(this.pendingJoinPayload);
            this.pendingJoinPayload = null;
          } else if (roomId && userName) {
            this.joinRoom(roomId, userName, { isMicOn, isCameraOn });
          }
          resolve(true);
        };

        this.ws.onmessage = (event) => {
          try {
            const message: SignalingMessage = JSON.parse(event.data);
            this.handleIncomingMessage(message);
          } catch (e) {
            console.error('Failed to parse websocket message:', e);
          }
        };

        this.ws.onerror = (error) => {
          console.warn('WebSocket error, falling back to HTTP sync:', error);
          this.fallbackToHttpSync(roomId, userName, isMicOn, isCameraOn);
        };

        this.ws.onclose = () => {
          this.isConnecting = false;
          this.stopHeartbeat();
          this.fallbackToHttpSync(roomId, userName, isMicOn, isCameraOn);
        };
      } catch (err) {
        console.warn('WebSocket connection error:', err);
        this.fallbackToHttpSync(roomId, userName, isMicOn, isCameraOn);
        resolve(true);
      }
    });
  }

  private fallbackToHttpSync(
    roomId?: string,
    userName?: string,
    isMicOn?: boolean,
    isCameraOn?: boolean
  ) {
    const targetRoom = (roomId || this.currentRoomId || '').toUpperCase();
    if (!targetRoom) return;

    this.currentRoomId = targetRoom;
    this.setStatus('connected');

    // Connect SSE fallback if available
    if (!this.sseSource && typeof EventSource !== 'undefined') {
      try {
        const sseUrl = `/api/room/${targetRoom}/events?userId=${this.currentUserId}`;
        this.sseSource = new EventSource(sseUrl);

        this.sseSource.onmessage = (event) => {
          try {
            const msg: SignalingMessage = JSON.parse(event.data);
            this.handleIncomingMessage(msg);
          } catch {}
        };
      } catch (e) {
        console.warn('SSE setup warning:', e);
      }
    }

    // Join via REST API
    fetch(`/api/room/${targetRoom}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: userName?.trim() || `User ${this.currentUserId.substring(5)}`,
        userId: this.currentUserId,
        isMicOn: !!isMicOn,
        isCameraOn: !!isCameraOn,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.room) {
          this.handleIncomingMessage({
            type: 'room-state',
            payload: {
              room: data.room,
              messages: data.messages || [],
              currentUserId: this.currentUserId,
              serverTime: data.serverTime || Date.now(),
            },
          });
        }
      })
      .catch(() => {});
  }

  public joinRoom(
    roomId: string,
    name: string,
    mediaState?: { isMicOn?: boolean; isCameraOn?: boolean }
  ) {
    const cleanRoomId = roomId.trim().toUpperCase();
    this.currentRoomId = cleanRoomId;

    const payload: SignalingMessage = {
      type: 'join',
      payload: {
        roomId: cleanRoomId,
        name: name.trim(),
        userId: this.currentUserId,
        isMicOn: mediaState?.isMicOn ?? false,
        isCameraOn: mediaState?.isCameraOn ?? false,
      },
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send(payload);
    } else {
      this.pendingJoinPayload = payload;
      fetch(`/api/room/${cleanRoomId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          userId: this.currentUserId,
          isMicOn: mediaState?.isMicOn ?? false,
          isCameraOn: mediaState?.isCameraOn ?? false,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.room) {
            this.handleIncomingMessage({
              type: 'room-state',
              payload: {
                room: data.room,
                messages: data.messages || [],
                currentUserId: this.currentUserId,
                serverTime: data.serverTime || Date.now(),
              },
            });
          }
        })
        .catch(() => {});
    }
  }

  public send(message: SignalingMessage) {
    const payload = {
      ...message,
      timestamp: Date.now(),
      fromUserId: this.currentUserId,
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(payload));
      } catch {
        this.sendViaRest(payload);
      }
    } else {
      this.sendViaRest(payload);
    }
  }

  private sendViaRest(message: SignalingMessage) {
    if (!this.currentRoomId) return;
    fetch(`/api/room/${this.currentRoomId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        userId: this.currentUserId,
      }),
    }).catch(() => {});
  }

  private handleIncomingMessage(message: SignalingMessage) {
    if (message.type === 'pong') return;

    if (message.type === 'time-sync-res') {
      const now = Date.now();
      const clientReqTime = message.clientTimestamp || now;
      const serverTime = message.serverTimestamp || now;
      this.roundTripTime = Math.max(1, now - clientReqTime);
      const estimatedServerNow = serverTime + this.roundTripTime / 2;
      this.serverTimeOffset = estimatedServerNow - now;
      return;
    }

    this.messageHandlers.forEach((handler) => {
      try {
        handler(message);
      } catch (err) {
        console.error('Error in message handler:', err);
      }
    });
  }

  public getSyncedServerTime(): number {
    return Date.now() + this.serverTimeOffset;
  }

  public getServerTimeOffset(): number {
    return this.serverTimeOffset;
  }

  public getRoundTripTime(): number {
    return this.roundTripTime;
  }

  public syncClock() {
    this.send({
      type: 'time-sync-req',
      clientTimestamp: Date.now(),
    });
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      }
    }, 15000);

    this.timeSyncInterval = setInterval(() => {
      this.syncClock();
    }, 30000);
  }

  private stopHeartbeat() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.timeSyncInterval) clearInterval(this.timeSyncInterval);
    this.pingInterval = null;
    this.timeSyncInterval = null;
  }

  public subscribe(handler: MessageHandler) {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  public set onConnectionChange(handler: StatusHandler) {
    this.statusHandlers.clear();
    this.statusHandlers.add(handler);
    handler(this.status);
  }

  private setStatus(newStatus: ConnectionStatus) {
    this.status = newStatus;
    this.statusHandlers.forEach((handler) => handler(newStatus));
  }

  public disconnect() {
    this.stopHeartbeat();
    if (this.sseSource) {
      this.sseSource.close();
      this.sseSource = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected');
  }
}

export const socketService = new SocketService();
