(() => {
  const browserApi = typeof browser !== 'undefined' ? browser : chrome;
  const isSyncRoom = (() => {
    try {
      const host = location.hostname;
      return host === 'syncttttttttttttt.vercel.app' || host === 'localhost' || host === '127.0.0.1';
    } catch {
      return false;
    }
  })();

  let activeVideo = null;
  let ignoreEventsUntil = 0;
  let lastSnapshot = '';
  let scanTimer = null;

  const getHlsHint = () => performance.getEntriesByType('resource').some((entry) => /\.m3u8(?:[?#]|$)/i.test(entry.name));

  const chooseVideo = () => {
    const videos = [...document.querySelectorAll('video')];
    if (!videos.length) return null;
    return videos
      .filter((video) => video.readyState > 0 || !video.paused)
      .sort((a, b) => (b.videoWidth * b.videoHeight) - (a.videoWidth * a.videoHeight))[0] || videos[0];
  };

  const snapshot = (video) => ({
    title: document.title || 'Firefox media',
    duration: Number.isFinite(video?.duration) ? video.duration : 0,
    position: video?.currentTime || 0,
    isPlaying: !!video && !video.paused && !video.ended,
    playbackRate: video?.playbackRate || 1,
    hasHls: getHlsHint(),
    hasVideo: !!video,
  });

  const sendSnapshot = (force = false) => {
    if (!activeVideo) return;
    const data = snapshot(activeVideo);
    const key = JSON.stringify(data);
    if (!force && key === lastSnapshot) return;
    lastSnapshot = key;
    browserApi.runtime.sendMessage({ type: 'SOURCE_MEDIA_READY', payload: data });
  };

  const sendEvent = (action) => {
    if (!activeVideo || Date.now() < ignoreEventsUntil) return;
    browserApi.runtime.sendMessage({ type: 'SOURCE_MEDIA_EVENT', payload: { ...snapshot(activeVideo), action } });
  };

  const bindVideo = (video) => {
    if (activeVideo === video) return;
    activeVideo = video;
    ['play', 'pause', 'loadedmetadata', 'durationchange', 'ratechange'].forEach((eventName) => {
      video.addEventListener(eventName, () => sendEvent(eventName.toUpperCase()), { passive: true });
    });
    video.addEventListener('seeked', () => sendEvent('SEEK'), { passive: true });
    video.addEventListener('emptied', () => sendSnapshot(true), { passive: true });
    sendSnapshot(true);
  };

  const scan = () => {
    const video = chooseVideo();
    if (video) bindVideo(video);
  };

  browserApi.runtime.onMessage.addListener((message) => {
    if (!message) return;

    if (message.type === 'PAIR_SOURCE_TAB') {
      browserApi.runtime.sendMessage({ type: 'PAIR_SOURCE_TAB' }).catch(() => {});
      scan();
      return;
    }

    if (message.type === 'PAIR_SYNCROOM_TAB') {
      browserApi.runtime.sendMessage({ type: 'PAIR_SYNCROOM_TAB' }).catch(() => {});
      return;
    }

    if (!isSyncRoom && message.type === 'SYNCROOM_COMMAND') {
      scan();
      if (!activeVideo) return;
      const command = message.payload || {};
      ignoreEventsUntil = Date.now() + 800;
      try {
        if (command.action === 'PLAY') {
          if (Number.isFinite(command.position)) activeVideo.currentTime = command.position;
          activeVideo.playbackRate = command.playbackRate || 1;
          activeVideo.play().catch(() => {});
        } else if (command.action === 'PAUSE') {
          if (Number.isFinite(command.position)) activeVideo.currentTime = command.position;
          activeVideo.pause();
        } else if (command.action === 'SEEK') {
          if (Number.isFinite(command.position)) activeVideo.currentTime = command.position;
        } else if (command.action === 'RATE') {
          activeVideo.playbackRate = command.playbackRate || 1;
        }
      } catch (_) {}
      setTimeout(() => sendSnapshot(true), 900);
    }
  });

  if (!isSyncRoom) {
    scan();
    scanTimer = setInterval(scan, 1500);
  } else {
    browserApi.runtime.sendMessage({ type: 'PAIR_SYNCROOM_TAB' }).catch(() => {});

    window.addEventListener('message', (event) => {
      if (event.source !== window || event.data?.source !== 'syncroom-web') return;
      if (event.data.type === 'SYNCROOM_EXTENSION_COMMAND') {
        browserApi.runtime.sendMessage({ type: 'SYNCROOM_COMMAND', payload: event.data.payload }).catch(() => {});
      }
    });

    browserApi.runtime.onMessage.addListener((message) => {
      if (!message) return;
      if (message.type === 'SOURCE_MEDIA_READY' || message.type === 'SOURCE_MEDIA_EVENT' || message.type === 'BRIDGE_STATUS') {
        window.postMessage({ source: 'syncroom-extension', type: message.type, payload: message.payload, connected: message.connected }, '*');
      }
    });
  }

  window.addEventListener('unload', () => {
    if (scanTimer) clearInterval(scanTimer);
  });
})();
