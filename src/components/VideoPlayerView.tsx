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
  FolderOpen,
  Monitor,
  Share2,
  Sliders,
  Check,
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

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

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
    setVideoPlaybackRate,
    isController,
    currentUserId,
    localVideoBlobUrl,
    localVideoFileName,
    setLocalVideoFile,
    toggleScreenShare,
    fullscreenContent,
    setFullscreenContent,
    toggleFullscreen,
  } = useRoomStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const controlsTimeoutRef = useRef<any>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [customUrlInput, setCustomUrlInput] = useState('');
  const [driftOffset, setDriftOffset] = useState<number>(0);
  const [isHoveringControls, setIsHoveringControls] = useState(true);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  const isFullscreen = fullscreenContent === 'video';
  const activeVideoSrc = localVideoBlobUrl || videoState.url;
  const isUsingLocalFile = !!localVideoBlobUrl;

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
        video.playbackRate = videoState.playbackRate || 1.0;
      } else if (Math.abs(diff) > 0.08 && videoState.isPlaying) {
        // Minor drift: Nudge playback rate smoothly to catch up or slow down
        video.playbackRate = diff > 0 ? 1.05 : 0.95;
      } else {
        video.playbackRate = videoState.playbackRate || 1.0;
      }
    }, 400);

    return () => clearInterval(syncInterval);
  }, [videoState]);

  // Handle auto-hiding controls when idle during playback
  const handleUserActivity = useCallback(() => {
    setIsHoveringControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (videoState.isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setIsHoveringControls(false);
      }, 3000);
    }
  }, [videoState.isPlaying]);

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

  const handleFullscreenToggle = () => {
    toggleFullscreen('video');
    if (!document.fullscreenElement && containerRef.current) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLocalVideoFile(file);
      setShowUrlModal(false);
    }
  };

  const handleLoadCustomUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customUrlInput.trim()) return;
    setVideoUrl(customUrlInput.trim(), 'direct', 'Online Stream');
    setShowUrlModal(false);
    setCustomUrlInput('');
  };

  return (
    <div
      ref={containerRef}
      id="video-player-container"
      onMouseMove={handleUserActivity}
      onClick={handleUserActivity}
      className={`w-full h-full relative bg-black flex items-center justify-center overflow-hidden select-none group ${
        isFullscreen ? 'fixed inset-0 z-50 min-h-[100dvh]' : ''
      }`}
    >
      {/* Hidden File Input for Local Video File */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm,video/ogg,video/quicktime,video/x-matroska,.mkv,.mp4,.webm,.mov"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Video Element */}
      <video
        ref={videoRef}
        src={activeVideoSrc}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        playsInline
        className="w-full h-full object-contain"
      />

      {/* Floating Cameras Overlay (Picture in Picture) */}
      <FloatingCameras />

      {/* Local Video Notification Banner */}
      {isUsingLocalFile && (
        <div
          className={`absolute top-16 left-1/2 -translate-x-1/2 max-w-md w-full px-4 py-2 bg-slate-900/95 border border-sky-500/30 rounded-xl shadow-2xl backdrop-blur-md z-30 flex items-center justify-between gap-3 text-xs transition-opacity duration-300 ${
            isHoveringControls || !videoState.isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="flex items-center gap-2 truncate">
            <FolderOpen className="w-4 h-4 text-sky-400 shrink-0" />
            <div className="truncate">
              <div className="font-semibold text-white truncate">{localVideoFileName}</div>
              <div className="text-[10px] text-slate-400">Local video (zero server upload)</div>
            </div>
          </div>
          <button
            onClick={toggleScreenShare}
            className="px-2.5 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-semibold text-[11px] flex items-center gap-1 shrink-0 transition-colors cursor-pointer shadow-sm"
            title="Stream this tab with audio to all participants"
          >
            <Monitor className="w-3 h-3" />
            <span>Share to Room</span>
          </button>
        </div>
      )}

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
              {isUsingLocalFile ? localVideoFileName : videoState.title || 'Shared Video'}
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md border border-white/10 text-[11px] text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Synced ({driftOffset < 0.05 ? '< 0.05s' : `${driftOffset.toFixed(2)}s`})</span>
          </div>
        </div>

        {/* Action Buttons: Pick Local File, Change Video, Fullscreen */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            id="btn-pick-local-file"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 rounded-full bg-sky-600/80 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-1.5 border border-sky-400/30 backdrop-blur-md transition-colors cursor-pointer shadow-lg shadow-sky-500/20"
            title="Play a local video file from your computer"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Local File</span>
          </button>

          <button
            id="btn-open-video-modal"
            onClick={() => setShowUrlModal(true)}
            className="px-3 py-1.5 rounded-full bg-black/75 hover:bg-black/90 text-white text-xs font-semibold flex items-center gap-1.5 border border-white/10 backdrop-blur-md transition-colors cursor-pointer"
          >
            <LinkIcon className="w-3.5 h-3.5 text-sky-400" />
            <span>Change</span>
          </button>

          <button
            id="btn-video-fullscreen-top"
            onClick={handleFullscreenToggle}
            className="p-1.5 rounded-full bg-black/75 hover:bg-black/90 text-white border border-white/10 backdrop-blur-md transition-colors cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'True Fullscreen (⛶)'}
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Bottom Video Controls Overlay */}
      <div
        className={`absolute bottom-0 left-0 right-0 p-3 sm:p-4 bg-gradient-to-t from-black/95 via-black/70 to-transparent flex flex-col gap-2 z-20 transition-opacity duration-200 ${
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
              title={videoState.isPlaying ? 'Pause (Space)' : 'Play (Space)'}
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

          {/* Right Controls: Speed, Volume Slider, Fullscreen */}
          <div className="flex items-center gap-3 relative">
            {/* Playback Speed Selector */}
            <div className="relative">
              <button
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-[11px] font-bold text-slate-200 transition-colors cursor-pointer"
                title="Playback Speed"
              >
                {videoState.playbackRate || 1}x
              </button>

              {showSpeedMenu && (
                <div className="absolute bottom-8 right-0 bg-slate-900 border border-slate-700 rounded-xl p-1.5 shadow-2xl flex flex-col gap-1 z-30 min-w-[70px]">
                  {SPEED_OPTIONS.map((rate) => (
                    <button
                      key={rate}
                      onClick={() => {
                        setVideoPlaybackRate(rate);
                        setShowSpeedMenu(false);
                      }}
                      className={`px-2 py-1 text-left text-xs rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                        (videoState.playbackRate || 1) === rate
                          ? 'bg-sky-500 text-white font-bold'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span>{rate}x</span>
                      {(videoState.playbackRate || 1) === rate && <Check className="w-3 h-3" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

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
              onClick={handleFullscreenToggle}
              className="p-1.5 rounded-full hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'True Fullscreen (⛶)'}
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Change Video URL / Local File Modal */}
      {showUrlModal && (
        <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-40 animate-fadeIn">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <h4 className="text-base font-bold text-white flex items-center gap-2">
                <Film className="w-4 h-4 text-sky-400" />
                Change Synchronized Video
              </h4>
              <button
                onClick={() => setShowUrlModal(false)}
                className="text-slate-400 hover:text-white text-xs cursor-pointer p-1 rounded hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            {/* Local Video Option */}
            <div className="p-4 bg-gradient-to-r from-sky-500/10 to-indigo-500/10 border border-sky-500/20 rounded-xl flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <FolderOpen className="w-4 h-4 text-sky-400" />
                  <span>Play Local File</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  Select a video file from your device (.mp4, .webm, .mkv)
                </div>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-2 bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs rounded-xl shadow-md transition-colors cursor-pointer shrink-0"
              >
                Select File
              </button>
            </div>

            {/* Custom URL Form */}
            <form onSubmit={handleLoadCustomUrl} className="space-y-3">
              <label className="text-xs font-semibold text-slate-300 block">
                Or Stream from URL (MP4, WebM direct links)
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={customUrlInput}
                  onChange={(e) => setCustomUrlInput(e.target.value)}
                  placeholder="https://example.com/video.mp4"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-md transition-colors cursor-pointer"
                >
                  Load
                </button>
              </div>
            </form>

            {/* Sample Presets */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Or test with demo HD videos:</span>
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
