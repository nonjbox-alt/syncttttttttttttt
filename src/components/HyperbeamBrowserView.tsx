import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Hyperbeam from '@hyperbeam/web';
import {
  ArrowLeft,
  ArrowRight,
  Lock,
  Maximize,
  Minimize,
  Monitor,
  RefreshCw,
  Search,
  Settings2,
} from 'lucide-react';
import { useRoomStore } from '../store/useRoomStore.ts';
import { socketService } from '../services/socket.ts';

const HYPERBEAM_PREFIX = 'syncroom:hyperbeam:';
const encodeEmbedUrl = (url: string) => `${HYPERBEAM_PREFIX}${encodeURIComponent(url)}`;
const decodeEmbedUrl = (value: string) =>
  value.startsWith(HYPERBEAM_PREFIX) ? decodeURIComponent(value.slice(HYPERBEAM_PREFIX.length)) : null;

const normalizeUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

export const HyperbeamBrowserView: React.FC = () => {
  const {
    roomId,
    browserState,
    isHost,
    fullscreenContent,
    toggleFullscreen,
  } = useRoomStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const hyperbeamRef = useRef<any>(null);
  const [embedUrl, setEmbedUrl] = useState<string | null>(decodeEmbedUrl(browserState.url));
  const [currentUrl, setCurrentUrl] = useState('');
  const [currentTitle, setCurrentTitle] = useState('SyncRoom Shared Browser');
  const [inputUrl, setInputUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'creating' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(fullscreenContent === 'browser');

  useEffect(() => {
    const decoded = decodeEmbedUrl(browserState.url);
    if (decoded && decoded !== embedUrl) {
      setEmbedUrl(decoded);
      setStatus('ready');
    }
  }, [browserState.url, embedUrl]);

  useEffect(() => {
    setIsFullscreen(fullscreenContent === 'browser');
  }, [fullscreenContent]);

  const startSession = useCallback(async () => {
    if (!roomId || !isHost || embedUrl || status === 'creating') return;

    const saved = localStorage.getItem(`syncroom_hyperbeam_${roomId}`);
    if (saved) {
      setEmbedUrl(saved);
      setStatus('ready');
      socketService.send({
        type: 'browser-event',
        payload: {
          event: {
            type: 'NAVIGATE',
            url: encodeEmbedUrl(saved),
            title: 'SyncRoom Shared Browser',
          },
        },
      });
      return;
    }

    setStatus('creating');
    setError('');
    try {
      const response = await fetch('/api/hyperbeam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startUrl: 'https://duckduckgo.com/' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.embedUrl) {
        throw new Error(data.message || data.error || `HTTP ${response.status}`);
      }

      localStorage.setItem(`syncroom_hyperbeam_${roomId}`, data.embedUrl);
      setEmbedUrl(data.embedUrl);
      setStatus('ready');
      socketService.send({
        type: 'browser-event',
        payload: {
          event: {
            type: 'NAVIGATE',
            url: encodeEmbedUrl(data.embedUrl),
            title: 'SyncRoom Shared Browser',
          },
        },
      });
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Unable to start shared browser');
    }
  }, [embedUrl, isHost, roomId, status]);

  useEffect(() => {
    if (isHost && !embedUrl) {
      void startSession();
    }
  }, [embedUrl, isHost, startSession]);

  useEffect(() => {
    if (!embedUrl || !containerRef.current) return;
    let cancelled = false;

    const mount = async () => {
      try {
        if (hyperbeamRef.current) {
          try { hyperbeamRef.current.destroy?.(); } catch {}
          hyperbeamRef.current = null;
        }

        const hb = await Hyperbeam(containerRef.current!, embedUrl);
        if (cancelled) {
          try { hb.destroy?.(); } catch {}
          return;
        }
        hyperbeamRef.current = hb;

        hb.tabs.onUpdated.addListener((_tabId: number, changeInfo: any) => {
          if (typeof changeInfo.url === 'string') {
            setCurrentUrl(changeInfo.url);
            setInputUrl(changeInfo.url);
          }
          if (changeInfo.title) setCurrentTitle(changeInfo.title);
        });

        try {
          const tabs = await hb.tabs.query({ active: true, currentWindow: true });
          const tab = tabs?.[0];
          if (tab?.url) {
            setCurrentUrl(tab.url);
            setInputUrl(tab.url);
          }
          if (tab?.title) setCurrentTitle(tab.title);
        } catch {}

        setStatus('ready');
      } catch (err) {
        console.error('Hyperbeam mount failed:', err);
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Unable to load shared browser');
      }
    };

    void mount();
    return () => {
      cancelled = true;
      try { hyperbeamRef.current?.destroy?.(); } catch {}
      hyperbeamRef.current = null;
    };
  }, [embedUrl]);

  const runNavigation = useCallback(async (url: string) => {
    const normalized = normalizeUrl(url);
    if (!normalized || !hyperbeamRef.current) return;
    await hyperbeamRef.current.tabs.update({ url: normalized });
    setCurrentUrl(normalized);
    setInputUrl(normalized);
  }, []);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void runNavigation(inputUrl);
  };

  const home = useMemo(() => !currentUrl || currentUrl === 'about:blank', [currentUrl]);

  return (
    <div className={`w-full h-full flex flex-col bg-slate-950 overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
      <div className="h-12 shrink-0 bg-slate-900/95 border-b border-slate-800 px-3 flex items-center gap-2">
        <button
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30"
          title="Back"
          disabled={!hyperbeamRef.current}
          onClick={() => void hyperbeamRef.current?.tabs.goBack()}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <button
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30"
          title="Forward"
          disabled={!hyperbeamRef.current}
          onClick={() => void hyperbeamRef.current?.tabs.goForward()}
        >
          <ArrowRight className="w-4 h-4" />
        </button>
        <button
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30"
          title="Reload"
          disabled={!hyperbeamRef.current}
          onClick={() => void hyperbeamRef.current?.tabs.reload()}
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        <form onSubmit={handleSubmit} className="flex-1">
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs focus-within:border-sky-500/70">
            <Lock className="w-3.5 h-3.5 text-emerald-400 mr-2 shrink-0" />
            <input
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="Search or enter URL"
              className="w-full bg-transparent text-white placeholder-slate-500 outline-none"
              disabled={!hyperbeamRef.current}
            />
            <button type="submit" className="text-slate-400 hover:text-white ml-2">
              <Search className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>

        <div className="hidden lg:flex items-center gap-2 text-[11px] text-slate-400 max-w-[220px] truncate">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="truncate">{currentTitle || 'Shared Browser'}</span>
        </div>

        <button
          onClick={() => toggleFullscreen('browser')}
          className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white"
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex-1 relative min-h-0">
        {status === 'creating' && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950">
            <div className="flex flex-col items-center gap-3 text-center px-6">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
                <Monitor className="w-6 h-6 text-sky-400 animate-pulse" />
              </div>
              <div className="text-white font-semibold">Starting shared browser…</div>
              <div className="text-xs text-slate-500">This opens one real Chromium session that everyone in the room shares.</div>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950">
            <div className="max-w-md px-6 text-center space-y-3">
              <Settings2 className="w-10 h-10 text-amber-400 mx-auto" />
              <h3 className="text-lg font-bold text-white">Shared browser setup needed</h3>
              <p className="text-sm text-slate-400">{error}</p>
              {isHost && (
                <button
                  onClick={() => void startSession()}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 text-white text-sm font-semibold"
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        )}

        {!embedUrl && status === 'idle' && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950">
            <div className="text-center px-6 space-y-3">
              <Monitor className="w-10 h-10 text-sky-400 mx-auto" />
              <div className="text-white font-semibold">Waiting for the room browser…</div>
              <div className="text-xs text-slate-500">The host starts one shared browser for everyone.</div>
            </div>
          </div>
        )}

        <div ref={containerRef} className="w-full h-full bg-black" />
      </div>

      {!isFullscreen && home && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-[10px] text-slate-300">
          Shared Chromium • synchronized for everyone
        </div>
      )}
    </div>
  );
};
