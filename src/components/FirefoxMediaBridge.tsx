import React, { useEffect, useRef, useState } from 'react';
import { Radio, ShieldCheck, ExternalLink, Zap } from 'lucide-react';
import { useRoomStore } from '../store/useRoomStore.ts';
import { socketService } from '../services/socket.ts';

interface BridgeMedia {
  title: string;
  pageUrl: string;
  duration: number;
  position: number;
  isPlaying: boolean;
  playbackRate: number;
  hasHls: boolean;
  hasVideo: boolean;
}

export const FirefoxMediaBridge: React.FC = () => {
  const { roomId, isController, videoState, playVideo, pauseVideo, seekVideo, setVideoPlaybackRate } = useRoomStore();
  const [connected, setConnected] = useState(false);
  const [media, setMedia] = useState<BridgeMedia | null>(null);
  const lastRemoteEventAt = useRef(0);
  const lastCommandKey = useRef('');

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.data?.source !== 'syncroom-extension') return;

      if (event.data.type === 'BRIDGE_STATUS') {
        setConnected(!!event.data.connected);
        return;
      }

      if (event.data.type === 'SOURCE_MEDIA_READY' || event.data.type === 'SOURCE_MEDIA_EVENT') {
        const next = event.data.payload as BridgeMedia | undefined;
        if (!next) return;
        setConnected(true);
        setMedia(next);
        lastRemoteEventAt.current = Date.now();

        if (event.data.type === 'SOURCE_MEDIA_EVENT') {
          if (next.action === 'PLAY') playVideo(next.position);
          else if (next.action === 'PAUSE') pauseVideo(next.position);
          else if (next.action === 'SEEK') seekVideo(next.position);
          else if (next.action === 'RATECHANGE') setVideoPlaybackRate(next.playbackRate);
        }
      }
    };

    window.addEventListener('message', onMessage);
    window.postMessage({ source: 'syncroom-web', type: 'SYNCROOM_EXTENSION_READY' }, '*');
    return () => window.removeEventListener('message', onMessage);
  }, [pauseVideo, playVideo, seekVideo, setVideoPlaybackRate]);

  useEffect(() => {
    if (!connected || !media || !isController || Date.now() - lastRemoteEventAt.current < 900) return;

    const action = videoState.isPlaying ? 'PLAY' : 'PAUSE';
    const key = `${action}:${Math.round(videoState.position * 10)}:${videoState.playbackRate}`;
    if (key === lastCommandKey.current) return;
    lastCommandKey.current = key;

    window.postMessage({
      source: 'syncroom-web',
      type: 'SYNCROOM_EXTENSION_COMMAND',
      payload: {
        action,
        position: videoState.position,
        playbackRate: videoState.playbackRate,
      },
    }, '*');
  }, [connected, isController, media, videoState.isPlaying, videoState.position, videoState.playbackRate]);

  useEffect(() => {
    if (!connected || !isController || Date.now() - lastRemoteEventAt.current < 900) return;
    window.postMessage({
      source: 'syncroom-web',
      type: 'SYNCROOM_EXTENSION_COMMAND',
      payload: { action: 'RATE', playbackRate: videoState.playbackRate },
    }, '*');
  }, [connected, isController, videoState.playbackRate]);

  useEffect(() => {
    if (!connected) return;
    const style = document.createElement('style');
    style.id = 'syncroom-firefox-bridge-style';
    style.textContent = '#video-player-container > video{display:none!important}';
    document.head.appendChild(style);
    return () => style.remove();
  }, [connected]);

  if (!roomId || !connected) return null;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black text-white p-6">
      <div className="w-full max-w-lg rounded-3xl border border-sky-400/20 bg-slate-950/90 backdrop-blur-xl p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-2xl bg-sky-400/10 border border-sky-400/20 flex items-center justify-center">
            <Radio className="w-5 h-5 text-sky-300" />
          </div>
          <div>
            <div className="font-bold">Firefox Media Bridge</div>
            <div className="text-xs text-emerald-300 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Connected</div>
          </div>
        </div>

        <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 mb-4">
          <div className="text-sm font-semibold truncate">{media?.title || 'Media detected'}</div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            {media?.hasHls && <span className="px-2 py-1 rounded-full bg-violet-400/10 text-violet-300 border border-violet-400/20">HLS detected</span>}
            <span className="px-2 py-1 rounded-full bg-emerald-400/10 text-emerald-300 border border-emerald-400/20"><ShieldCheck className="inline w-3 h-3 mr-1" />Source stays local</span>
            <span className="px-2 py-1 rounded-full bg-sky-400/10 text-sky-300 border border-sky-400/20"><Zap className="inline w-3 h-3 mr-1" />Sync only</span>
          </div>
        </div>

        <p className="text-xs text-slate-400 leading-5">
          The video is playing in your paired Firefox source tab. SyncRoom never needs the private M3U8 URL, cookies, or media bytes.
        </p>

        {media?.pageUrl && (
          <div className="mt-4 flex items-center gap-2 text-[11px] text-slate-500 truncate">
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{media.pageUrl}</span>
          </div>
        )}
      </div>
    </div>
  );
};
