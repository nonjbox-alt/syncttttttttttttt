import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Monitor,
  MonitorOff,
  Maximize,
  Minimize,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useRoomStore } from '../store/useRoomStore.ts';
import { FloatingCameras } from './FloatingCameras.tsx';

export const ScreenShareView: React.FC = () => {
  const {
    activeScreenSharerId,
    activeScreenSharerName,
    isScreenSharing,
    localScreenStream,
    remoteScreenStreams,
    toggleScreenShare,
    fullscreenContent,
    setFullscreenContent,
    toggleFullscreen,
  } = useRoomStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<any>(null);

  const [objectFit, setObjectFit] = useState<'contain' | 'cover'>('contain');
  const [isHoveringControls, setIsHoveringControls] = useState(true);

  const isFullscreen = fullscreenContent === 'screen';

  // Determine active stream (either local or from remote peer)
  const isLocalSharing = isScreenSharing && !!localScreenStream;
  let currentStream: MediaStream | null = null;

  if (isLocalSharing) {
    currentStream = localScreenStream;
  } else if (activeScreenSharerId && remoteScreenStreams[activeScreenSharerId]) {
    currentStream = remoteScreenStreams[activeScreenSharerId];
  } else {
    const firstRemoteSharer = Object.keys(remoteScreenStreams)[0];
    if (firstRemoteSharer) {
      currentStream = remoteScreenStreams[firstRemoteSharer];
    }
  }

  useEffect(() => {
    if (videoRef.current && currentStream) {
      videoRef.current.srcObject = currentStream;
      videoRef.current.play().catch((e) => console.warn('Screen video autoplay blocked:', e));
    }
  }, [currentStream]);

  const handleUserActivity = useCallback(() => {
    setIsHoveringControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (currentStream) {
      controlsTimeoutRef.current = setTimeout(() => {
        setIsHoveringControls(false);
      }, 3000);
    }
  }, [currentStream]);

  const handleFullscreenToggle = () => {
    toggleFullscreen('screen');
    if (!document.fullscreenElement && containerRef.current) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  };

  const sharerDisplayName = isLocalSharing
    ? 'You are sharing'
    : activeScreenSharerName
    ? `${activeScreenSharerName} is sharing`
    : 'Screen Sharing';

  return (
    <div
      ref={containerRef}
      id="screen-share-stage"
      onMouseMove={handleUserActivity}
      onClick={handleUserActivity}
      className={`w-full h-full relative bg-[#06090f] flex items-center justify-center overflow-hidden select-none ${
        isFullscreen ? 'fixed inset-0 z-50 min-h-[100dvh]' : ''
      }`}
    >
      {currentStream ? (
        <>
          {/* Main Video Stream Element */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isLocalSharing} // Mute local preview to prevent echo feedback loop
            className={`w-full h-full ${
              objectFit === 'contain' ? 'object-contain' : 'object-cover'
            } transition-all duration-200`}
          />

          {/* Top Presenter Badge & Controls Overlay */}
          <div
            className={`absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-20 transition-opacity duration-200 ${
              isHoveringControls ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {/* Presenter Name Badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/75 backdrop-blur-md border border-white/10 text-xs text-white shadow-xl pointer-events-auto">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <Monitor className="w-3.5 h-3.5 text-indigo-400" />
              <span className="font-semibold">{sharerDisplayName}</span>
            </div>

            {/* Top Right Controls */}
            <div className="flex items-center gap-2 pointer-events-auto">
              {isLocalSharing && (
                <button
                  id="btn-stop-sharing-top"
                  onClick={toggleScreenShare}
                  className="px-3 py-1.5 rounded-full bg-rose-500 hover:bg-rose-600 active:scale-95 text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-rose-500/20 transition-all cursor-pointer"
                >
                  <MonitorOff className="w-3.5 h-3.5" />
                  <span>Stop Sharing</span>
                </button>
              )}

              <button
                id="btn-toggle-fit"
                onClick={() => setObjectFit(objectFit === 'contain' ? 'cover' : 'contain')}
                className="p-1.5 rounded-full bg-black/70 hover:bg-black/90 text-slate-300 hover:text-white border border-white/10 backdrop-blur-md transition-colors cursor-pointer"
                title={objectFit === 'contain' ? 'Fill screen' : 'Fit to screen'}
              >
                <Sparkles className="w-4 h-4" />
              </button>

              <button
                id="btn-toggle-fullscreen-screen"
                onClick={handleFullscreenToggle}
                className="p-1.5 rounded-full bg-black/70 hover:bg-black/90 text-slate-300 hover:text-white border border-white/10 backdrop-blur-md transition-colors cursor-pointer"
                title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'True Fullscreen (⛶)'}
              >
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Floating Camera Tiles Overlay */}
          <FloatingCameras />
        </>
      ) : (
        /* Empty State: No active screen share */
        <div className="max-w-md mx-auto p-6 sm:p-8 text-center space-y-5 bg-slate-900/80 rounded-2xl border border-slate-800 shadow-2xl backdrop-blur-md">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto shadow-inner">
            <Monitor className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h3 className="text-xl font-bold text-white tracking-tight">Screen Share Ready</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Share your screen, an application window, or a browser tab with 60 FPS video and synchronized audio.
            </p>
          </div>

          <button
            id="btn-start-screen-share-empty"
            onClick={toggleScreenShare}
            className="w-full py-3 px-4 bg-gradient-to-r from-sky-500 via-indigo-600 to-sky-500 hover:brightness-110 active:scale-[0.99] text-white font-semibold text-xs rounded-xl shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <Monitor className="w-4 h-4" />
            <span>Start Sharing Screen</span>
          </button>
        </div>
      )}
    </div>
  );
};
