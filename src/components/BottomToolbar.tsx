import React, { useEffect, useState } from 'react';
import {
  Mic,
  MicOff,
  Camera,
  CameraOff,
  Monitor,
  MonitorOff,
  Globe,
  Film,
  Video,
  MessageSquare,
  Smile,
  Settings,
  PhoneOff,
  Sparkles,
  Crown,
} from 'lucide-react';
import { useRoomStore } from '../store/useRoomStore.ts';
import { RoomMode } from '../types.ts';

const REACTION_EMOJIS = ['😂', '❤️', '🔥', '👏', '🍿', '🚀', '🎉', '💯'];

export const BottomToolbar: React.FC = () => {
  const {
    isMicOn,
    isCameraOn,
    isScreenSharing,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
    mode,
    setMode,
    isPushToTalk,
    pushToTalkActive,
    setPushToTalkActive,
    toggleChat,
    toggleParticipants,
    toggleSettings,
    unreadChatCount,
    isChatOpen,
    isParticipantsOpen,
    sendReaction,
    leaveRoom,
  } = useRoomStore();

  const [showReactionsMenu, setShowReactionsMenu] = useState(false);

  // Push-to-Talk Spacebar Listener
  useEffect(() => {
    if (!isPushToTalk) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setPushToTalkActive(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setPushToTalkActive(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isPushToTalk, setPushToTalkActive]);

  const handleReaction = (emoji: string) => {
    sendReaction(emoji);
    setShowReactionsMenu(false);
  };

  return (
    <div
      id="bottom-toolbar"
      className="h-16 bg-slate-950/95 backdrop-blur-md border-t border-slate-800/90 px-3 sm:px-6 flex items-center justify-between gap-2 z-30 shrink-0 select-none"
    >
      {/* Left: Quick Room Mode Shortcuts */}
      <div className="hidden md:flex items-center gap-1.5">
        <button
          onClick={() => setMode('BROWSE')}
          className={`p-2 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
            mode === 'BROWSE'
              ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
          title="Browse Mode"
        >
          <Globe className="w-4 h-4" />
          <span className="hidden lg:inline">Browse</span>
        </button>

        <button
          onClick={() => setMode('SCREEN_SHARE')}
          className={`p-2 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
            mode === 'SCREEN_SHARE'
              ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
          title="Screen Share Mode"
        >
          <Monitor className="w-4 h-4" />
          <span className="hidden lg:inline">Screen</span>
        </button>

        <button
          onClick={() => setMode('CAMERAS')}
          className={`p-2 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
            mode === 'CAMERAS'
              ? 'bg-pink-500/20 border-pink-500/40 text-pink-300'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
          title="Camera Grid Mode"
        >
          <Video className="w-4 h-4" />
          <span className="hidden lg:inline">Cameras</span>
        </button>

        <button
          onClick={() => setMode('VIDEO')}
          className={`p-2 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
            mode === 'VIDEO'
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
          title="Video Player Mode"
        >
          <Film className="w-4 h-4" />
          <span className="hidden lg:inline">Video</span>
        </button>
      </div>

      {/* Center: Core Media Controls (Mic, Camera, Screen Share, Push to Talk) */}
      <div className="flex items-center gap-2 sm:gap-3 mx-auto md:mx-0">
        {/* Microphone Button */}
        {isPushToTalk ? (
          <button
            id="toolbar-btn-ptt"
            onMouseDown={() => setPushToTalkActive(true)}
            onMouseUp={() => setPushToTalkActive(false)}
            onTouchStart={() => setPushToTalkActive(true)}
            onTouchEnd={() => setPushToTalkActive(false)}
            className={`px-3 py-2 sm:px-4 rounded-xl border font-bold text-xs flex items-center gap-2 transition-all cursor-pointer select-none ${
              pushToTalkActive
                ? 'bg-emerald-500 text-slate-950 border-emerald-400 scale-105 shadow-lg shadow-emerald-500/30'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {pushToTalkActive ? <Mic className="w-4 h-4 animate-bounce" /> : <MicOff className="w-4 h-4" />}
            <span className="hidden sm:inline">{pushToTalkActive ? 'Talking...' : 'Hold Space / Push'}</span>
          </button>
        ) : (
          <button
            id="toolbar-btn-mic"
            onClick={toggleMic}
            className={`p-2.5 sm:px-4 sm:py-2.5 rounded-xl border font-semibold text-xs flex items-center gap-2 transition-all cursor-pointer ${
              isMicOn
                ? 'bg-slate-900 border-slate-700 text-emerald-400 hover:bg-slate-800 shadow-sm'
                : 'bg-rose-500/20 border-rose-500/40 text-rose-300 hover:bg-rose-500/30'
            }`}
            title={isMicOn ? 'Mute Microphone' : 'Unmute Microphone'}
          >
            {isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            <span className="hidden sm:inline">{isMicOn ? 'Mute' : 'Unmute'}</span>
          </button>
        )}

        {/* Camera Toggle Button */}
        <button
          id="toolbar-btn-camera"
          onClick={toggleCamera}
          className={`p-2.5 sm:px-4 sm:py-2.5 rounded-xl border font-semibold text-xs flex items-center gap-2 transition-all cursor-pointer ${
            isCameraOn
              ? 'bg-slate-900 border-slate-700 text-sky-400 hover:bg-slate-800 shadow-sm'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
          title={isCameraOn ? 'Turn Off Camera' : 'Turn On Camera'}
        >
          {isCameraOn ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
          <span className="hidden sm:inline">{isCameraOn ? 'Stop Video' : 'Start Video'}</span>
        </button>

        {/* Screen Share Toggle Button */}
        <button
          id="toolbar-btn-screen-share"
          onClick={toggleScreenShare}
          className={`p-2.5 sm:px-4 sm:py-2.5 rounded-xl border font-semibold text-xs flex items-center gap-2 transition-all cursor-pointer ${
            isScreenSharing
              ? 'bg-indigo-500 text-white border-indigo-400 shadow-lg shadow-indigo-500/25'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
          title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
        >
          {isScreenSharing ? <MonitorOff className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
          <span className="hidden sm:inline">{isScreenSharing ? 'Stop Share' : 'Share Screen'}</span>
        </button>
      </div>

      {/* Right: Reactions, Chat, Leave Button */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Emoji Reactions Popover Trigger */}
        <div className="relative">
          <button
            id="toolbar-btn-reactions"
            onClick={() => setShowReactionsMenu(!showReactionsMenu)}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Send Reaction"
          >
            <Smile className="w-4 h-4" />
          </button>

          {showReactionsMenu && (
            <div className="absolute bottom-full right-0 mb-2 p-2 bg-slate-950/95 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl z-40 flex items-center gap-1.5 animate-fadeIn">
              {REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleReaction(emoji)}
                  className="p-1.5 hover:scale-135 active:scale-95 text-lg rounded-lg hover:bg-slate-800 transition-all cursor-pointer"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Mobile Chat Button */}
        <button
          id="toolbar-btn-chat-mobile"
          onClick={toggleChat}
          className={`p-2.5 rounded-xl border text-slate-400 hover:text-white transition-colors cursor-pointer relative md:hidden ${
            isChatOpen ? 'bg-sky-500/20 border-sky-500/40 text-sky-300' : 'bg-slate-900 border-slate-800'
          }`}
          title="Chat"
        >
          <MessageSquare className="w-4 h-4" />
          {unreadChatCount > 0 && !isChatOpen && (
            <span className="absolute -top-1 -right-1 px-1.5 py-0.2 bg-rose-500 text-white font-bold text-[9px] rounded-full">
              {unreadChatCount}
            </span>
          )}
        </button>

        {/* Leave Room Button */}
        <button
          id="toolbar-btn-leave"
          onClick={leaveRoom}
          className="p-2.5 sm:px-3 sm:py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 hover:text-rose-300 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          title="Leave Room"
        >
          <PhoneOff className="w-4 h-4" />
          <span className="hidden sm:inline">Leave</span>
        </button>
      </div>
    </div>
  );
};
