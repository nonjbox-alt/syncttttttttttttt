import React, { useEffect, useRef } from 'react';
import Hls from 'hls.js';

/**
 * Makes direct HLS (.m3u8) URLs work in Firefox/Chromium.
 * The existing VideoPlayerView owns the <video> element; this bridge only
 * attaches hls.js when the current video source is an HLS manifest.
 */
export const HlsVideoBridge: React.FC = () => {
  const hlsRef = useRef<Hls | null>(null);
  const lastUrlRef = useRef<string>('');

  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;

    const isHls = (url: string) => /\.m3u8(?:[?#]|$)/i.test(url);

    const attach = () => {
      const video = document.querySelector<HTMLVideoElement>('#video-player-container video');
      if (!video) return;

      const src = video.getAttribute('src') || '';
      if (!src || src.startsWith('blob:')) return;

      if (!isHls(src)) {
        hlsRef.current?.destroy();
        hlsRef.current = null;
        lastUrlRef.current = src;
        return;
      }

      if (lastUrlRef.current === src && hlsRef.current) return;
      lastUrlRef.current = src;

      hlsRef.current?.destroy();
      hlsRef.current = null;

      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 30,
        });
        hlsRef.current = hls;
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
            else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari/iOS native HLS fallback.
        video.src = src;
      }
    };

    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    timer = window.setInterval(attach, 500);
    attach();

    return () => {
      disposed = true;
      observer.disconnect();
      if (timer) window.clearInterval(timer);
      hlsRef.current?.destroy();
      hlsRef.current = null;
      if (!disposed) lastUrlRef.current = '';
    };
  }, []);

  return null;
};
