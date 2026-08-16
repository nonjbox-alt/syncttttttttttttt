import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Lock,
  Search,
  Crown,
  Monitor,
  ExternalLink,
  ShieldAlert,
  Bookmark,
  Hand,
  Sparkles,
  Maximize,
  Minimize,
  Globe,
  Compass,
} from 'lucide-react';
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
    toggleScreenShare,
    participants,
    fullscreenContent,
    setFullscreenContent,
    toggleFullscreen,
  } = useRoomStore();

  const [urlInput, setUrlInput] = useState(browserState.url || '');
  const [isCheckingEmbed, setIsCheckingEmbed] = useState(false);
  const [showFloatingNav, setShowFloatingNav] = useState(true);
  const [embedCheckResult, setEmbedCheckResult] = useState<{
    isEmbeddable: boolean;
    suggestTabShare?: boolean;
    reason?: string;
  }>({ isEmbeddable: true });

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const floatingNavTimerRef = useRef<any>(null);

  const isFullscreen = fullscreenContent === 'browser';
  const isHomePage = !browserState.url || browserState.url === '' || browserState.url === 'syncroom:home';

  // Sync URL input whenever shared browser URL changes
  useEffect(() => {
    setUrlInput(browserState.url || '');
    if (browserState.url && browserState.url !== 'syncroom:home') {
      checkEmbeddability(browserState.url);
    } else {
      setEmbedCheckResult({ isEmbeddable: true });
    }
  }, [browserState.url]);

  const checkEmbeddability = async (targetUrl: string) => {
    setIsCheckingEmbed(true);
    try {
      const res = await fetch(`/api/browse/check-embed?url=${encodeURIComponent(targetUrl)}`);
      const data = await res.json();
      setEmbedCheckResult({
        isEmbeddable: data.isEmbeddable,
        suggestTabShare: data.suggestTabShare,
        reason: data.reason,
      });
    } catch {
      setEmbedCheckResult({ isEmbeddable: true });
    } finally {
      setIsCheckingEmbed(false);
    }
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = urlInput.trim();
    if (!query) return;
    navigateBrowser(query);
  };

  const handleBookmarkClick = (url: string) => {
    setUrlInput(url);
    navigateBrowser(url);
  };

  const handleSwitchToTabShare = async () => {
    await toggleScreenShare();
  };

  const handleMouseMoveInFullscreen = () => {
    if (!isFullscreen) return;
    setShowFloatingNav(true);
    if (floatingNavTimerRef.current) {
      clearTimeout(floatingNavTimerRef.current);
    }
    floatingNavTimerRef.current = setTimeout(() => {
      setShowFloatingNav(false);
    }, 3000);
  };

  const controllerName =
    browserState.controllerName ||
    (browserState.controllerId && participants[browserState.controllerId]?.name) ||
    'Host';

  const isUserTheController = isController || browserState.controllerId === currentUserId;

  return (
    <div
      ref={containerRef}
      id="browser-view-container"
      onMouseMove={handleMouseMoveInFullscreen}
      className={`w-full h-full flex flex-col bg-slate-950 overflow-hidden relative select-none ${
        isFullscreen ? 'fixed inset-0 z-50 min-h-[100dvh]' : ''
      }`}
    >
      {/* Top Browser Chrome Toolbar (Visible in standard mode or floating in fullscreen mode) */}
      <div
        className={`bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-3 flex items-center justify-between gap-2 shrink-0 transition-all duration-200 z-30 ${
          isFullscreen
            ? `absolute top-0 left-0 right-0 h-12 shadow-2xl ${
                showFloatingNav ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
              }`
            : 'h-12'
        }`}
      >
        {/* Navigation buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            id="browser-btn-back"
            onClick={browserBack}
            disabled={!isUserTheController || browserState.historyIndex <= 0}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
            title="Back (←)"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            id="browser-btn-forward"
            onClick={browserForward}
            disabled={!isUserTheController || browserState.historyIndex >= browserState.history.length - 1}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
            title="Forward (→)"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            id="browser-btn-reload"
            onClick={browserReload}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
            title="Reload page (⟳)"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        {/* URL / Address Bar */}
        <form onSubmit={handleUrlSubmit} className="flex-1 max-w-2xl mx-1 sm:mx-2 relative">
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus-within:border-sky-500/80 focus-within:ring-1 focus-within:ring-sky-500/80 transition-all">
            <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0 mr-2" />
            <input
              id="browser-url-input"
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              disabled={!isUserTheController && followHost}
              placeholder="Search or enter URL (e.g. https://wikipedia.org)"
              className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none disabled:text-slate-400"
            />
            {isCheckingEmbed && <RotateCw className="w-3 h-3 text-sky-400 animate-spin shrink-0 ml-2" />}
            <button
              id="browser-btn-go"
              type="submit"
              disabled={!isUserTheController && followHost}
              className="ml-2 text-slate-400 hover:text-sky-400 disabled:opacity-30 cursor-pointer"
              title="Navigate to URL"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>

        {/* Controller, Follow & Fullscreen Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Controller Badge */}
          <div
            className={`hidden md:flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border ${
              isUserTheController
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                : 'bg-slate-800 border-slate-700 text-slate-300'
            }`}
          >
            <Crown className="w-3 h-3 text-amber-400" />
            <span>{isUserTheController ? 'You control browsing' : `${controllerName} controls`}</span>
          </div>

          {/* Follow Host Toggle */}
          <button
            id="browser-toggle-follow"
            onClick={() => setFollowHost(!followHost)}
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
              followHost
                ? 'bg-sky-500/10 border-sky-500/30 text-sky-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title="When ON, navigation synchronizes automatically with the host"
          >
            <span>Follow Host:</span>
            <span className="font-bold">{followHost ? 'ON' : 'OFF'}</span>
          </button>

          {/* Request Control Button (for guests) */}
          {!isUserTheController && (
            <button
              id="browser-btn-request-control"
              onClick={requestControl}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-medium transition-colors cursor-pointer"
            >
              <Hand className="w-3 h-3 text-indigo-400" />
              <span className="hidden sm:inline">Request Control</span>
              <span className="sm:hidden">Control</span>
            </button>
          )}

          {/* External link button */}
          {browserState.url && (
            <a
              href={browserState.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              title="Open in new window"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}

          {/* True Fullscreen Toggle */}
          <button
            id="browser-btn-fullscreen"
            onClick={() => toggleFullscreen('browser')}
            className={`p-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
              isFullscreen
                ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750 hover:text-white'
            }`}
            title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Enter True Fullscreen (⛶)'}
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Bookmarks Quick Bar (Hidden in Fullscreen for immersive space) */}
      {!isFullscreen && (
        <div className="h-8 bg-slate-950/80 border-b border-slate-900 px-3 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0 text-[11px]">
          <span className="text-slate-500 flex items-center gap-1 shrink-0 font-medium">
            <Bookmark className="w-3 h-3" /> Quick:
          </span>
          {PRESET_BOOKMARKS.map((bm) => (
            <button
              key={bm.name}
              onClick={() => handleBookmarkClick(bm.url)}
              className="px-2 py-0.5 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800/80 transition-colors cursor-pointer shrink-0 flex items-center gap-1"
            >
              <span>{bm.icon}</span>
              <span>{bm.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Host Take Control Request Banner */}
      {isHost && pendingControlRequest && (
        <div className="bg-gradient-to-r from-amber-950/80 via-amber-900/60 to-slate-950 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between gap-3 text-xs text-amber-200 z-20 animate-fadeIn shrink-0">
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-amber-400 animate-bounce" />
            <span>
              <strong>{pendingControlRequest.userName}</strong> wants to control the shared browser.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => respondControl(pendingControlRequest.userId, true)}
              className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg transition-colors cursor-pointer"
            >
              Allow
            </button>
            <button
              onClick={() => respondControl(pendingControlRequest.userId, false)}
              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors cursor-pointer"
            >
              Deny
            </button>
          </div>
        </div>
      )}

      {/* Browser Body Stage */}
      <div className="flex-1 w-full h-full relative bg-slate-900 flex flex-col items-center justify-center overflow-hidden">
        {isHomePage ? (
          /* SyncRoom Browser Start / Home Dashboard */
          <div className="max-w-2xl w-full mx-auto p-6 sm:p-8 space-y-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center mx-auto shadow-xl shadow-sky-500/20">
              <Globe className="w-8 h-8 text-white" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-white tracking-tight">Shared Web Browser</h2>
              <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
                Browse websites together in real time. Enter any URL or choose a destination below to start exploring.
              </p>
            </div>

            {/* Quick URL Input */}
            <form onSubmit={handleUrlSubmit} className="max-w-xl mx-auto flex gap-2">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Enter URL (e.g. https://wikipedia.org or https://codepen.io)"
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
              <button
                type="submit"
                className="px-5 py-2.5 bg-gradient-to-r from-sky-500 to-indigo-600 hover:brightness-110 active:scale-[0.99] text-white font-semibold text-xs rounded-xl shadow-lg shadow-sky-500/20 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Compass className="w-4 h-4" />
                <span>Open</span>
              </button>
            </form>

            {/* Destination Tiles */}
            <div className="space-y-3 pt-2 text-left">
              <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                Popular Shared Destinations:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {PRESET_BOOKMARKS.map((bm) => (
                  <button
                    key={bm.name}
                    onClick={() => handleBookmarkClick(bm.url)}
                    className="p-3 rounded-xl bg-slate-950/70 hover:bg-slate-800 border border-slate-800/80 hover:border-slate-700 text-left transition-all cursor-pointer flex items-center gap-2.5 group"
                  >
                    <span className="text-lg">{bm.icon}</span>
                    <div className="truncate">
                      <div className="text-xs font-bold text-slate-200 group-hover:text-white truncate">
                        {bm.name}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">{bm.url}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : embedCheckResult.isEmbeddable ? (
          /* Embedded Browser IFrame Mode */
          <div className="w-full h-full relative">
            <iframe
              id="shared-browser-iframe"
              ref={iframeRef}
              src={browserState.url}
              title={browserState.title || 'Shared Browser'}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              className="w-full h-full border-0 bg-white"
            />

            {/* Controlled by notice */}
            {!isUserTheController && (
              <div className="absolute top-2 right-2 pointer-events-none">
                <div className="px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md text-[10px] text-slate-300 border border-white/10 shadow-lg">
                  👑 Controlled by {controllerName}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Fallback Screen Share Tab Mode (When sites send X-Frame-Options / CSP) */
          <div className="max-w-lg mx-auto p-6 sm:p-8 text-center space-y-5 bg-slate-950/90 rounded-2xl border border-slate-800 shadow-2xl backdrop-blur-md">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-7 h-7" />
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-bold text-white tracking-tight">
                Embedded Browsing Restricted
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                <strong className="text-slate-200">{browserState.url}</strong> enforces strict browser security policies (<code className="bg-slate-900 px-1 py-0.5 rounded text-amber-300">X-Frame-Options / CSP</code>) that disallow direct iframe embedding.
              </p>
            </div>

            <div className="p-4 bg-slate-900/90 rounded-xl border border-slate-800 text-left space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-sky-400">
                <Sparkles className="w-4 h-4" />
                <span>Recommended Solution: Tab Screen Share</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Open the website in your browser tab and click below to share that tab with full HD video and synchronized audio.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <button
                id="btn-share-browser-tab"
                onClick={handleSwitchToTabShare}
                className="w-full sm:flex-1 py-2.5 px-4 bg-gradient-to-r from-sky-500 to-indigo-600 hover:brightness-110 active:scale-[0.99] text-white font-semibold text-xs rounded-xl shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Monitor className="w-4 h-4" />
                <span>Share Browser Tab</span>
              </button>

              <a
                href={browserState.url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs rounded-xl border border-slate-700 flex items-center justify-center gap-1.5 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open in Tab</span>
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
