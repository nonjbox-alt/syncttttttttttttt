# SyncRoom Self-Hosted Browser Worker

This is SyncRoom's own remote Chromium engine. It does **not** use Hyperbeam or another browser-as-a-service provider.

## What it does

- One real Chromium session per SyncRoom room
- Shared page/navigation for everyone in the room
- Back / Forward / Reload
- Mouse clicks and wheel input
- Keyboard input
- JPEG frame streaming over WebSocket
- Automatic idle shutdown after 10 minutes
- Optional shared token authentication

## Run

```bash
cd browser-worker
npm install
npx playwright install chromium
export BROWSER_WORKER_TOKEN='replace-with-a-long-random-secret'
npm start
```

For production, use the included Dockerfile:

```bash
docker build -t syncroom-browser-worker ./browser-worker
docker run --rm \
  -p 8787:8787 \
  -e BROWSER_WORKER_TOKEN='replace-with-a-long-random-secret' \
  syncroom-browser-worker
```

Then set these Vercel environment variables for the SyncRoom frontend:

- `VITE_BROWSER_WORKER_URL` = `https://your-worker-host.example`
- `VITE_BROWSER_WORKER_TOKEN` = the same token used by the worker

The frontend automatically converts `https://` to `wss://` for the WebSocket connection.

## Important limitation

This first self-hosted engine streams Chromium screenshots and sends input events. It is the foundation for the Hyperbeam-style shared browser without using Hyperbeam. It does **not** yet provide browser-tab audio/video transport; the SyncRoom Video and Screen Share modes remain separate. Browser media capture can be added later with a real media pipeline (WebRTC/FFmpeg/PipeWire).
