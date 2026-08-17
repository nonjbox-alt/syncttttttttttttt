import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, Lock, Search, Crown, ExternalLink, ShieldAlert, Bookmark, Hand, Sparkles, Maximize, Minimize, Globe, Compass, PlayCircle } from 'lucide-react';
import { useRoomStore } from '../store/useRoomStore.ts';

const PRESET_BOOKMARKS = [
  { name: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Special:Random', icon: '📚' },
  { name: 'Archive.org', url: 'https://archive.org', icon: '🏛️' },
  { name: 'CodePen', url: 'https://codepen.io/trending', icon: '💻' },
  { name: 'JSFiddle', url: 'https://jsfiddle.net', icon: '⚡' },
  { name: 'OpenStreetMap', url: 'https://www.openstreetmap.org', icon: '🗺️' },
  { name: 'W3Schools', url: 'https://www.w3schools.com', icon: '🎓' },
  { name: 'DuckDuckGo', url: 'https://duckduckgo.com', icon: '🔍' },
];

const isDirectVideoUrl = (url: string) => /\.(mp4|webm|ogg)(?:[?#].*)?$/i.test(url);
const youtubeUrl = (url: string) => /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{6,})/i.exec(url)?.[1] || null;

export const BrowserView: React.FC = () => {
  const {
    browserState,
    navigateBrowser,
    browserBack,
    browserForward,
    browserReload,
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
    setVideoUrl,
  } = useRoomStore();

  const [urlInput, setUrlInput] = useState(browserState.url || '');
  const [embedAllowed, setEmbedAllowed] = useState(true);
  const [embedReason, setEmbedReason] = useState('');
  const [checking, setChecking] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const isFullscreen = fullscreenContent === 'browser';
  const isHomePage = !browserState.url || browserState.url === 'syncroom:home';
  const isUserTheController = isController || browserState.controllerId === currentUserId;
  const controllerName = browserState.controllerName || (browserState.controllerId && participants[browserState.controllerId]?.name) || 'Host';

  useEffect(() => setUrlInput(browserState.url || ''), [browserState.url]);

  useEffect(() => {
    const url = browserState.url;
    if (!url || url === 'syncroom:home') return;
    setEmbedAllowed(true);
    setEmbedReason('');
    setChecking(false);
    if (isDirectVideoUrl(url)) return;
    if (youtubeUrl(url)) return;
    setChecking(true);
    fetch(`/api/browse/check-embed?url=${encodeURIComponent(url)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setEmbedAllowed(Boolean(data.isEmbeddable));
        setEmbedReason(data.reason || 'This website does not allow embedding.');
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [browserState.url]);

  const openUrl = (raw: string) => {
    let url = raw.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      url = url.includes('.') && !url.includes(' ') ? `https://${url}` : `https://www.google.com/search?q=${encodeURIComponent(url)}`;
    }
    const ytId = youtubeUrl(url);
    if (ytId) {
      setVideoUrl(`https://www.youtube.com/embed/${ytId}?autoplay=1&playsinline=1`, 'youtube', 'YouTube');
      return;
    }
    if (isDirectVideoUrl(url)) {
      setVideoUrl(url, 'direct', url.split('/').pop() || 'Shared Video');
      return;
    }
    navigateBrowser(url);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isUserTheController && followHost) return;
    openUrl(urlInput);
  };

  return (
    <div className={`w-full h-full flex flex-col bg-slate-950 overflow-hidden relative ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
      <div className="h-12 shrink-0 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-3 flex items-center gap-2">
        <button onClick={browserBack} disabled={!isUserTheController} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 disabled:opacity-30"><ArrowLeft className="w-4 h-4" /></button>
        <button onClick={browserForward} disabled={!isUserTheController} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 disabled:opacity-30"><ArrowRight className="w-4 h-4" /></button>
        <button onClick={browserReload} disabled={!isUserTheController} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 disabled:opacity-30"><RotateCw className="w-4 h-4" /></button>
        <form onSubmit={handleSubmit} className="flex-1 max-w-3xl">
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 focus-within:border-sky-500/70">
            <Lock className="w-3.5 h-3.5 text-emerald-400 mr-2 shrink-0" />
            <input value={urlInput} onChange={e => setUrlInput(e.target.value)} disabled={!isUserTheController && followHost} className="w-full bg-transparent text-xs text-white outline-none" placeholder="Search or enter URL" />
            <button type="submit" disabled={!isUserTheController && followHost} className="text-slate-400 hover:text-white disabled:opacity-30"><Search className="w-3.5 h-3.5" /></button>
          </div>
        </form>
        <div className="hidden lg:flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-800 text-[11px] text-slate-300"><Crown className="w-3 h-3 text-amber-400" />{isUserTheController ? 'You control browsing' : `${controllerName} controls`}</div>
        <button onClick={() => setFollowHost(!followHost)} className={`hidden sm:flex px-2.5 py-1 rounded-lg border text-[11px] ${followHost ? 'border-sky-500/30 text-sky-300 bg-sky-500/10' : 'border-slate-700 text-slate-400 bg-slate-800'}`}>Follow: {followHost ? 'ON' : 'OFF'}</button>
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

      {!isFullscreen && (
        <div className="h-8 bg-slate-950/80 border-b border-slate-900 px-3 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0 text-[11px]">
          <span className="text-slate-500 flex items-center gap-1 shrink-0 font-medium"><Bookmark className="w-3 h-3" />Quick:</span>
          {PRESET_BOOKMARKS.map(bm => <button key={bm.name} onClick={() => openUrl(bm.url)} className="px-2 py-0.5 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800/80 shrink-0">{bm.icon} {bm.name}</button>)}
        </div>
      )}

      <div className="flex-1 min-h-0 relative bg-slate-900">
        {isHomePage ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6">
            <Globe className="w-12 h-12 text-sky-400 mb-4" />
            <h2 className="text-2xl font-bold text-white">Shared Browser Lite</h2>
            <p className="mt-2 max-w-xl text-sm text-slate-400">مجاني ويشتغل بالكامل من موقع SyncRoom. المواقع التي تسمح بالـ iframe تفتح هنا، وروابط YouTube والفيديو المباشر تنتقل تلقائيًا إلى المشغل المتزامن.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2 text-xs text-slate-400"><span className="px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800">🌐 Web embeds</span><span className="px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800">▶️ YouTube sync</span><span className="px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800">🎬 MP4/WebM</span></div>
          </div>
        ) : youtubeUrl(browserState.url) ? (
          <div className="h-full flex items-center justify-center"><button onClick={() => openUrl(browserState.url)} className="px-5 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-semibold flex items-center gap-2"><PlayCircle className="w-5 h-5" />Open synchronized YouTube video</button></div>
        ) : isDirectVideoUrl(browserState.url) ? (
          <div className="h-full flex items-center justify-center"><button onClick={() => openUrl(browserState.url)} className="px-5 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-semibold flex items-center gap-2"><PlayCircle className="w-5 h-5" />Open synchronized video</button></div>
        ) : embedAllowed ? (
          <iframe ref={iframeRef} src={browserState.url} title={browserState.title} className="w-full h-full border-0 bg-white" allow="autoplay; fullscreen; picture-in-picture; clipboard-read; clipboard-write" />
        ) : (
          <div className="h-full flex items-center justify-center p-6 text-center"><div className="max-w-lg"><ShieldAlert className="w-12 h-12 text-amber-400 mx-auto mb-4" /><h3 className="text-lg font-bold text-white">هذا الموقع يمنع التضمين</h3><p className="text-sm text-slate-400 mt-2">{checking ? 'Checking…' : embedReason || 'The site blocks iframe embedding.'}</p><p className="text-xs text-slate-500 mt-4">للروابط المدعومة مثل YouTube والفيديو المباشر استخدم الرابط نفسه وسيحوّلك SyncRoom تلقائيًا إلى المشغل المتزامن.</p></div></div>
        )}
      </div>
    </div>
  );
};
