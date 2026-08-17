import { SignalingMessage } from '../types.ts';

type MessageHandler = (message: SignalingMessage) => void;
export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';
export type TransportType = 'websocket' | 'sse' | 'http' | 'none';
type StatusHandler = (status: ConnectionStatus, transport: TransportType) => void;

class SocketService {
  private ws: WebSocket | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private statusHandlers: Set<StatusHandler> = new Set();
  private status: ConnectionStatus = 'disconnected';
  private transport: TransportType = 'none';
  private pingInterval: any = null;
  private timeSyncInterval: any = null;
  private reconnectTimeout: any = null;
  private sseSource: EventSource | null = null;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private pendingJoinPayload: SignalingMessage | null = null;
  private currentUserId = '';
  private currentRoomId = '';
  private currentUserName = '';
  private currentMediaState: { isMicOn?: boolean; isCameraOn?: boolean } = {};
  private serverTimeOffset = 0;
  private roundTripTime = 0;

  constructor() {
    this.currentUserId = this.getOrCreateUserId();
  }

  private getOrCreateUserId(): string {
    try {
      let id = sessionStorage.getItem('syncroom_session_participant_id');
      if (!id) {
        id = `p_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36).substring(4)}`;
        sessionStorage.setItem('syncroom_session_participant_id', id);
      }
      return id;
    } catch {
      return `p_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36).substring(4)}`;
    }
  }

  public getUserId(): string {
    if (!this.currentUserId) this.currentUserId = this.getOrCreateUserId();
    return this.currentUserId;
  }

  public get isConnected(): boolean { return this.status === 'connected'; }
  public getStatus(): ConnectionStatus { return this.status; }
  public getTransport(): TransportType { return this.transport; }

  public connect(roomId?: string, userName?: string, isMicOn?: boolean, isCameraOn?: boolean): Promise<boolean> {
    if (roomId) this.currentRoomId = roomId.trim().toUpperCase();
    if (userName) this.currentUserName = userName.trim();
    if (isMicOn !== undefined || isCameraOn !== undefined) this.currentMediaState = { isMicOn, isCameraOn };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.joinRoom(this.currentRoomId, this.currentUserName, this.currentMediaState);
      return Promise.resolve(true);
    }
    if (this.isConnecting) return Promise.resolve(true);

    this.isConnecting = true;
    this.setStatus('reconnecting', 'none');

    return new Promise((resolve) => {
      try {
        if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = null;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/ws`;
        const ws = new WebSocket(wsUrl);
        this.ws = ws;

        const connectionTimer = setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            console.warn('WS connect timeout, activating HTTP/SSE fallback');
            this.isConnecting = false;
            this.fallbackToHttpSync();
            resolve(true);
          }
        }, 5000);

        ws.onopen = () => {
          clearTimeout(connectionTimer);
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.setStatus('connected', 'websocket');
          this.startHeartbeat();
          this.syncClock();
          if (this.currentRoomId && this.currentUserName) this.sendJoinMessage();
          else if (this.pendingJoinPayload) {
            this.send(this.pendingJoinPayload);
            this.pendingJoinPayload = null;
          }
          resolve(true);
        };

        ws.onmessage = (event) => {
          try { this.handleIncomingMessage(JSON.parse(event.data) as SignalingMessage); }
          catch (e) { console.error('Failed to parse websocket message:', e); }
        };

        ws.onerror = (error) => {
          console.warn('WebSocket connection error, activating HTTP sync:', error);
          clearTimeout(connectionTimer);
          if (this.isConnecting) {
            this.isConnecting = false;
            this.fallbackToHttpSync();
            resolve(true);
          }
        };

        ws.onclose = () => {
          this.isConnecting = false;
          this.stopHeartbeat();
          if (this.currentRoomId) {
            this.setStatus('reconnecting', 'none');
            this.scheduleReconnect();
          } else this.setStatus('disconnected', 'none');
        };
      } catch (err) {
        console.warn('WebSocket init exception:', err);
        this.isConnecting = false;
        this.fallbackToHttpSync();
        resolve(true);
      }
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 5000);
    this.reconnectAttempts++;
    this.reconnectTimeout = setTimeout(() => {
      if (this.currentRoomId) this.connect(this.currentRoomId, this.currentUserName, this.currentMediaState.isMicOn, this.currentMediaState.isCameraOn);
    }, delay);
  }

  private sendJoinMessage() {
    this.send({
      type: 'join',
      payload: {
        roomId: this.currentRoomId,
        name: this.currentUserName,
        userId: this.getUserId(),
        isMicOn: this.currentMediaState?.isMicOn ?? false,
        isCameraOn: this.currentMediaState?.isCameraOn ?? false,
      },
    });
  }

  private fallbackToHttpSync() {
    const targetRoom = this.currentRoomId;
    if (!targetRoom) return;
    this.setStatus('connected', 'http');

    if (!this.sseSource && typeof EventSource !== 'undefined') {
      try {
        const sseUrl = `/api/room/${targetRoom}/events?userId=${encodeURIComponent(this.getUserId())}`;
        this.sseSource = new EventSource(sseUrl);
        this.sseSource.onopen = () => this.setStatus('connected', 'sse');
        this.sseSource.onmessage = (event) => {
          try { this.handleIncomingMessage(JSON.parse(event.data) as SignalingMessage); } catch {}
        };
        this.sseSource.onerror = () => this.setStatus('connected', 'http');
      } catch (e) { console.warn('SSE setup warning:', e); }
    }

    fetch(`/api/room/${targetRoom}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: this.currentUserName || `User ${this.getUserId().substring(5)}`,
        userId: this.getUserId(),
        isMicOn: !!this.currentMediaState?.isMicOn,
        isCameraOn: !!this.currentMediaState?.isCameraOn,
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (data.room) this.handleIncomingMessage({ type: 'room-state', payload: { room: data.room, messages: data.messages || [], currentUserId: this.getUserId(), serverTime: data.serverTime || Date.now() } });
      })
      .catch((err) => console.warn('HTTP room join failed:', err));
  }

