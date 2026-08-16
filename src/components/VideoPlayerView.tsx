import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Link as LinkIcon,
  Sparkles,
  Film,
  CheckCircle2,
  Sliders,
} from 'lucide-react';
import { useRoomStore } from '../store/useRoomStore.ts';
import { socketService } from '../services/socket.ts';
import { FloatingCameras } from './FloatingCameras.tsx';

const SAMPLE_VIDEOS = [
  {
    name: 'Big Buck Bunny (Animation HD)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    type: 'direct' as const,
  },
  {
    name: 'Elephants Dream (Open Sci-Fi)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    type: 'direct' as const,
  },
  {
    name: 'For Bigger Blazes (Action Demo)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    type: 'direct' as const,
  },
  {
    name: 'Tears of Steel (VFX Short)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    type: 'direct' as const,
  },
];

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export const VideoPlayerView: React.FC = () => {
  const {
    videoState,
    playVideo,
    pauseVideo,
    seekVideo,
    setVideoUrl,
    isController,
    currentUserId,
  } = useRoomStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [customUrlInput, setCustomUrlInput] = useState('');
  const [driftOffset, setDriftOffset] = useState<number>(0);
  const [isHoveringControls, setIsHoveringControls] = useState(false);

  // Synchronize player with videoState & server time
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const syncInterval = setInterval(() => {
      if (!video) return;

      const currentServerTime = socketService.getSyncedServerTime();
      let targetPosition = videoState.position;

      if (videoState.isPlaying) {
        const timePassedSinceServerUpdate = (currentServerTime - videoState.serverTime) / 1000;
        targetPosition = Math.max(0, videoState.position + Math.max(0, timePassedSinceServerUpdate));
      }

      const diff = targetPosition - video.currentTime;
      setDriftOffset(Math.abs(diff));

      // Handle Play / Pause sync
      if (videoState.isPlaying && video.paused) {
        video.play().catch(() => {});
      } else if (!videoState.isPlaying && !video.paused) {
        video.pause();
      }

      // Drift correction algorithm
      if (Math.abs(diff) > 0.6) {
        // Significant drift: Hard seek
        video.currentTime = targetPosition;
        video.playbackRate = 1.0;
      } else if (Math.abs(diff) > 0.08 && videoState.isPlaying) {
        // Minor drift: Nudge playback rate smoothly to catch up or slow down
        video.playbackRate = diff > 0 ? 1.04 : 0.96;
      } else {
        video.playbackRate = 1.0;
      }
    }, 400);

    return () => clearInterval(syncInterval);
  }, [videoState]);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      if (!duration && videoRef.current.duration) {
        setDuration(videoRef.current.duration);
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (videoState.isPlaying) {
      pauseVideo(videoRef.current.currentTime);
    } else {
      playVideo(videoRef.current.currentTime);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPos = parseFloat(e.target.value);
    setCurrentTime(newPos);
    seekVideo(newPos);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    if (videoRef.current) {
      videoRef.current.volume = newVol;
      videoRef.current.muted = newVol === 0;
    }
    setIsMuted(newVol === 0);
  };

  const toggleMute = () => {
    if (videoRef.current) {
      const nextMuted = !isMuted;
      videoRef.current.muted = nextMuted;
      setIsMuted(nextMuted);
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleLoadCustomUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customUrlInput.trim()) return;
    setVideoUrl(customUrlInput.trim());
    setShowUrlModal(false);
    setCustomUrlInput('');
  };

  return (
    <div
      ref={containerRef}
      id="video-player-container"
      onMouseEnter={() => setIsHoveringControls(true)}
      onMouseLeave={() => setIsHoveringControls(false)}
      className="w-full h-full relative bg-black flex items-center justify-center overflow-hidden select-none group"
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        src={videoState.url}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        playsInline
        className="w-full h-full object-contain"
      />

      {/* Floating Cameras Overlay (Picture in Picture) */}
      <FloatingCameras />

      {/* Top Header Bar: Video Title, Sync Indicator, Load Video Button */}
      <div
        className={`absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-20 transition-opacity duration-200 ${
          isHoveringControls || !videoState.isPlaying ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Title & Sync Badge */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/75 backdrop-blur-md border border-white/10 text-xs text-white shadow-xl">
            <Film className="w-3.5 h-3.5 text-sky-400" />
            <span className="font-semibold max-w-[200px] sm:max-w-xs truncate">
              {videoState.title || 'Shared Video'}
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md border border-white/10 text-[11px] text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Synced ({driftOffset < 0.05 ? '< 0.05s' : `${driftOffset.toFixed(2)}s`})</span>
          </div>
        </div>

        {/* Change Video Button */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            id="btn-open-video-modal"
            onClick={() => setShowUrlModal(true)}
            className="px-3 py-1.5 rounded-full bg-black/75 hover:bg-black/90 text-white text-xs font-semibold flex items-center gap-1.5 border border-white/10 backdrop-blur-md transition-colors cursor-pointer"
          >
            <LinkIcon className="w-3.5 h-3.5 text-sky-400" />
            <span>Change Video</span>
          </button>
        </div>
      </div>

      {/* Bottom Video Controls Overlay */}
      <div
        className={`absolute bottom-0 left-0 right-0 p-3 sm:p-4 bg-gradient-to-t from-black/90 via-black/60 to-transparent flex flex-col gap-2 z-20 transition-opacity duration-200 ${
          isHoveringControls || !videoState.isPlaying ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Progress Seek Bar */}
        <div className="w-full flex items-center gap-2">
          <input
            id="video-seek-slider"
            type="range"
            min="0"
            max={duration || 100}
            step="0.1"
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1.5 bg-white/20 hover:bg-white/30 rounded-lg appearance-none cursor-pointer accent-sky-400 transition-all"
          />
        </div>

        {/* Controls Toolbar */}
        <div className="flex items-center justify-between text-white text-xs">
          {/* Left Controls: Play/Pause, Replay, Time */}
          <div className="flex items-center gap-3">
            <button
              id="btn-video-play-pause"
              onClick={handlePlayPause}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              title={videoState.isPlaying ? 'Pause' : 'Play'}
            >
              {videoState.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white" />}
            </button>

            <button
              onClick={() => seekVideo(0)}
              className="p-1.5 rounded-full hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Replay from start"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            {/* Time Stamp */}
            <div className="font-mono text-xs text-slate-300">
              <span>{formatTime(currentTime)}</span>
              <span className="text-slate-500 mx-1">/</span>
              <span className="text-slate-400">{formatTime(duration)}</span>
            </div>
          </div>

          {/* Right Controls: Volume Slider, Fullscreen */}
          <div className="flex items-center gap-3">
            {/* Volume Control */}
            <div className="flex items-center gap-2">
              <button
                onClick={toggleMute}
                className="text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 sm:w-20 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-sky-400"
              />
            </div>

            {/* Fullscreen Button */}
            <button
              id="btn-video-fullscreen"
              onClick={toggleFullscreen}
              className="p-1.5 rounded-full hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Change Video URL Modal */}
      {showUrlModal && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-40 animate-fadeIn">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <h4 className="text-base font-bold text-white flex items-center gap-2">
                <Film className="w-4 h-4 text-sky-400" />
                Change Synchronized Video
              </h4>
              <button
                onClick={() => setShowUrlModal(false)}
                className="text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            {/* Custom URL Form */}
            <form onSubmit={handleLoadCustomUrl} className="space-y-3">
              <label className="text-xs font-medium text-slate-300 block">
                Enter Video URL (MP4, WebM, HLS stream)
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={customUrlInput}
                  onChange={(e) => setCustomUrlInput(e.target.value)}
                  placeholder="https://example.com/movie.mp4"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs rounded-xl shadow-md transition-colors cursor-pointer"
                >
                  Load
                </button>
              </div>
            </form>

            {/* Sample Presets */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Or pick a demo stream:</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SAMPLE_VIDEOS.map((vid) => (
                  <button
                    key={vid.name}
                    onClick={() => {
                      setVideoUrl(vid.url, vid.type, vid.name);
                      setShowUrlModal(false);
                    }}
                    className="p-2.5 rounded-xl bg-slate-950/70 hover:bg-slate-800 border border-slate-800/80 text-left text-xs text-slate-200 hover:text-white transition-colors cursor-pointer flex items-center justify-between"
                  >
                    <span className="truncate">{vid.name}</span>
                    <Sparkles className="w-3 h-3 text-sky-400 shrink-0 ml-1" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
