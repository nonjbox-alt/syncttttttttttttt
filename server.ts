import express from 'express';
import http from 'http';
import path from 'path';
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
  ws: WebSocket;
  userId: string;
  roomId: string | null;
  name: string;
}

// In-memory room store
const rooms = new Map<string, RoomState>();
const clients = new Map<WebSocket, ClientConnection>();
const chatHistories = new Map<string, ChatMessage[]>();

function getOrCreateRoom(roomId: string, hostUserId: string, hostName: string): RoomState {
  let room = rooms.get(roomId);
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
      id: roomId,
      name: `Room ${roomId}`,
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

    rooms.set(roomId, room);
    chatHistories.set(roomId, [
      {
        id: `sys-${Date.now()}`,
        senderId: 'system',
        senderName: 'System',
        senderColor: '#94a3b8',
        text: `Room ${roomId} created. Welcome to SyncRoom!`,
        timestamp: Date.now(),
        type: 'system',
      },
    ]);
  }
  return room;
}

function broadcastToRoom(roomId: string, message: SignalingMessage, excludeWs?: WebSocket) {
  const data = JSON.stringify(message);
  for (const [ws, client] of clients.entries()) {
    if (client.roomId === roomId && ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(data);
      } catch (err) {
        console.error('Error broadcasting message to client:', err);
      }
    }
  }
}

function sendToUser(toUserId: string, message: SignalingMessage) {
  const data = JSON.stringify(message);
  for (const [ws, client] of clients.entries()) {
    if (client.userId === toUserId && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(data);
      } catch (err) {
        console.error('Error sending direct message to user:', err);
      }
      break;
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // ICE Server configuration endpoint (WebRTC STUN / TURN)
  app.get('/api/config/ice', (req, res) => {
    const iceServers: IceServerConfig[] = [];

    // Default public STUN servers
    const stunServer = process.env.STUN_SERVER || 'stun:stun.l.google.com:19302';
    iceServers.push({ urls: stunServer.split(',').map((s) => s.trim()) });
    iceServers.push({ urls: 'stun:stun1.l.google.com:19302' });

    if (process.env.TURN_SERVER) {
      iceServers.push({
        urls: process.env.TURN_SERVER.split(',').map((s) => s.trim()),
        username: process.env.TURN_USERNAME || undefined,
        credential: process.env.TURN_PASSWORD || undefined,
      });
    }

    res.json({ iceServers });
  });

  // Server Time Endpoint for NTP-like precision sync
  app.get('/api/time', (req, res) => {
    res.json({ serverTime: Date.now() });
  });

  // Check URL embeddability and get title metadata
  app.get('/api/browse/check-embed', async (req, res) => {
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

      // Check common sites that allow or disallow iframe embedding
      const hostname = parsed.hostname.toLowerCase();

      // Known embeddable sites (or sites with embed friendly versions)
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

      // Common sites known to strictly disallow iframes (X-Frame-Options: SAMEORIGIN / DENY)
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

      // Quick HEAD request with timeout
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
        if (csp && (csp.includes('frame-ancestors \'none\'') || csp.includes('frame-ancestors \'self\''))) {
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
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket) => {
    const clientConn: ClientConnection = {
      ws,
      userId: `user_${Math.random().toString(36).substring(2, 9)}`,
      roomId: null,
      name: 'Guest',
    };
    clients.set(ws, clientConn);

    ws.on('message', (rawData: string) => {
      try {
        const msg: SignalingMessage = JSON.parse(rawData.toString());

        switch (msg.type) {
          case 'ping': {
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            break;
          }

          case 'time-sync-req': {
            ws.send(
              JSON.stringify({
                type: 'time-sync-res',
                clientTimestamp: msg.timestamp,
                serverTimestamp: Date.now(),
              })
            );
            break;
          }

          case 'join': {
            const { roomId, name, isMicOn, isCameraOn } = msg.payload || {};
            if (!roomId) return;

            clientConn.roomId = roomId.toUpperCase();
            clientConn.name = name?.trim() || `User ${clientConn.userId.substring(5)}`;

            const cleanRoomId = clientConn.roomId;
            const existingRoom = rooms.get(cleanRoomId);
            const isFirstUser = !existingRoom || Object.keys(existingRoom.participants).length === 0;

            const room = getOrCreateRoom(cleanRoomId, clientConn.userId, clientConn.name);

            const participant: Participant = {
              id: clientConn.userId,
              name: clientConn.name,
              avatarColor: getRandomColor(),
              isHost: isFirstUser,
              isController: isFirstUser || room.browserState.controllerId === clientConn.userId,
              hasRequestedControl: false,
              isMicOn: !!isMicOn,
              isCameraOn: !!isCameraOn,
              isScreenSharing: false,
              isSpeaking: false,
              volume: 1,
              joinedAt: Date.now(),
            };

            room.participants[clientConn.userId] = participant;

            // Send full room state & history to joining user
            const messages = chatHistories.get(cleanRoomId) || [];
            ws.send(
              JSON.stringify({
                type: 'room-state',
                payload: {
                  room,
                  currentUserId: clientConn.userId,
                  messages,
                  serverTime: Date.now(),
                },
              })
            );

            // Announce new user to others in the room
            broadcastToRoom(
              cleanRoomId,
              {
                type: 'user-joined',
                payload: { participant },
              },
              ws
            );

            // Post system message
            const joinMsg: ChatMessage = {
              id: `sys-${Date.now()}-${Math.random()}`,
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

            // Update server browser state based on event
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

            // Notify host
            sendToUser(room.hostId, {
              type: 'request-control',
              payload: {
                userId: requester.id,
                userName: requester.name,
              },
            });

            // Broadcast pending state so UI can show request indicator
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

          // WebRTC Signaling routing (Offer, Answer, ICE candidate)
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
      } catch (err) {
        console.error('Error handling WebSocket message:', err);
      }
    });

    ws.on('close', () => {
      const { roomId, userId, name } = clientConn;
      clients.delete(ws);

      if (roomId) {
        const room = rooms.get(roomId);
        if (room && room.participants[userId]) {
          delete room.participants[userId];

          const remainingUsers = Object.values(room.participants);
          if (remainingUsers.length === 0) {
            // Clean up empty room after 5 minutes of inactivity
            setTimeout(() => {
              const current = rooms.get(roomId);
              if (current && Object.keys(current.participants).length === 0) {
                rooms.delete(roomId);
                chatHistories.delete(roomId);
                console.log(`Cleaned up empty room ${roomId}`);
              }
            }, 300000);
          } else {
            // Reassign host if host left
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
              id: `sys-${Date.now()}-${Math.random()}`,
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
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, HOST, () => {
    console.log(`SyncRoom Server running on http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
