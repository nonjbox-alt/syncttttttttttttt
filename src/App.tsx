import React, { useEffect } from 'react';
import { useRoomStore } from './store/useRoomStore.ts';
import { Lobby } from './components/Lobby.tsx';
import { Header } from './components/Header.tsx';
import { BrowserView } from './components/BrowserView.tsx';
import { ScreenShareView } from './components/ScreenShareView.tsx';
import { CameraGridView } from './components/CameraGridView.tsx';
import { VideoPlayerView } from './components/VideoPlayerView.tsx';
import { ChatPanel } from './components/ChatPanel.tsx';
import { ParticipantsPanel } from './components/ParticipantsPanel.tsx';
import { BottomToolbar } from './components/BottomToolbar.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { ReactionsOverlay } from './components/ReactionsOverlay.tsx';
import { socketService } from './services/socket.ts';
import { webrtcManager } from './services/webrtc.ts';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function App() {
  const {
    roomId,
    mode,
    connectionStatus,
    currentUserName,
    joinRoom,
  } = useRoomStore();

  // URL route listener (e.g. /room/AB82KX or ?room=AB82KX)
  useEffect(() => {
    const pathMatch = window.location.pathname.match(/\/room\/([a-zA-Z0-9]+)/i);
    const urlParams = new URLSearchParams(window.location.search);
    const queryRoom = urlParams.get('room');
    const targetRoom = (pathMatch && pathMatch[1]) || queryRoom;

    if (targetRoom && !roomId) {
      const savedName = localStorage.getItem('syncroom_username') || `User${Math.floor(1000 + Math.random() * 9000)}`;
      joinRoom(targetRoom.toUpperCase(), savedName);
    }
  }, [joinRoom, roomId]);

  // Handle PWA background visibility change & network reconnection
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && roomId) {
        // App returned from background
        if (!socketService.isConnected) {
          socketService.connect(roomId, currentUserName, false, false);
        } else {
          socketService.send({ type: 'ping', timestamp: Date.now() });
        }
      }
    };

    const handleOnline = () => {
      if (roomId && !socketService.isConnected) {
        socketService.connect(roomId, currentUserName, false, false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, [roomId, currentUserName]);

  // If not in a room, render Lobby
  if (!roomId) {
    return <Lobby />;
  }

  return (
    <div id="syncroom-app-root" className="w-full h-full min-h-[100dvh] flex flex-col bg-slate-950 text-slate-100 overflow-hidden relative select-none">
      {/* Top Header */}
      <Header />

      {/* Reconnecting Alert Banner */}
      {connectionStatus === 'reconnecting' && (
        <div className="bg-amber-500/90 text-slate-950 px-4 py-1.5 text-xs font-bold flex items-center justify-center gap-2 z-40 shadow-md">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span>Connection interrupted. Reconnecting to room {roomId}...</span>
        </div>
      )}

      {/* Main Center Stage */}
      <main className="flex-1 w-full h-full relative overflow-hidden flex">
        <div className="flex-1 w-full h-full relative overflow-hidden">
          {mode === 'BROWSE' && <BrowserView />}
          {mode === 'SCREEN_SHARE' && <ScreenShareView />}
          {mode === 'CAMERAS' && <CameraGridView />}
          {mode === 'VIDEO' && <VideoPlayerView />}
        </div>

        {/* Desktop Sidebars / Mobile Drawers */}
        <ChatPanel />
        <ParticipantsPanel />
      </main>

      {/* Bottom Controls Toolbar */}
      <BottomToolbar />

      {/* Popups & Global Overlays */}
      <SettingsModal />
      <ReactionsOverlay />
    </div>
  );
}
