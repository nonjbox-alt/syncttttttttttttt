import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import {
  RoomState,
  Participant,
  SignalingMessage,
  BrowserEvent,
  SharedBrowserState,
  SharedVideoState,
  ChatMessage,
  IceServerConfig,
} from './src/types.ts';

dotenv.config();

const PORT = 3000;
const HOST = '0.0.0.0';

const AVATAR_COLORS = [
  '#38bdf8', // Sky
  '#818cf8', // Indigo
  '#f472b6', // Pink
  '#34d399', // Emerald
  '#fbbf24', // Amber
  '#a78bfa', // Purple
  '#fb7185', // Rose
  '#2dd4bf', // Teal
];

function getRandomColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

interface ClientConnection {
  ws?: WebSocket;
  sseRes?: Response;
  userId: string;
  roomId: string | null;
  name: string;
}

// In-memory server-authoritative store
const rooms = new Map<string, RoomState>();
const wsClients = new Map<WebSocket, ClientConnection>();
const allClients = new Map<string, ClientConnection>(); // keyed by userId
const sseClients = new Map<string, Set<Response>>(); // keyed by roomId
const chatHistories = new Map<string, ChatMessage[]>();

function getOrCreateRoom(roomId: string, hostUserId: string, hostName: string): RoomState {
  const cleanId = roomId.toUpperCase();
  let room = rooms.get(cleanId);
  if (!room) {
    const initialBrowserState: SharedBrowserState = {
      url: 'https://en.wikipedia.org/wiki/Main_Page',
      title: 'Wikipedia, the free encyclopedia',
      history: ['https://en.wikipedia.org/wiki/Main_Page'],
      historyIndex: 0,
      scrollX: 0,
      scrollY: 0,
      controllerId: hostUserId,
      controllerName: hostName,
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

    room = {
      id: cleanId,
      name: `Room ${cleanId}`,
      hostId: hostUserId,
      mode: 'BROWSE',
      participants: {},
      browserState: initialBrowserState,
      videoState: initialVideoState,
      activeScreenSharerId: null,
      activeScreenSharerName: null,
      pendingControlRequest: null,
      createdAt: Date.now(),
    };

    rooms.set(cleanId, room);
    chatHistories.set(cleanId, [
      {
        id: `sys-${Date.now()}`,
        senderId: 'system',
        senderName: 'System',
        senderColor: '#94a3b8',
        text: `Room ${cleanId} created. Welcome to SyncRoom!`,
        timestamp: Date.now(),
        type: 'system',
      },
    ]);
  }
  return room;
}

function broadcastToRoom(roomId: string, message: SignalingMessage, excludeWs?: WebSocket) {
  const cleanId = roomId.toUpperCase();
  const data = JSON.stringify(message);

  // 1. Broadcast via WebSocket
  for (const [ws, client] of wsClients.entries()) {
    if (client.roomId === cleanId && ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(data);
      } catch (err) {
        console.error('Error broadcasting WS message to client:', err);
      }
    }
  }

  // 2. Broadcast via SSE fallback
  const sseSet = sseClients.get(cleanId);
  if (sseSet && sseSet.size > 0) {
    const sseFormatted = `data: ${data}\n\n`;
    for (const res of sseSet) {
      try {
        res.write(sseFormatted);
      } catch {
        sseSet.delete(res);
      }
    }
  }
}

function sendToUser(toUserId: string, message: SignalingMessage) {
  const data = JSON.stringify(message);

  // Send via WS if available
  for (const [ws, client] of wsClients.entries()) {
    if (client.userId === toUserId && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(data);
      } catch (err) {
        console.error('Error sending direct WS message:', err);
      }
      return;
    }
  }

  // Send via SSE if available
  const client = allClients.get(toUserId);
  if (client?.sseRes && !client.sseRes.writableEnded) {
    try {
      client.sseRes.write(`data: ${data}\n\n`);
    } catch {}
  }
}

