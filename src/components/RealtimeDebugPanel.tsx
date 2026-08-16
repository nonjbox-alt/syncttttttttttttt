import React, { useState, useEffect } from 'react';
import {
  Activity,
  Terminal,
  Server,
  Wifi,
  Users,
  Radio,
  Clock,
  Shield,
  X,
  RefreshCw,
  Copy,
  Check,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { useRoomStore } from '../store/useRoomStore.ts';
import { socketService } from '../services/socket.ts';
import { webrtcManager } from '../services/webrtc.ts';

export const RealtimeDebugPanel: React.FC = () => {
  const {
    isDebugOpen,
    toggleDebug,
    connectionStatus,
    transport,
    roomId,
    currentUserId,
    currentUserName,
    isHost,
    isController,
    mode,
    participants,
    diagnostics,
    browserState,
    videoState,
  } = useRoomStore();

  const [copied, setCopied] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [rtt, setRtt] = useState(0);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (!isDebugOpen) return;
    const interval = setInterval(() => {
      setRtt(socketService.getRoundTripTime());
      setOffset(socketService.getServerTimeOffset());
    }, 1000);
    return () => clearInterval(interval);
  }, [isDebugOpen]);

  // Keyboard shortcut (Ctrl + Shift + D) to toggle debug panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        toggleDebug();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleDebug]);

  if (!isDebugOpen) return null;

  const participantList = Object.values(participants);

  const handleCopyDiagnostics = () => {
    const report = {
      timestamp: new Date().toISOString(),
      roomId,
      currentUserId,
      currentUserName,
      isHost,
      isController,
      connectionStatus,
      transport,
      rttMs: rtt,
      clockOffsetMs: offset,
      mode,
      participantCount: participantList.length,
      participants: participantList.map((p) => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        isController: p.isController,
        isMicOn: p.isMicOn,
        isCameraOn: p.isCameraOn,
      })),
      webrtc: diagnostics,
      browserUrl: browserState?.url,
      videoTitle: videoState?.title,
      videoPlaying: videoState?.isPlaying,
      videoPosition: videoState?.position,
    };

    navigator.clipboard.writeText(JSON.stringify(report, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      id="realtime-debug-panel"
      className="fixed bottom-4 left-4 z-50 w-96 max-w-[calc(100vw-2rem)] bg-slate-950/95 backdrop-blur-xl border border-sky-500/40 rounded-2xl shadow-2xl overflow-hidden font-mono text-xs text-slate-300 animate-fadeIn select-none flex flex-col max-h-[80vh]"
    >
      {/* Header */}
      <div className="px-3.5 py-2.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-sky-400" />
          <span className="font-bold text-white tracking-wide text-xs">Realtime & Room Debug</span>
          <span className="px-1.5 py-0.2 bg-sky-500/20 text-sky-300 rounded text-[10px] font-semibold">
            {transport.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMinimized(!minimized)}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
            title={minimized ? 'Expand' : 'Collapse'}
          >
            {minimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={toggleDebug}
            className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors"
            title="Close Debug Panel (Ctrl+Shift+D)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {!minimized && (
        <div className="p-3 overflow-y-auto space-y-3 flex-1 text-[11px]">
          {/* Status grid */}
          <div className="grid grid-cols-2 gap-2 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
            <div>
              <span className="text-slate-500 text-[10px] uppercase block">Connection</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    connectionStatus === 'connected'
                      ? 'bg-emerald-400 animate-pulse'
                      : connectionStatus === 'connecting' || connectionStatus === 'reconnecting'
                      ? 'bg-amber-400 animate-ping'
                      : 'bg-rose-400'
                  }`}
                />
                <span className="font-semibold text-white capitalize">{connectionStatus}</span>
              </div>
            </div>

            <div>
              <span className="text-slate-500 text-[10px] uppercase block">Transport</span>
              <span className="font-semibold text-sky-400 capitalize">{transport}</span>
            </div>

            <div>
              <span className="text-slate-500 text-[10px] uppercase block">Room ID</span>
              <span className="font-bold text-indigo-300 font-mono">{roomId || 'None'}</span>
            </div>

            <div>
              <span className="text-slate-500 text-[10px] uppercase block">Active Mode</span>
              <span className="font-semibold text-white">{mode}</span>
            </div>
          </div>

          {/* Identity & Authority */}
          <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 text-[10px] uppercase">My User ID</span>
              <span className="text-slate-200 truncate max-w-[180px]" title={currentUserId || ''}>
                {currentUserId || 'N/A'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 text-[10px] uppercase">My Role</span>
              <div className="flex items-center gap-1">
                {isHost && (
                  <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 rounded text-[9px] font-bold">
                    HOST
                  </span>
                )}
                {isController && (
                  <span className="px-1.5 py-0.2 bg-sky-500/20 text-sky-300 rounded text-[9px] font-bold">
                    CONTROLLER
                  </span>
                )}
                {!isHost && !isController && <span className="text-slate-400">PARTICIPANT</span>}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 text-[10px] uppercase">Latency / RTT</span>
              <span className="text-emerald-400 font-semibold">{rtt} ms</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 text-[10px] uppercase">Clock Offset</span>
              <span className="text-slate-400 font-mono">{offset} ms</span>
            </div>
          </div>

          {/* Participants List */}
          <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-bold uppercase text-[10px] flex items-center gap-1">
                <Users className="w-3 h-3 text-sky-400" />
                Participants ({participantList.length})
              </span>
            </div>
            <div className="space-y-1 max-h-28 overflow-y-auto">
              {participantList.map((p) => {
                const isSelf = p.id === currentUserId;
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between px-2 py-1 bg-slate-950/70 rounded-lg border border-slate-800/50 text-[10px]"
                  >
                    <div className="flex items-center gap-1.5 truncate max-w-[160px]">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: p.avatarColor || '#38bdf8' }}
                      />
                      <span className="truncate text-white font-medium">
                        {p.name} {isSelf ? '(You)' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 font-mono text-[9px] shrink-0">
                      {p.isHost && <span className="text-amber-400 font-bold">H</span>}
                      {p.isController && <span className="text-sky-400 font-bold">C</span>}
                      <span className={p.isMicOn ? 'text-emerald-400' : 'text-slate-600'}>MIC</span>
                      <span className={p.isCameraOn ? 'text-sky-400' : 'text-slate-600'}>CAM</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* WebRTC Diagnostics */}
          <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80 space-y-1 text-[10px]">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 uppercase">WebRTC Peers</span>
              <span className="text-white font-bold">{diagnostics.activePeerCount} connected</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 uppercase">ICE Connection</span>
              <span className="text-emerald-400 capitalize font-semibold">
                {diagnostics.iceConnectionState}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 uppercase">STUN Status</span>
              <span className="text-slate-300 font-mono">{diagnostics.stunStatus}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleCopyDiagnostics}
              className="flex-1 py-1.5 px-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-[10px]"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copied' : 'Copy JSON Report'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                socketService.syncClock();
                webrtcManager.fetchIceServers();
              }}
              className="py-1.5 px-3 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 rounded-lg flex items-center justify-center gap-1 transition-colors cursor-pointer text-[10px]"
              title="Resync Clock & ICE"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Resync</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
