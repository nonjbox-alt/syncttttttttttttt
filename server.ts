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
  '#38bdf8', '#818cf8', '#f472b6', '#34d399',
  '#fbbf24', '#a78bfa', '#fb7185', '#2dd4bf',
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

const rooms = new Map<string, RoomState>();
const wsClients = new Map<WebSocket, ClientConnection>();
const allClients = new Map<string, ClientConnection>();
const sseClients = new Map<string, Set<Response>>();
const chatHistories = new Map<string, ChatMessage[]>();

function getOrCreateRoom(roomId: string, hostUserId: string, hostName: string): RoomState {
  const cleanId = roomId.toUpperCase();
  let room = rooms.get(cleanId);
  if (!room) {
    const initialBrowserState: SharedBrowserState = {
      url: '', title: 'SyncRoom Shared Browser', history: [], historyIndex: -1,
      scrollX: 0, scrollY: 0, controllerId: hostUserId, controllerName: hostName,
      isEmbeddable: true, lastUpdated: Date.now(),
    };
    const initialVideoState: SharedVideoState = {
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      mediaType: 'direct', isPlaying: false, position: 0, serverTime: Date.now(),
      playbackRate: 1, title: 'Big Buck Bunny (Sample HD)', duration: 596,
    };
    const initialHostParticipant: Participant = {
      id: hostUserId, name: hostName || `User ${hostUserId.substring(5)}`,
      avatarColor: getRandomColor(), isHost: true, isController: true,
      hasRequestedControl: false, isMicOn: false, isCameraOn: false,
      isScreenSharing: false, isSpeaking: false, volume: 1, joinedAt: Date.now(),
      connectionState: 'connected',
    };
    room = {
      id: cleanId, name: `Room ${cleanId}`, hostId: hostUserId, mode: 'BROWSE',
      participants: { [hostUserId]: initialHostParticipant },
      browserState: initialBrowserState, videoState: initialVideoState,
      activeScreenSharerId: null, activeScreenSharerName: null,
      pendingControlRequest: null, createdAt: Date.now(),
    };
    rooms.set(cleanId, room);
    chatHistories.set(cleanId, [{
      id: `sys-${Date.now()}`, senderId: 'system', senderName: 'System',
      senderColor: '#94a3b8', text: `Room ${cleanId} created. Welcome to SyncRoom!`,
      timestamp: Date.now(), type: 'system',
    }]);
  }
  return room;
}

function broadcastToRoom(roomId: string, message: SignalingMessage, excludeWs?: WebSocket) {
  const cleanId = roomId.toUpperCase();
  const data = JSON.stringify(message);
  for (const [ws, client] of wsClients.entries()) {
    if (client.roomId === cleanId && ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      try { ws.send(data); } catch (err) { console.error('Error broadcasting WS message:', err); }
    }
  }
  const sseSet = sseClients.get(cleanId);
  if (sseSet) {
    const formatted = `data: ${data}\n\n`;
    for (const res of sseSet) {
      try { res.write(formatted); } catch { sseSet.delete(res); }
    }
  }
}

function sendToUser(toUserId: string, message: SignalingMessage) {
  const data = JSON.stringify(message);
  for (const [ws, client] of wsClients.entries()) {
    if (client.userId === toUserId && ws.readyState === WebSocket.OPEN) {
      try { ws.send(data); } catch {} return;
    }
  }
  const client = allClients.get(toUserId);
  if (client?.sseRes && !client.sseRes.writableEnded) {
    try { client.sseRes.write(`data: ${data}\n\n`); } catch {}
  }
}