  public joinRoom(roomId: string, name: string, mediaState?: { isMicOn?: boolean; isCameraOn?: boolean }) {
    this.currentRoomId = roomId.trim().toUpperCase();
    this.currentUserName = name.trim();
    if (mediaState) this.currentMediaState = mediaState;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.sendJoinMessage();
    else this.connect(this.currentRoomId, this.currentUserName, mediaState?.isMicOn, mediaState?.isCameraOn);
  }

  public send(message: SignalingMessage) {
    const payload = { ...message, timestamp: Date.now(), fromUserId: this.getUserId() };
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try { this.ws.send(JSON.stringify(payload)); }
      catch { this.sendViaRest(payload); }
    } else this.sendViaRest(payload);
  }

  private sendViaRest(message: SignalingMessage) {
    if (!this.currentRoomId) return;
    fetch(`/api/room/${this.currentRoomId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, userId: this.getUserId() }),
    }).catch(() => {});
  }

  private handleIncomingMessage(message: SignalingMessage) {
    if (message.type === 'pong') return;
    if (message.type === 'time-sync-res') {
      const now = Date.now();
      const clientReqTime = message.clientTimestamp || now;
      const serverTime = message.serverTimestamp || now;
      this.roundTripTime = Math.max(1, now - clientReqTime);
      this.serverTimeOffset = serverTime + this.roundTripTime / 2 - now;
      return;
    }
    this.messageHandlers.forEach((handler) => { try { handler(message); } catch (err) { console.error('Error in message handler:', err); } });
  }

  public getSyncedServerTime(): number { return Date.now() + this.serverTimeOffset; }
  public getServerTimeOffset(): number { return this.serverTimeOffset; }
  public getRoundTripTime(): number { return this.roundTripTime; }

  public syncClock() { this.send({ type: 'time-sync-req', clientTimestamp: Date.now() }); }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
    }, 15000);
    this.timeSyncInterval = setInterval(() => this.syncClock(), 30000);
  }

  private stopHeartbeat() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.timeSyncInterval) clearInterval(this.timeSyncInterval);
    this.pingInterval = null;
    this.timeSyncInterval = null;
  }

  public subscribe(handler: MessageHandler) { this.messageHandlers.add(handler); return () => this.messageHandlers.delete(handler); }

  public set onConnectionChange(handler: StatusHandler) {
    this.statusHandlers.clear();
    this.statusHandlers.add(handler);
    handler(this.status, this.transport);
  }

  private setStatus(newStatus: ConnectionStatus, newTransport: TransportType) {
    this.status = newStatus;
    this.transport = newTransport;
    this.statusHandlers.forEach((handler) => handler(newStatus, newTransport));
  }

  public disconnect() {
    this.stopHeartbeat();
    if (this.reconnectTimeout) { clearTimeout(this.reconnectTimeout); this.reconnectTimeout = null; }
    if (this.sseSource) { this.sseSource.close(); this.sseSource = null; }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected', 'none');
  }
}

export const socketService = new SocketService();
