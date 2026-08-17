import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, Lock, Search, Crown, ExternalLink, Hand, Maximize, Minimize, Monitor, AlertCircle } from 'lucide-react';
import { useRoomStore } from '../store/useRoomStore.ts';

const WORKER_URL = (import.meta.env.VITE_BROWSER_WORKER_URL || '').replace(/\/$/, '');

export const RemoteBrowserView: React.FC = () => {
  const {
    roomId,
    browserState,
    followHost,
    setFollowHost,
    isController,
    isHost,
    currentUserId,
    requestControl,
    respondControl,
    pendingControlRequest,
    participants,
    fullscreenContent,
    toggleFullscreen,
  } = useRoomStore();

  const [urlInput, setUrlInput] = useState(browserState.url || '');
  const [status, setStatus] = useState<'offline' | 'connecting' | 'connected' | 'error'>('offline');
  const [error, setError] = useState('');
  const [frame, setFrame] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const isFullscreen = fullscreenContent === 'browser';
  const isUserTheController = isController || browserState.controllerId === currentUserId;
  const controllerName = browserState.controllerName || (browserState.controllerId && participants[browserState.controllerId]?.name) || 'Host';

  useEffect(() => {
    setUrlInput(browserState.url || '');
  }, [browserState.url]);

  useEffect(() => {
    if (!WORKER_URL || !roomId) {
      setStatus('error');
      setError('VITE_BROWSER_WORKER_URL is not configured. Deploy the browser-worker and add its wss:// URL to Vercel.');
      return;
    }

    setStatus('connecting');
    const wsUrl = `${WORKER_URL.replace(/^http/, 'ws')}/browser?roomId=${encodeURIComponent(roomId)}`;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      setError('');
    };
    ws.onmessage = event => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'frame') setFrame(`data:image/jpeg;base64,${message.data}`);
        if (message.type === 'state') {
          setUrlInput(message.url || '');
        }
        if (message.type === 'error') {
          setStatus('error');
          setError(message.message || 'Browser worker error');
        }
      } catch {}
    };
    ws.onerror = () => {
      setStatus('error');
      setError('Could not connect to the self-hosted browser worker.');
    };
    ws.onclose = () => {
      if (status !== 'error') setStatus('offline');
    };
    return () => {
      ws.close();
      socketRef.current = null;
    };
  }, [roomId, status]);

  const send = (message: Record<string, unknown>) => {
    const ws = socketRef.current;
    if (!isUserTheController || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(message));
  };

  const openUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const value = urlInput.trim();
    if (!value) return;
    const target = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    setUrlInput(target);
    send({ type: 'navigate', url: target });
  };

  const handlePointer = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isUserTheController || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 1280;
    const y = ((e.clientY - rect.top) / rect.height) * 720;
    send({ type: 'click', x, y, button: e.button === 2 ? 'right' : 'left' });
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!isUserTheController) return;
    send({ type: 'wheel', deltaX: e.deltaX, deltaY: e.deltaY });
  };

  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isUserTheController) return;
    e.preventDefault();
    if (e.key.length === 1) send({ type: 'type', text: e.key });
    else send({ type: 'key', key: e.key });
  };

  const navDisabled = !isUserTheController;

  return (
    <div className={`w-full h-full flex flex-col bg-slate-950 overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50 min-h-[100dvh]' : ''}`}>
      <div className="h-12 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-3 flex items-center gap-2 shrink-0">
        <button onClick={() => send({ type: 'back' })} disabled={navDisabled} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 disabled:opacity-30"><ArrowLeft className="w-4 h-4" /></button>
        <button onClick={() => send({ type: 'forward' })} disabled={navDisabled} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 disabled:opacity-30"><ArrowRight className="w-4 h-4" /></button>
        <button onClick={() => send({ type: 'reload' })} disabled={navDisabled} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 disabled:opacity-30"><RotateCw className="w-4 h-4" /></button>
        <form onSubmit={openUrl} className="flex-1">
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5">
            <Lock className="w-3.5 h-3.5 text-emerald-400 mr-2" />
            <input value={urlInput} onChange={e => setUrlInput(e.target.value)} disabled={navDisabled && followHost} className="w-full bg-transparent text-xs text-white outline-none" placeholder="Enter a URL" />
            <button disabled={navDisabled} className="text-slate-400 hover:text-white disabled:opacity-30"><Search className="w-3.5 h-3.5" /></button>
          </div>
        </form>
        <div className="hidden md:flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-800 text-[11px] text-slate-300">
          <Crown className="w-3 h-3 text-amber-400" />
          {isUserTheController ? 'You control browsing' : `${controllerName} controls`}
        </div>
        <button onClick={() => setFollowHost(!followHost)} className={`hidden sm:block px-2.5 py-1 rounded-lg border text-[11px] ${followHost ? 'border-sky-500/30 text-sky-300 bg-sky-500/10' : 'border-slate-700 text-slate-400 bg-slate-800'}`}>Follow: {followHost ? 'ON' : 'OFF'}</button>
        {!isUserTheController && <button onClick={requestControl} className="px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-[11px]"><Hand className="inline w-3 h-3 mr-1" />Control</button>}
        {browserState.url && <a href={browserState.url} target="_blank" rel="noreferrer" className="p-1.5 text-slate-400 hover:text-white"><ExternalLink className="w-4 h-4" /></a>}
        <button onClick={() => toggleFullscreen('browser')} className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300">{isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}</button>
      </div>

      {isHost && pendingControlRequest && (
        <div className="px-4 py-2 bg-amber-950/80 border-b border-amber-500/30 text-xs flex items-center justify-between">
          <span className="text-amber-200"><strong>{pendingControlRequest.userName}</strong> wants browser control.</span>
          <div className="flex gap-2"><button onClick={() => respondControl(pendingControlRequest.userId, true)} className="px-3 py-1 rounded bg-amber-500 text-slate-950 font-bold">Allow</button><button onClick={() => respondControl(pendingControlRequest.userId, false)} className="px-3 py-1 rounded bg-slate-800 text-slate-300">Deny</button></div>
        </div>
      )}

      <div
        ref={stageRef}
        tabIndex={0}
        onClick={handlePointer}
        onContextMenu={e => e.preventDefault()}
        onWheel={handleWheel}
        onKeyDown={handleKey}
        className="flex-1 min-h-0 flex items-center justify-center bg-black outline-none"
      >
        {frame ? (
          <img src={frame} alt="Shared browser" draggable={false} className="w-full h-full object-contain select-none" />
        ) : (
          <div className="text-center text-slate-400 max-w-md px-6">
            {status === 'connecting' ? <RotateCw className="w-7 h-7 mx-auto mb-3 animate-spin text-sky-400" /> : <Monitor className="w-7 h-7 mx-auto mb-3" />}
            <div className="text-sm font-semibold text-slate-200">{status === 'connected' ? 'Starting shared Chromium…' : 'Shared browser offline'}</div>
            {error && <div className="mt-2 text-xs text-amber-300 flex items-center justify-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{error}</div>}
          </div>
        )}
      </div>
    </div>
  );
};