function handleIncomingSignalingMessage(clientConn: ClientConnection, msg: SignalingMessage, replyWs?: WebSocket) {
  switch (msg.type) {
    case 'ping':
      if (replyWs?.readyState === WebSocket.OPEN) replyWs.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;
    case 'time-sync-req': {
      const response = JSON.stringify({ type: 'time-sync-res', clientTimestamp: msg.timestamp || msg.clientTimestamp || Date.now(), serverTimestamp: Date.now() });
      if (replyWs?.readyState === WebSocket.OPEN) replyWs.send(response);
      else if (clientConn.sseRes && !clientConn.sseRes.writableEnded) clientConn.sseRes.write(`data: ${response}\n\n`);
      break;
    }
    case 'join': {
      const { roomId, name, isMicOn, isCameraOn, userId } = msg.payload || {};
      if (!roomId) return;
      const cleanRoomId = roomId.trim().toUpperCase();
      if (userId) clientConn.userId = userId;
      clientConn.roomId = cleanRoomId;
      clientConn.name = name?.trim() || `User ${clientConn.userId.substring(5)}`;
      allClients.set(clientConn.userId, clientConn);
      const existingRoom = rooms.get(cleanRoomId);
      const isFirstUser = !existingRoom || Object.keys(existingRoom.participants).length === 0;
      const room = getOrCreateRoom(cleanRoomId, clientConn.userId, clientConn.name);
      const participant: Participant = {
        id: clientConn.userId, name: clientConn.name, avatarColor: getRandomColor(),
        isHost: isFirstUser || room.hostId === clientConn.userId,
        isController: isFirstUser || room.hostId === clientConn.userId || room.browserState.controllerId === clientConn.userId,
        hasRequestedControl: false, isMicOn: !!isMicOn, isCameraOn: !!isCameraOn,
        isScreenSharing: false, isSpeaking: false, volume: 1, joinedAt: Date.now(),
      };
      room.participants[clientConn.userId] = participant;
      const messages = chatHistories.get(cleanRoomId) || [];
      const statePayload = { type: 'room-state', payload: { room, currentUserId: clientConn.userId, messages, serverTime: Date.now() } };
      if (replyWs?.readyState === WebSocket.OPEN) replyWs.send(JSON.stringify(statePayload));
      else if (clientConn.sseRes && !clientConn.sseRes.writableEnded) clientConn.sseRes.write(`data: ${JSON.stringify(statePayload)}\n\n`);
      broadcastToRoom(cleanRoomId, { type: 'user-joined', payload: { participant } }, replyWs);
      const joinMsg: ChatMessage = { id: `sys-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`, senderId: 'system', senderName: 'System', senderColor: '#94a3b8', text: `${participant.name} joined the room.`, timestamp: Date.now(), type: 'system' };
      messages.push(joinMsg);
      broadcastToRoom(cleanRoomId, { type: 'chat-message', payload: { message: joinMsg } });
      break;
    }
    case 'user-updated': {
      if (!clientConn.roomId) return;
      const room = rooms.get(clientConn.roomId); if (!room) return;
      const participant = room.participants[clientConn.userId];
      if (participant && msg.payload) {
        Object.assign(participant, msg.payload);
        if (msg.payload.isScreenSharing !== undefined) {
          if (msg.payload.isScreenSharing) { room.activeScreenSharerId = participant.id; room.activeScreenSharerName = participant.name; room.mode = 'SCREEN_SHARE'; }
          else if (room.activeScreenSharerId === participant.id) { room.activeScreenSharerId = null; room.activeScreenSharerName = null; }
        }
        broadcastToRoom(clientConn.roomId, { type: 'user-updated', payload: { userId: clientConn.userId, updates: msg.payload, activeScreenSharerId: room.activeScreenSharerId, activeScreenSharerName: room.activeScreenSharerName, mode: room.mode } });
      }
      break;
    }
    case 'mode-change': {
      if (!clientConn.roomId) return; const room = rooms.get(clientConn.roomId); if (!room || !msg.payload?.mode) return;
      room.mode = msg.payload.mode; broadcastToRoom(clientConn.roomId, { type: 'mode-change', payload: { mode: room.mode } }); break;
    }
    case 'browser-event': {
      if (!clientConn.roomId) return; const room = rooms.get(clientConn.roomId); if (!room) return;
      const event: BrowserEvent = msg.payload?.event; if (!event) return;
      switch (event.type) {
        case 'NAVIGATE': room.browserState.url = event.url; if (event.title) room.browserState.title = event.title; room.browserState.history.push(event.url); room.browserState.historyIndex = room.browserState.history.length - 1; room.browserState.scrollX = 0; room.browserState.scrollY = 0; room.browserState.lastUpdated = Date.now(); break;
        case 'BACK': if (room.browserState.historyIndex > 0) { room.browserState.historyIndex--; room.browserState.url = room.browserState.history[room.browserState.historyIndex]; } break;
        case 'FORWARD': if (room.browserState.historyIndex < room.browserState.history.length - 1) { room.browserState.historyIndex++; room.browserState.url = room.browserState.history[room.browserState.historyIndex]; } break;
        case 'SCROLL': room.browserState.scrollX = event.x; room.browserState.scrollY = event.y; break;
      }
      broadcastToRoom(clientConn.roomId, { type: 'browser-event', payload: { event, browserState: room.browserState, fromUserId: clientConn.userId } }); break;
    }
    case 'video-event': {
      if (!clientConn.roomId) return; const room = rooms.get(clientConn.roomId); if (!room || !msg.payload) return;
      const { action, url, mediaType, position, playbackRate, title } = msg.payload;
      if (url) room.videoState.url = url; if (mediaType) room.videoState.mediaType = mediaType; if (title) room.videoState.title = title; if (playbackRate !== undefined) room.videoState.playbackRate = playbackRate;
      if (action === 'PLAY') { room.videoState.isPlaying = true; room.videoState.position = position ?? room.videoState.position; room.videoState.serverTime = Date.now(); }
      else if (action === 'PAUSE') { room.videoState.isPlaying = false; room.videoState.position = position ?? room.videoState.position; room.videoState.serverTime = Date.now(); }
      else if (action === 'SEEK') { room.videoState.position = position; room.videoState.serverTime = Date.now(); }
      broadcastToRoom(clientConn.roomId, { type: 'video-event', payload: { action, videoState: room.videoState, fromUserId: clientConn.userId, serverTime: Date.now() } }); break;
    }
    case 'request-control': {
      if (!clientConn.roomId) return; const room = rooms.get(clientConn.roomId); if (!room) return;
      const requester = room.participants[clientConn.userId]; if (!requester) return;
      room.pendingControlRequest = { userId: requester.id, userName: requester.name };
      sendToUser(room.hostId, { type: 'request-control', payload: { userId: requester.id, userName: requester.name } });
      broadcastToRoom(clientConn.roomId, { type: 'user-updated', payload: { userId: requester.id, updates: { hasRequestedControl: true } } }); break;
    }
    case 'respond-control': {
      if (!clientConn.roomId) return; const room = rooms.get(clientConn.roomId); if (!room) return;
      const { approved, targetUserId } = msg.payload || {}; room.pendingControlRequest = null;
      if (approved && targetUserId && room.participants[targetUserId]) {
        const target = room.participants[targetUserId]; room.browserState.controllerId = target.id; room.browserState.controllerName = target.name;
        for (const p of Object.values(room.participants)) { p.isController = p.id === target.id; p.hasRequestedControl = false; }
        broadcastToRoom(clientConn.roomId, { type: 'room-state', payload: { room, serverTime: Date.now() } });
        const controlMsg: ChatMessage = { id: `sys-${Date.now()}-${Math.random()}`, senderId: 'system', senderName: 'System', senderColor: '#38bdf8', text: `👑 ${target.name} is now controlling the shared browser.`, timestamp: Date.now(), type: 'system' };
        chatHistories.get(clientConn.roomId)?.push(controlMsg); broadcastToRoom(clientConn.roomId, { type: 'chat-message', payload: { message: controlMsg } });
      } else { broadcastToRoom(clientConn.roomId, { type: 'user-updated', payload: { userId: targetUserId, updates: { hasRequestedControl: false } } }); }
      break;
    }
    default: {
      if (!clientConn.roomId) return;
      const room = rooms.get(clientConn.roomId); if (!room) return;
      // Generic room messages are broadcast without changing authoritative state.
      broadcastToRoom(clientConn.roomId, msg, replyWs);
    }
  }
}

