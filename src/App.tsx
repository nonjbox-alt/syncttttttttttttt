import React, { useEffect } from 'react';
import { useRoomStore } from './store/useRoomStore.ts';
import { Lobby } from './components/Lobby.tsx';
import { Header } from './components/Header.tsx';
import { BrowserView } from './components/BrowserView.tsx';
import { ScreenShareView } from './components/ScreenShareView.tsx';
import { CameraGridView } from './components/CameraGridView.tsx';
import { VideoPlayerView } from './components/VideoPlayerView.tsx';
import { HlsVideoBridge } from './components/HlsVideoBridge.tsx';
import { ChatPanel } from './components/ChatPanel.tsx';
import { ParticipantsPanel } from './components/ParticipantsPanel.tsx';
import { BottomToolbar } from './components/BottomToolbar.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { RealtimeDebugPanel } from './components/RealtimeDebugPanel.tsx';
import { ReactionsOverlay } from './components/ReactionsOverlay.tsx';
import { socketService } from './services/socket.ts';
import { RefreshCw } from 'lucide-react';

export default function App() {
  const { roomId, mode, connectionStatus, currentUserName, joinRoom, fullscreenContent, setFullscreenContent } = useRoomStore();
  const isFullscreen = fullscreenContent !== 'none';

  useEffect(() => {
    const pathMatch = window.location.pathname.match(/\/room\/([a-zA-Z0-9]+)/i);
    const targetRoom = (pathMatch && pathMatch[1]) || new URLSearchParams(window.location.search).get('room');
    if (targetRoom && !roomId) {
      const savedName = localStorage.getItem('syncroom_username') || `User${Math.floor(1000 + Math.random() * 9000)}`;
      void joinRoom(targetRoom.toUpperCase(), savedName);
    }
  }, [joinRoom, roomId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && fullscreenContent !== 'none') {
        setFullscreenContent('none');
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      }
    };
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && fullscreenContent !== 'none') setFullscreenContent('none');
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [fullscreenContent, setFullscreenContent]);

  useEffect(() => {
    const reconnect = () => {
      if (!roomId) return;
      if (!socketService.isConnected) socketService.connect(roomId, currentUserName, false, false);
      else socketService.send({ type: 'ping', timestamp: Date.now() });
    };
    const onVisibility = () => document.visibilityState === 'visible' && reconnect();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', reconnect);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', reconnect);
    };
  }, [roomId, currentUserName]);

  if (!roomId) return <Lobby />;

  return (
    <div id="syncroom-app-root" className="w-full h-full min-h-[100dvh] flex flex-col bg-slate-950 text-slate-100 overflow-hidden relative select-none">
      <HlsVideoBridge />
      {!isFullscreen && <Header />}
      {connectionStatus === 'reconnecting' && !isFullscreen && (
        <div className="bg-amber-500/90 text-slate-950 px-4 py-1.5 text-xs font-bold flex items-center justify-center gap-2 z-40 shadow-md">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span>Connection interrupted. Reconnecting to room {roomId}...</span>
        </div>
      )}
      <main className="flex-1 w-full h-full relative overflow-hidden flex">
        <div className="flex-1 w-full h-full relative overflow-hidden">
          {mode === 'BROWSE' && <BrowserView />}
          {mode === 'SCREEN_SHARE' && <ScreenShareView />}
          {mode === 'CAMERAS' && <CameraGridView />}
          {mode === 'VIDEO' && <VideoPlayerView />}
        </div>
        {!isFullscreen && <ChatPanel />}
        {!isFullscreen && <ParticipantsPanel />}
      </main>
      {!isFullscreen && <BottomToolbar />}
      <SettingsModal />
      <RealtimeDebugPanel />
      <ReactionsOverlay />
    </div>
  );
}