function handleIncomingSignalingMessage(
  clientConn: ClientConnection,
  msg: SignalingMessage,
  replyWs?: WebSocket
) {
  switch (msg.type) {
    case 'ping': {
      if (replyWs && replyWs.readyState === WebSocket.OPEN) {
        replyWs.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      }
      break;
    }

    case 'time-sync-req': {
      const response = JSON.stringify({
        type: 'time-sync-res',
        clientTimestamp: msg.timestamp || msg.clientTimestamp || Date.now(),
        serverTimestamp: Date.now(),
      });
      if (replyWs && replyWs.readyState === WebSocket.OPEN) {
        replyWs.send(response);
      } else if (clientConn.sseRes && !clientConn.sseRes.writableEnded) {
        clientConn.sseRes.write(`data: ${response}\n\n`);
      }
      break;
    }

    case 'join': {
      const { roomId, name, isMicOn, isCameraOn, userId } = msg.payload || {};
      if (!roomId) return;

      const cleanRoomId = roomId.trim().toUpperCase();
      if (userId) {
        clientConn.userId = userId;
      }
      clientConn.roomId = cleanRoomId;
      clientConn.name = name?.trim() || `User ${clientConn.userId.substring(5)}`;
      allClients.set(clientConn.userId, clientConn);

      const existingRoom = rooms.get(cleanRoomId);
      const isFirstUser = !existingRoom || Object.keys(existingRoom.participants).length === 0;

      const room = getOrCreateRoom(cleanRoomId, clientConn.userId, clientConn.name);

      const participant: Participant = {
        id: clientConn.userId,
        name: clientConn.name,
        avatarColor: getRandomColor(),
        isHost: isFirstUser || room.hostId === clientConn.userId,
        isController:
          isFirstUser ||
          room.hostId === clientConn.userId ||
          room.browserState.controllerId === clientConn.userId,
        hasRequestedControl: false,
        isMicOn: !!isMicOn,
        isCameraOn: !!isCameraOn,
        isScreenSharing: false,
        isSpeaking: false,
        volume: 1,
        joinedAt: Date.now(),
      };

      room.participants[clientConn.userId] = participant;

      const messages = chatHistories.get(cleanRoomId) || [];
      const statePayload = {
        type: 'room-state',
        payload: {
          room,
          currentUserId: clientConn.userId,
          messages,
          serverTime: Date.now(),
        },
      };

      // Send full room state to newly joining user
      if (replyWs && replyWs.readyState === WebSocket.OPEN) {
        replyWs.send(JSON.stringify(statePayload));
      } else if (clientConn.sseRes && !clientConn.sseRes.writableEnded) {
        clientConn.sseRes.write(`data: ${JSON.stringify(statePayload)}\n\n`);
      }

      // Broadcast join event to everyone else
      broadcastToRoom(
        cleanRoomId,
        {
          type: 'user-joined',
          payload: { participant },
        },
        replyWs
      );

      // System notification
      const joinMsg: ChatMessage = {
        id: `sys-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        senderId: 'system',
        senderName: 'System',
        senderColor: '#94a3b8',
        text: `${participant.name} joined the room.`,
        timestamp: Date.now(),
        type: 'system',
      };
      messages.push(joinMsg);
      broadcastToRoom(cleanRoomId, {
        type: 'chat-message',
        payload: { message: joinMsg },
      });
      break;
    }

    case 'user-updated': {
      if (!clientConn.roomId) return;
      const room = rooms.get(clientConn.roomId);
      if (!room) return;

      const participant = room.participants[clientConn.userId];
      if (participant && msg.payload) {
        Object.assign(participant, msg.payload);
        if (msg.payload.isScreenSharing !== undefined) {
          if (msg.payload.isScreenSharing) {
            room.activeScreenSharerId = participant.id;
            room.activeScreenSharerName = participant.name;
            room.mode = 'SCREEN_SHARE';
          } else if (room.activeScreenSharerId === participant.id) {
            room.activeScreenSharerId = null;
            room.activeScreenSharerName = null;
          }
        }
        broadcastToRoom(clientConn.roomId, {
          type: 'user-updated',
          payload: {
            userId: clientConn.userId,
            updates: msg.payload,
            activeScreenSharerId: room.activeScreenSharerId,
            activeScreenSharerName: room.activeScreenSharerName,
            mode: room.mode,
          },
        });
      }
      break;
    }

    case 'mode-change': {
      if (!clientConn.roomId) return;
      const room = rooms.get(clientConn.roomId);
      if (!room || !msg.payload?.mode) return;

      room.mode = msg.payload.mode;
      broadcastToRoom(clientConn.roomId, {
        type: 'mode-change',
        payload: { mode: room.mode },
      });
      break;
    }

    case 'browser-event': {
      if (!clientConn.roomId) return;
      const room = rooms.get(clientConn.roomId);
      if (!room) return;

      const event: BrowserEvent = msg.payload?.event;
      if (!event) return;

      switch (event.type) {
        case 'NAVIGATE': {
          room.browserState.url = event.url;
          if (event.title) room.browserState.title = event.title;
          room.browserState.history.push(event.url);
          room.browserState.historyIndex = room.browserState.history.length - 1;
          room.browserState.scrollX = 0;
          room.browserState.scrollY = 0;
          room.browserState.lastUpdated = Date.now();
          break;
        }
        case 'BACK': {
          if (room.browserState.historyIndex > 0) {
            room.browserState.historyIndex--;
            room.browserState.url = room.browserState.history[room.browserState.historyIndex];
          }
          break;
        }
        case 'FORWARD': {
          if (room.browserState.historyIndex < room.browserState.history.length - 1) {
            room.browserState.historyIndex++;
            room.browserState.url = room.browserState.history[room.browserState.historyIndex];
          }
          break;
        }
        case 'SCROLL': {
          room.browserState.scrollX = event.x;
          room.browserState.scrollY = event.y;
          break;
        }
      }

      broadcastToRoom(clientConn.roomId, {
        type: 'browser-event',
        payload: {
          event,
          browserState: room.browserState,
          fromUserId: clientConn.userId,
        },
      });
      break;
    }

    case 'video-event': {
      if (!clientConn.roomId) return;
      const room = rooms.get(clientConn.roomId);
      if (!room || !msg.payload) return;

      const { action, url, mediaType, position, isPlaying, playbackRate, title } = msg.payload;

      if (url) room.videoState.url = url;
      if (mediaType) room.videoState.mediaType = mediaType;
      if (title) room.videoState.title = title;
      if (playbackRate !== undefined) room.videoState.playbackRate = playbackRate;

      if (action === 'PLAY') {
        room.videoState.isPlaying = true;
        room.videoState.position = position ?? room.videoState.position;
        room.videoState.serverTime = Date.now();
      } else if (action === 'PAUSE') {
        room.videoState.isPlaying = false;
        room.videoState.position = position ?? room.videoState.position;
        room.videoState.serverTime = Date.now();
      } else if (action === 'SEEK') {
        room.videoState.position = position;
        room.videoState.serverTime = Date.now();
      }

      broadcastToRoom(clientConn.roomId, {
        type: 'video-event',
        payload: {
          action,
          videoState: room.videoState,
          fromUserId: clientConn.userId,
          serverTime: Date.now(),
        },
      });
      break;
    }

    case 'request-control': {
      if (!clientConn.roomId) return;
      const room = rooms.get(clientConn.roomId);
      if (!room) return;

      const requester = room.participants[clientConn.userId];
      if (!requester) return;

      room.pendingControlRequest = {
        userId: requester.id,
        userName: requester.name,
      };

      sendToUser(room.hostId, {
        type: 'request-control',
        payload: {
          userId: requester.id,
          userName: requester.name,
        },
      });

      broadcastToRoom(clientConn.roomId, {
        type: 'user-updated',
        payload: {
          userId: requester.id,
          updates: { hasRequestedControl: true },
        },
      });
      break;
    }

    case 'respond-control': {
      if (!clientConn.roomId) return;
      const room = rooms.get(clientConn.roomId);
      if (!room) return;

      const { approved, targetUserId } = msg.payload || {};
      room.pendingControlRequest = null;

      if (approved && targetUserId && room.participants[targetUserId]) {
        const target = room.participants[targetUserId];
        room.browserState.controllerId = target.id;
        room.browserState.controllerName = target.name;

        for (const p of Object.values(room.participants)) {
          p.isController = p.id === target.id;
          p.hasRequestedControl = false;
        }

        broadcastToRoom(clientConn.roomId, {
          type: 'room-state',
          payload: {
            room,
            serverTime: Date.now(),
          },
        });

        const controlMsg: ChatMessage = {
          id: `sys-${Date.now()}-${Math.random()}`,
          senderId: 'system',
          senderName: 'System',
          senderColor: '#38bdf8',
          text: `👑 ${target.name} is now controlling the shared browser.`,
          timestamp: Date.now(),
          type: 'system',
        };
        chatHistories.get(clientConn.roomId)?.push(controlMsg);
        broadcastToRoom(clientConn.roomId, {
          type: 'chat-message',
          payload: { message: controlMsg },
        });
      } else if (targetUserId && room.participants[targetUserId]) {
        room.participants[targetUserId].hasRequestedControl = false;
        sendToUser(targetUserId, {
          type: 'respond-control',
          payload: { approved: false },
        });
        broadcastToRoom(clientConn.roomId, {
          type: 'user-updated',
          payload: {
            userId: targetUserId,
            updates: { hasRequestedControl: false },
          },
        });
      }
      break;
    }

    case 'chat-message': {
      if (!clientConn.roomId) return;
      const room = rooms.get(clientConn.roomId);
      if (!room) return;

      const sender = room.participants[clientConn.userId];
      const message: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        senderId: clientConn.userId,
        senderName: sender?.name || clientConn.name,
        senderColor: sender?.avatarColor || '#38bdf8',
        text: msg.payload?.text || '',
        timestamp: Date.now(),
        type: msg.payload?.type || 'chat',
      };

      const history = chatHistories.get(clientConn.roomId) || [];
      history.push(message);
      if (history.length > 200) history.shift();

      broadcastToRoom(clientConn.roomId, {
        type: 'chat-message',
        payload: { message },
      });
      break;
    }

    case 'reaction': {
      if (!clientConn.roomId) return;
      broadcastToRoom(clientConn.roomId, {
        type: 'reaction',
        payload: {
          emoji: msg.payload?.emoji,
          senderName: clientConn.name,
          senderId: clientConn.userId,
          id: Math.random().toString(),
        },
      });
      break;
    }

    case 'webrtc-offer':
    case 'webrtc-answer':
    case 'webrtc-ice': {
      const { toUserId } = msg;
      if (toUserId) {
        sendToUser(toUserId, {
          ...msg,
          fromUserId: clientConn.userId,
        });
      }
      break;
    }
  }
}

function handleClientDisconnect(userId: string, roomId: string | null, name: string) {
  allClients.delete(userId);
  if (roomId) {
    const room = rooms.get(roomId);
    if (room && room.participants[userId]) {
      delete room.participants[userId];

      const remainingUsers = Object.values(room.participants);
      if (remainingUsers.length === 0) {
        setTimeout(() => {
          const current = rooms.get(roomId);
          if (current && Object.keys(current.participants).length === 0) {
            rooms.delete(roomId);
            chatHistories.delete(roomId);
            sseClients.delete(roomId);
          }
        }, 300000);
      } else {
        if (room.hostId === userId) {
          const newHost = remainingUsers[0];
          room.hostId = newHost.id;
          newHost.isHost = true;
          if (room.browserState.controllerId === userId) {
            room.browserState.controllerId = newHost.id;
            room.browserState.controllerName = newHost.name;
            newHost.isController = true;
          }
        }

        if (room.activeScreenSharerId === userId) {
          room.activeScreenSharerId = null;
          room.activeScreenSharerName = null;
        }

        broadcastToRoom(roomId, {
          type: 'user-left',
          payload: {
            userId,
            newHostId: room.hostId,
            activeScreenSharerId: room.activeScreenSharerId,
          },
        });

        const leaveMsg: ChatMessage = {
          id: `sys-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          senderId: 'system',
          senderName: 'System',
          senderColor: '#94a3b8',
          text: `${name} left the room.`,
          timestamp: Date.now(),
          type: 'system',
        };
        chatHistories.get(roomId)?.push(leaveMsg);
        broadcastToRoom(roomId, {
          type: 'chat-message',
          payload: { message: leaveMsg },
        });
      }
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // Generate ICE Servers with public STUN by default and ephemeral TURN credentials if configured
  const getIceServers = async (): Promise<IceServerConfig[]> => {
    // 1. Always include public STUN servers (Cloudflare & Google)
    const iceServers: IceServerConfig[] = [
      {
        urls: [
          'stun:stun.cloudflare.com:3478',
          'stun:stun.l.google.com:19302',
          'stun:stun1.l.google.com:19302',
        ],
      },
    ];

    // 2. Cloudflare Calls / TURN Token API (if configured server-side)
    if (process.env.TURN_KEY_ID && process.env.TURN_API_TOKEN) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2500);

        const cfRes = await fetch(
          `https://rtc.live.cloudflare.com/v1/turn/keys/${process.env.TURN_KEY_ID}/credentials/generate`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.TURN_API_TOKEN}`,
            },
            body: JSON.stringify({ ttl: 86400 }),
            signal: controller.signal,
          }
        );
        clearTimeout(timeout);

        if (cfRes.ok) {
          const cfData = await cfRes.json();
          if (cfData.iceServers?.urls) {
            iceServers.push({
              urls: cfData.iceServers.urls,
              username: cfData.iceServers.username,
              credential: cfData.iceServers.credential,
            });
          }
        }
      } catch (err) {
        console.warn('Failed to fetch ephemeral Cloudflare TURN credentials, falling back to STUN:', err);
      }
    }
    // 3. Standard Ephemeral HMAC-SHA1 TURN (RFC 5766 REST API style)
    else if (process.env.TURN_SECRET && process.env.TURN_SERVER) {
      try {
        const ttl = 86400; // 24 hours
        const expiry = Math.floor(Date.now() / 1000) + ttl;
        const username = `${expiry}:syncroom_user`;
        const credential = crypto
          .createHmac('sha1', process.env.TURN_SECRET)
          .update(username)
          .digest('base64');

        const turnUrls = process.env.TURN_SERVER.split(',').map((s) => s.trim());
        iceServers.push({
          urls: turnUrls,
          username,
          credential,
        });
      } catch (err) {
        console.warn('Error generating ephemeral TURN credentials:', err);
      }
    }
    // 4. Server-configured TURN (Direct self-hosted credentials)
    else if (process.env.TURN_SERVER) {
      const turnUrls = process.env.TURN_SERVER.split(',').map((s) => s.trim());
      iceServers.push({
        urls: turnUrls,
        username: process.env.TURN_USERNAME || undefined,
        credential: process.env.TURN_PASSWORD || undefined,
      });
    }

    return iceServers;
  };

  // Primary endpoint: /api/webrtc/ice-servers
  app.get('/api/webrtc/ice-servers', async (req: Request, res: Response) => {
    try {
      const iceServers = await getIceServers();
      res.json({ iceServers });
    } catch (e: any) {
      res.json({
        iceServers: [
          { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] },
        ],
      });
    }
  });

  // Backward compatible alias: /api/config/ice
  app.get('/api/config/ice', async (req: Request, res: Response) => {
    try {
      const iceServers = await getIceServers();
      res.json({ iceServers });
    } catch (e: any) {
      res.json({
        iceServers: [
          { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] },
        ],
      });
    }
  });

  // Server Time Endpoint for NTP-like precision sync
  app.get('/api/time', (req: Request, res: Response) => {
    res.json({ serverTime: Date.now() });
  });

  // REST API: Get Room State
  app.get('/api/room/:roomId/state', (req: Request, res: Response) => {
    const roomId = (req.params.roomId || '').toUpperCase();
    const room = rooms.get(roomId);
    const messages = chatHistories.get(roomId) || [];
    res.json({
      room: room || null,
      messages,
      serverTime: Date.now(),
    });
  });

  // REST API: Join / Create Room (Fallback)
  app.post('/api/room/:roomId/join', (req: Request, res: Response) => {
    const roomId = (req.params.roomId || '').toUpperCase();
    const { name, userId, isMicOn, isCameraOn } = req.body || {};
    const finalUserId = userId || `user_${Math.random().toString(36).substring(2, 9)}`;
    const finalName = name?.trim() || `User ${finalUserId.substring(5)}`;

    let clientConn = allClients.get(finalUserId);
    if (!clientConn) {
      clientConn = {
        userId: finalUserId,
        roomId,
        name: finalName,
      };
      allClients.set(finalUserId, clientConn);
    } else {
      clientConn.roomId = roomId;
      clientConn.name = finalName;
    }

    handleIncomingSignalingMessage(clientConn, {
      type: 'join',
      payload: { roomId, name: finalName, isMicOn, isCameraOn, userId: finalUserId },
    });

    const room = rooms.get(roomId);
    const messages = chatHistories.get(roomId) || [];

    res.json({
      success: true,
      room,
      userId: finalUserId,
      messages,
      serverTime: Date.now(),
    });
  });

  // REST API: Dispatch Room Action / Signaling (Fallback)
  app.post('/api/room/:roomId/action', (req: Request, res: Response) => {
    const roomId = (req.params.roomId || '').toUpperCase();
    const { message, userId } = req.body || {};
    if (!message) return res.status(400).json({ error: 'Missing message' });

    let clientConn = userId ? allClients.get(userId) : undefined;
    if (!clientConn) {
      clientConn = {
        userId: userId || `user_rest_${Math.random().toString(36).substring(2, 7)}`,
        roomId,
        name: 'User',
      };
      allClients.set(clientConn.userId, clientConn);
    }

    handleIncomingSignalingMessage(clientConn, message);
    res.json({ success: true, serverTime: Date.now() });
  });

  // SSE Fallback Stream for real-time room events
  app.get('/api/room/:roomId/events', (req: Request, res: Response) => {
    const roomId = (req.params.roomId || '').toUpperCase();
    const userId = (req.query.userId as string) || `user_${Math.random().toString(36).substring(2, 9)}`;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let clientConn = allClients.get(userId);
    if (!clientConn) {
      clientConn = {
        userId,
        roomId,
        name: 'Guest',
        sseRes: res,
      };
      allClients.set(userId, clientConn);
    } else {
      clientConn.sseRes = res;
      clientConn.roomId = roomId;
    }

    let sseSet = sseClients.get(roomId);
    if (!sseSet) {
      sseSet = new Set<Response>();
      sseClients.set(roomId, sseSet);
    }
    sseSet.add(res);

    // Send initial ping to keep-alive
    res.write(`data: ${JSON.stringify({ type: 'ping', serverTime: Date.now() })}\n\n`);

    const keepAlive = setInterval(() => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'ping', serverTime: Date.now() })}\n\n`);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseSet?.delete(res);
      if (clientConn && clientConn.sseRes === res) {
        clientConn.sseRes = undefined;
      }
    });
  });

  // Check URL embeddability and get title metadata
  app.get('/api/browse/check-embed', async (req: Request, res: Response) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    try {
      let parsed: URL;
      try {
        parsed = new URL(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`);
      } catch {
        return res.json({
          url: targetUrl,
          title: targetUrl,
          isEmbeddable: false,
          reason: 'Invalid URL format',
        });
      }

      const hostname = parsed.hostname.toLowerCase();

      const isEmbedAllowedHost =
        hostname.includes('wikipedia.org') ||
        hostname.includes('archive.org') ||
        hostname.includes('codepen.io') ||
        hostname.includes('jsfiddle.net') ||
        hostname.includes('w3schools.com') ||
        hostname.includes('bing.com') ||
        hostname.includes('duckduckgo.com') ||
        hostname.includes('openstreetmap.org') ||
        hostname.includes('stackblitz.com') ||
        hostname.includes('replit.com');

      const isKnownStrictHost =
        hostname.includes('youtube.com') ||
        hostname.includes('youtu.be') ||
        hostname.includes('google.com') ||
        hostname.includes('facebook.com') ||
        hostname.includes('twitter.com') ||
        hostname.includes('x.com') ||
        hostname.includes('netflix.com') ||
        hostname.includes('twitch.tv') ||
        hostname.includes('reddit.com') ||
        hostname.includes('github.com') ||
        hostname.includes('instagram.com') ||
        hostname.includes('amazon.com') ||
        hostname.includes('tiktok.com');

      if (isKnownStrictHost) {
        return res.json({
          url: parsed.href,
          title: hostname,
          isEmbeddable: false,
          suggestTabShare: true,
          reason: 'Protected by X-Frame-Options / CSP',
        });
      }

      if (isEmbedAllowedHost) {
        return res.json({
          url: parsed.href,
          title: hostname,
          isEmbeddable: true,
        });
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      try {
        const response = await fetch(parsed.href, {
          method: 'HEAD',
          signal: controller.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });
        clearTimeout(timeoutId);

        const xFrameOptions = response.headers.get('x-frame-options');
        const csp = response.headers.get('content-security-policy');

        let isEmbeddable = true;
        if (xFrameOptions) {
          const val = xFrameOptions.toLowerCase();
          if (val.includes('deny') || val.includes('sameorigin')) {
            isEmbeddable = false;
          }
        }
        if (
          csp &&
          (csp.includes("frame-ancestors 'none'") || csp.includes("frame-ancestors 'self'"))
        ) {
          isEmbeddable = false;
        }

        return res.json({
          url: parsed.href,
          title: hostname,
          isEmbeddable,
          suggestTabShare: !isEmbeddable,
        });
      } catch {
        clearTimeout(timeoutId);
        return res.json({
          url: parsed.href,
          title: hostname,
          isEmbeddable: true,
        });
      }
    } catch (e: any) {
      return res.json({
        url: targetUrl,
        title: targetUrl,
        isEmbeddable: false,
        suggestTabShare: true,
        reason: e.message,
      });
    }
  });

  const server = http.createServer(app);

  // Dedicated WebSocket Server with noServer: true for exact upgrade handling
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const pathname = request.url ? new URL(request.url, `http://${request.headers.host}`).pathname : '';
    // Handle websocket connections to /ws, /api/ws or /
    if (pathname === '/ws' || pathname === '/api/ws' || pathname === '/') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws: WebSocket) => {
    const clientConn: ClientConnection = {
      ws,
      userId: `user_${Math.random().toString(36).substring(2, 9)}`,
      roomId: null,
      name: 'Guest',
    };
    wsClients.set(ws, clientConn);
    allClients.set(clientConn.userId, clientConn);

    ws.on('message', (rawData: string) => {
      try {
        const msg: SignalingMessage = JSON.parse(rawData.toString());
        handleIncomingSignalingMessage(clientConn, msg, ws);
      } catch (err) {
        console.error('Error parsing WS message:', err);
      }
    });

    ws.on('close', () => {
      const { roomId, userId, name } = clientConn;
      wsClients.delete(ws);
      handleClientDisconnect(userId, roomId, name);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, HOST, () => {
    console.log(`SyncRoom Ultra Server running on http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
