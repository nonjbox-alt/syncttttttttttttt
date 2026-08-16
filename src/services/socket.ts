import { SignalingMessage, IceServerConfig } from '../types.ts';

type MessageHandler = (msg: SignalingMessage) => void;

class SocketService {
  private ws: WebSocket | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private reconnectTimer: any = null;
  private pingInterval: any = null;
  private roomId: string | null = null;
  private userName: string | null = null;
  private isMicOn: boolean = false;
  private isCameraOn: boolean = false;
  private shouldReconnect: boolean = true;
  private serverTimeOffset: number = 0; // serverTime - localTime

  public isConnected: boolean = false;
  public onConnectionChange: ((status: 'connected' | 'connecting' | 'disconnected' | 'reconnecting') => void) | null = null;

  public connect(roomId: string, name: string, isMicOn: boolean, isCameraOn: boolean) {
    this.roomId = roomId.toUpperCase();
    this.userName = name;
    this.isMicOn = isMicOn;
    this.isCameraOn = isCameraOn;
    this.shouldReconnect = true;

    this.initWebSocket();
  }

  private initWebSocket() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    this.onConnectionChange?.('connecting');

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.onConnectionChange?.('connected');
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }

        // Start ping & time sync
        this.startTimeSync();

        // Send Join message
        if (this.roomId && this.userName) {
          this.send({
            type: 'join',
            payload: {
              roomId: this.roomId,
              name: this.userName,
              isMicOn: this.isMicOn,
              isCameraOn: this.isCameraOn,
            },
          });
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: SignalingMessage = JSON.parse(event.data);

          if (msg.type === 'time-sync-res') {
            const now = Date.now();
            const clientSent = msg.clientTimestamp || now;
            const roundTrip = now - clientSent;
            const estimatedServerNow = (msg.serverTimestamp || now) + roundTrip / 2;
            this.serverTimeOffset = estimatedServerNow - now;
            return;
          }

          this.messageHandlers.forEach((handler) => handler(msg));
        } catch (e) {
          console.error('Failed to parse socket message:', e);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.stopPing();
        if (this.shouldReconnect) {
          this.onConnectionChange?.('reconnecting');
          this.scheduleReconnect();
        } else {
          this.onConnectionChange?.('disconnected');
        }
      };

      this.ws.onerror = (err) => {
        console.warn('WebSocket error:', err);
      };
    } catch (err) {
      console.error('Error initializing WebSocket:', err);
      this.scheduleReconnect();
    }
  }

  private startTimeSync() {
    this.stopPing();
    // Send initial time sync ping
    this.sendTimeSync();

    this.pingInterval = setInterval(() => {
      this.send({ type: 'ping', timestamp: Date.now() });
      this.sendTimeSync();
    }, 10000);
  }

  private sendTimeSync() {
    this.send({
      type: 'time-sync-req',
      timestamp: Date.now(),
    });
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect) {
        console.log('Attempting WebSocket reconnect...');
        this.initWebSocket();
      }
    }, 2500);
  }

  public send(msg: SignalingMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public subscribe(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  public getSyncedServerTime(): number {
    return Date.now() + this.serverTimeOffset;
  }

  public disconnect() {
    this.shouldReconnect = false;
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.isConnected = false;
    this.onConnectionChange?.('disconnected');
  }
}

export const socketService = new SocketService();
