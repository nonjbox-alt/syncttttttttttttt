import React, { useState } from 'react';
import {
  Globe,
  Monitor,
  Video,
  Film,
  Copy,
  Check,
  Users,
  MessageSquare,
  Settings,
  Share2,
  Crown,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useRoomStore } from '../store/useRoomStore.ts';
import { RoomMode } from '../types.ts';

export const Header: React.FC = () => {
  const {
    roomId,
    mode,
    setMode,
    participants,
    unreadChatCount,
    toggleChat,
    toggleParticipants,
    toggleSettings,
    isChatOpen,
    isParticipantsOpen,
    connectionStatus,
    activeScreenSharerName,
    browserState,
    currentUserId,
    isHost,
  } = useRoomStore();

  const [copied, setCopied] = useState(false);

  const participantCount = Object.keys(participants).length;

  const handleCopyLink = async () => {
    if (!roomId) return;
    const shareUrl = `${window.location.origin}/room/${roomId}`;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = shareUrl;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.warn('Clipboard write failed:', e);
    }
  };

  const handleNativeShare = async () => {
    if (!roomId) return;
    const shareUrl = `${window.location.origin}/room/${roomId}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join my SyncRoom Watch Party!',
          text: `Join my watch party room ${roomId} on SyncRoom!`,
          url: shareUrl,
        });
      } catch (err) {
        // User cancelled or fallback to copy
        handleCopyLink();
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <header className="h-14 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 px-3 sm:px-4 flex items-center justify-between gap-2 z-30 shrink-0 select-none">
      {/* Left: Brand & Room ID & Invite */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-md shadow-sky-500/20 font-bold text-white text-xs">
            SR
          </div>
          <span className="font-bold text-sm tracking-tight text-white hidden sm:inline-block">SyncRoom</span>
        </div>

        {/* Room Code Badge */}
        <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-1 text-xs">
          <span className="px-1.5 py-0.5 text-slate-400 font-mono font-medium hidden md:inline-block">
            /room/
          </span>
          <span className="px-1.5 py-0.5 text-sky-400 font-mono font-bold">{roomId}</span>
          <button
            id="btn-copy-invite"
            onClick={handleCopyLink}
            title="Copy Invite Link"
            className="ml-1 p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Share Button for Mobile */}
        <button
          id="btn-share-room"
          onClick={handleNativeShare}
          className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 text-xs flex items-center gap-1.5 sm:hidden cursor-pointer"
          title="Share room link"
        >
          <Share2 className="w-3.5 h-3.5 text-sky-400" />
        </button>

        {/* Active Sharer Notice (if screen sharing) */}
        {activeScreenSharerName && mode !== 'SCREEN_SHARE' && (
          <button
            onClick={() => setMode('SCREEN_SHARE')}
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-[11px] text-indigo-300 hover:bg-indigo-500/20 transition-colors cursor-pointer animate-pulse"
          >
            <Monitor className="w-3 h-3 text-indigo-400" />
            <span>{activeScreenSharerName} is sharing</span>
          </button>
        )}
      </div>

      {/* Center: Room Mode Switcher (Browse, Screen Share, Cameras, Video) */}
      <nav className="flex items-center bg-slate-900/90 border border-slate-800 rounded-xl p-1 shadow-inner max-w-full overflow-x-auto no-scrollbar">
        <button
          id="mode-browse-btn"
          onClick={() => setMode('BROWSE')}
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
            mode === 'BROWSE'
              ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
          title="Shared Interactive Browsing"
        >
          <Globe className="w-3.5 h-3.5" />
          <span>Browse</span>
        </button>

        <button
          id="mode-screen-btn"
          onClick={() => setMode('SCREEN_SHARE')}
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
            mode === 'SCREEN_SHARE'
              ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
          title="Screen / Window / Tab Sharing"
        >
          <Monitor className="w-3.5 h-3.5" />
          <span>Screen</span>
          {activeScreenSharerName && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />}
        </button>

        <button
          id="mode-cameras-btn"
          onClick={() => setMode('CAMERAS')}
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
            mode === 'CAMERAS'
              ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
          title="Webcam Focus Grid"
        >
          <Video className="w-3.5 h-3.5" />
          <span>Cameras</span>
        </button>

        <button
          id="mode-video-btn"
          onClick={() => setMode('VIDEO')}
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
            mode === 'VIDEO'
              ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
          title="Synchronized Video Player"
        >
          <Film className="w-3.5 h-3.5" />
          <span>Video</span>
        </button>
      </nav>

      {/* Right: Participants, Chat, Settings & Connection Status */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Connection status indicator */}
        <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-md bg-slate-900 border border-slate-800 text-[11px]">
          {connectionStatus === 'connected' ? (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-400 text-[10px]">Connected</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span className="text-amber-300 text-[10px]">Reconnecting...</span>
            </>
          )}
        </div>

        {/* Participants Panel Toggle */}
        <button
          id="toggle-participants-btn"
          onClick={toggleParticipants}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
            isParticipantsOpen
              ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
              : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
          }`}
          title="Participants List"
        >
          <Users className="w-3.5 h-3.5" />
          <span>{participantCount}</span>
        </button>

        {/* Chat Panel Toggle */}
        <button
          id="toggle-chat-btn"
          onClick={toggleChat}
          className={`relative p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
            isChatOpen
              ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
              : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
          }`}
          title="Chat messages"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span className="hidden sm:inline-block">Chat</span>
          {unreadChatCount > 0 && !isChatOpen && (
            <span className="absolute -top-1 -right-1 px-1.5 py-0.2 bg-rose-500 text-white font-bold text-[10px] rounded-full animate-bounce shadow-md">
              {unreadChatCount}
            </span>
          )}
        </button>

        {/* Settings button */}
        <button
          id="toggle-settings-btn"
          onClick={toggleSettings}
          className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
          title="Settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
