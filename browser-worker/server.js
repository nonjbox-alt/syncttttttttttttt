import express from 'express';
import http from 'node:http';
import crypto from 'node:crypto';
import { chromium } from 'playwright';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const WORKER_TOKEN = process.env.BROWSER_WORKER_TOKEN || '';
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/browser' });

const sessions = new Map();
const clients = new Map();
function sessionKey(roomId) { return String(roomId || '').trim().toUpperCase(); }

async function getSession(roomId) {
  const key = sessionKey(roomId);
  let session = sessions.get(key);
  if (session) return session;
  const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  session = { roomId: key, browser, context, page, clients: new Set(), frameSeq: 0 };
  sessions.set(key, session);
  page.on('framenavigated', () => broadcastState(session));
  page.on('close', () => sessions.delete(key));
  page.on('load', () => broadcastState(session));
  await page.goto('https://duckduckgo.com/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  return session;
}

async function sendFrame(session) {
  if (session.clients.size === 0) return;
  const buffer = await session.page.screenshot({ type: 'jpeg', quality: 68 });
  const message = JSON.stringify({ type: 'frame', seq: ++session.frameSeq, data: buffer.toString('base64') });
  for (const ws of session.clients) if (ws.readyState === 1) ws.send(message);
}

function broadcastState(session) {
  const message = JSON.stringify({ type: 'state', url: session.page.url(), title: session.page.url() });
  for (const ws of session.clients) if (ws.readyState === 1) ws.send(message);
  sendFrame(session).catch(() => {});
}

async function handleAction(session, action) {
  if (!action || typeof action !== 'object') return;
  switch (action.type) {
    case 'navigate': await session.page.goto(String(action.url), { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}); break;
    case 'back': await session.page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}); break;
    case 'forward': await session.page.goForward({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}); break;
    case 'reload': await session.page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}); break;
    case 'click': await session.page.mouse.click(Number(action.x) || 0, Number(action.y) || 0, { button: action.button === 'right' ? 'right' : 'left' }); break;
    case 'wheel': await session.page.mouse.wheel(Number(action.deltaX) || 0, Number(action.deltaY) || 0); break;
    case 'key': if (action.key) await session.page.keyboard.press(String(action.key)); break;
    case 'type': if (typeof action.text === 'string') await session.page.keyboard.insertText(action.text); break;
    case 'setViewport': await session.page.setViewportSize({ width: Math.max(640, Number(action.width) || 1280), height: Math.max(360, Number(action.height) || 720) }); break;
  }
  broadcastState(session);
}

wss.on('connection', async (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const roomId = sessionKey(url.searchParams.get('roomId'));
  const token = url.searchParams.get('token') || '';
  if (!roomId || !WORKER_TOKEN || token !== WORKER_TOKEN) return ws.close(1008, 'unauthorized');

  try {
    const session = await getSession(roomId);
    session.clients.add(ws);
    clients.set(ws, session);
    ws.send(JSON.stringify({ type: 'ready', roomId, sessionId: crypto.randomUUID() }));
    await broadcastState(session);
    ws.on('message', async raw => {
      try { await handleAction(session, JSON.parse(raw.toString())); }
      catch (error) { ws.send(JSON.stringify({ type: 'error', message: error?.message || 'browser action failed' })); }
    });
    ws.on('close', async () => {
      session.clients.delete(ws);
      clients.delete(ws);
      if (session.clients.size === 0) {
        setTimeout(async () => {
          if (session.clients.size === 0 && sessions.get(roomId) === session) {
            sessions.delete(roomId);
            await session.browser.close().catch(() => {});
          }
        }, 10 * 60 * 1000);
      }
    });
  } catch (error) {
    ws.close(1011, error?.message || 'browser session failed');
  }
});

app.get('/health', (_req, res) => res.json({ ok: true, sessions: sessions.size }));
server.listen(PORT, HOST, () => console.log(`SyncRoom browser worker listening on ${HOST}:${PORT}`));