function handleClientDisconnect(userId: string, roomId: string | null, name: string) {
  allClients.delete(userId);
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room) return;
  delete room.participants[userId];
  if (room.activeScreenSharerId === userId) { room.activeScreenSharerId = null; room.activeScreenSharerName = null; }
  broadcastToRoom(roomId, { type: 'user-left', payload: { userId } });
  const leaveMsg: ChatMessage = { id: `sys-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`, senderId: 'system', senderName: 'System', senderColor: '#94a3b8', text: `${name || 'A user'} left the room.`, timestamp: Date.now(), type: 'system' };
  chatHistories.get(roomId)?.push(leaveMsg);
  broadcastToRoom(roomId, { type: 'chat-message', payload: { message: leaveMsg } });
}

export async function createApp() {
  const app = express();
  app.use(express.json());

  const getIceServers = async (): Promise<IceServerConfig[]> => {
    const iceServers: IceServerConfig[] = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
    if (process.env.TURN_KEY_ID && process.env.TURN_API_TOKEN) {
      try {
        const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 2500);
        const cfRes = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${process.env.TURN_KEY_ID}/credentials/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.TURN_API_TOKEN}` }, body: JSON.stringify({ ttl: 86400 }), signal: controller.signal });
        clearTimeout(timeout);
        if (cfRes.ok) { const cfData = await cfRes.json(); if (cfData.iceServers?.urls) iceServers.push({ urls: cfData.iceServers.urls, username: cfData.iceServers.username, credential: cfData.iceServers.credential }); }
      } catch (err) { console.warn('Failed to fetch ephemeral Cloudflare TURN credentials:', err); }
    } else if (process.env.TURN_SERVER) {
      iceServers.push({ urls: process.env.TURN_SERVER.split(',').map((s) => s.trim()), username: process.env.TURN_USERNAME || undefined, credential: process.env.TURN_PASSWORD || undefined });
    }
    return iceServers;
  };

  app.get('/api/webrtc/ice-servers', async (_req, res) => { res.json({ iceServers: await getIceServers() }); });
  app.get('/api/config/ice', async (_req, res) => { res.json({ iceServers: await getIceServers() }); });
  app.get('/api/time', (_req, res) => { res.json({ serverTime: Date.now() }); });
  app.get('/api/room/:roomId/state', (req, res) => {
    const roomId = (req.params.roomId || '').toUpperCase();
    res.json({ room: rooms.get(roomId) || null, messages: chatHistories.get(roomId) || [], serverTime: Date.now() });
  });
  app.post('/api/room/:roomId/join', (req, res) => {
    const roomId = (req.params.roomId || '').toUpperCase(); const { name, userId, isMicOn, isCameraOn } = req.body || {};
    const finalUserId = userId || `user_${Math.random().toString(36).substring(2, 9)}`; const finalName = name?.trim() || `User ${finalUserId.substring(5)}`;
    let clientConn = allClients.get(finalUserId);
    if (!clientConn) { clientConn = { userId: finalUserId, roomId, name: finalName }; allClients.set(finalUserId, clientConn); } else { clientConn.roomId = roomId; clientConn.name = finalName; }
    handleIncomingSignalingMessage(clientConn, { type: 'join', payload: { roomId, name: finalName, isMicOn, isCameraOn, userId: finalUserId } });
    res.json({ success: true, room: rooms.get(roomId), userId: finalUserId, messages: chatHistories.get(roomId) || [], serverTime: Date.now() });
  });
  app.post('/api/room/:roomId/action', (req, res) => {
    const roomId = (req.params.roomId || '').toUpperCase(); const { message, userId } = req.body || {};
    if (!message) return res.status(400).json({ error: 'Missing message' });
    let clientConn = userId ? allClients.get(userId) : undefined;
    if (!clientConn) { clientConn = { userId: userId || `user_rest_${Math.random().toString(36).substring(2, 7)}`, roomId, name: 'User' }; allClients.set(clientConn.userId, clientConn); }
    clientConn.roomId = roomId; handleIncomingSignalingMessage(clientConn, message); res.json({ success: true, serverTime: Date.now() });
  });
  app.get('/api/room/:roomId/events', (req, res) => {
    const roomId = (req.params.roomId || '').toUpperCase(); const userId = (req.query.userId as string) || `user_${Math.random().toString(36).substring(2, 9)}`;
    res.setHeader('Content-Type', 'text/event-stream'); res.setHeader('Cache-Control', 'no-cache, no-transform'); res.setHeader('Connection', 'keep-alive'); res.flushHeaders?.();
    let clientConn = allClients.get(userId);
    if (!clientConn) { clientConn = { userId, roomId, name: 'Guest', sseRes: res }; allClients.set(userId, clientConn); } else { clientConn.sseRes = res; clientConn.roomId = roomId; }
    let sseSet = sseClients.get(roomId); if (!sseSet) { sseSet = new Set<Response>(); sseClients.set(roomId, sseSet); } sseSet.add(res);
    res.write(`data: ${JSON.stringify({ type: 'ping', serverTime: Date.now() })}\n\n`);
    const keepAlive = setInterval(() => { if (!res.writableEnded) res.write(`data: ${JSON.stringify({ type: 'ping', serverTime: Date.now() })}\n\n`); }, 15000);
    req.on('close', () => { clearInterval(keepAlive); sseSet?.delete(res); if (clientConn && clientConn.sseRes === res) clientConn.sseRes = undefined; });
  });
  app.get('/api/browse/check-embed', async (req, res) => {
    const targetUrl = req.query.url as string; if (!targetUrl) return res.status(400).json({ error: 'URL parameter is required' });
    try {
      const parsed = new URL(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`); const hostname = parsed.hostname.toLowerCase();
      const allowed = ['wikipedia.org','archive.org','codepen.io','jsfiddle.net','w3schools.com','bing.com','duckduckgo.com','openstreetmap.org','stackblitz.com','replit.com'];
      const strict = ['youtube.com','youtu.be','google.com','facebook.com','twitter.com','x.com','netflix.com','twitch.tv','reddit.com','github.com','instagram.com','amazon.com','tiktok.com'];
      if (strict.some((h) => hostname.includes(h))) return res.json({ url: parsed.href, title: hostname, isEmbeddable: false, suggestTabShare: true, reason: 'Protected by X-Frame-Options / CSP' });
      if (allowed.some((h) => hostname.includes(h))) return res.json({ url: parsed.href, title: hostname, isEmbeddable: true });
      const controller = new AbortController(); const timeoutId = setTimeout(() => controller.abort(), 3500);
      try {
        const response = await fetch(parsed.href, { method: 'HEAD', signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } }); clearTimeout(timeoutId);
        const xFrame = response.headers.get('x-frame-options')?.toLowerCase() || ''; const csp = response.headers.get('content-security-policy') || '';
        const isEmbeddable = !(xFrame.includes('deny') || xFrame.includes('sameorigin') || csp.includes("frame-ancestors 'none'") || csp.includes("frame-ancestors 'self'"));
        return res.json({ url: parsed.href, title: hostname, isEmbeddable, suggestTabShare: !isEmbeddable });
      } catch { clearTimeout(timeoutId); return res.json({ url: parsed.href, title: hostname, isEmbeddable: true }); }
    } catch (e: any) { return res.json({ url: targetUrl, title: targetUrl, isEmbeddable: false, suggestTabShare: true, reason: e.message }); }
  });

  if (!process.env.VERCEL) {
    const server = http.createServer(app);
    const wss = new WebSocketServer({ noServer: true });
    server.on('upgrade', (request, socket, head) => {
      const pathname = request.url ? new URL(request.url, `http://${request.headers.host}`).pathname : '';
      if (pathname === '/ws' || pathname === '/api/ws' || pathname === '/') wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
    });
    wss.on('connection', (ws: WebSocket) => {
      const clientConn: ClientConnection = { ws, userId: `user_${Math.random().toString(36).substring(2, 9)}`, roomId: null, name: 'Guest' };
      wsClients.set(ws, clientConn); allClients.set(clientConn.userId, clientConn);
      ws.on('message', (rawData: string) => { try { handleIncomingSignalingMessage(clientConn, JSON.parse(rawData.toString()), ws); } catch (err) { console.error('Error parsing WS message:', err); } });
      ws.on('close', () => { const { roomId, userId, name } = clientConn; wsClients.delete(ws); handleClientDisconnect(userId, roomId, name); });
    });
    if (process.env.NODE_ENV !== 'production') {
      const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' }); app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), 'dist'); app.use(express.static(distPath)); app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
    }
    server.listen(PORT, HOST, () => console.log(`SyncRoom Ultra Server running on http://${HOST}:${PORT}`));
  }
  return app;
}

if (!process.env.VERCEL) createApp().catch((err) => { console.error('Failed to start server:', err); process.exitCode = 1; });
