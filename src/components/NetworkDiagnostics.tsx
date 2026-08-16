import React, { useState } from 'react';
import {
  Activity,
  Server,
  ShieldCheck,
  RefreshCw,
  Copy,
  Check,
  Radio,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { useRoomStore } from '../store/useRoomStore.ts';
import { webrtcManager } from '../services/webrtc.ts';

export const NetworkDiagnostics: React.FC = () => {
  const { diagnostics, connectionStatus, roomId, currentUserId } = useRoomStore();
  const [copied, setCopied] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await webrtcManager.fetchIceServers();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleCopySummary = () => {
    const summary = [
      `=== SyncRoom WebRTC Diagnostics ===`,
      `Room ID: ${roomId || 'N/A'}`,
      `User ID: ${currentUserId || 'N/A'}`,
      `Signaling / WebSocket: ${connectionStatus}`,
      `STUN: ${diagnostics.stunStatus} (${diagnostics.serverUrl || 'stun.cloudflare.com:3478'})`,
      `TURN: ${diagnostics.turnStatus}`,
      `ICE Gathering: ${diagnostics.iceGatheringState}`,
      `ICE Connection: ${diagnostics.iceConnectionState}`,
      `Peer Connection: ${diagnostics.peerConnectionState}`,
      `Active Peers: ${diagnostics.activePeerCount}`,
      `Last ICE Refresh: ${new Date(diagnostics.lastIceServerRefresh).toLocaleTimeString()}`,
    ].join('\n');

    navigator.clipboard.writeText(summary).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div id="webrtc-diagnostics-panel" className="space-y-3 pt-3 border-t border-slate-800/80 text-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-semibold text-slate-300">
          <Activity className="w-3.5 h-3.5 text-sky-400" />
          <span>WebRTC & Network Diagnostics</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleRefresh}
            title="Refresh ICE configuration"
            disabled={isRefreshing}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin text-sky-400' : ''}`} />
          </button>
          <button
            type="button"
            onClick={handleCopySummary}
            title="Copy diagnostics report"
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 bg-slate-950/70 p-3 rounded-xl border border-slate-800/70 font-mono text-[11px]">
        {/* STUN status */}
        <div className="flex flex-col gap-0.5">
          <span className="text-slate-500 text-[10px] uppercase font-sans font-medium flex items-center gap-1">
            <Server className="w-2.5 h-2.5 text-sky-400" /> STUN
          </span>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-emerald-300 font-semibold uppercase">{diagnostics.stunStatus}</span>
          </div>
          <span className="text-[10px] text-slate-500 truncate" title={diagnostics.serverUrl || 'stun.cloudflare.com:3478'}>
            {diagnostics.serverUrl || 'stun.cloudflare.com:3478'}
          </span>
        </div>

        {/* TURN status */}
        <div className="flex flex-col gap-0.5">
          <span className="text-slate-500 text-[10px] uppercase font-sans font-medium flex items-center gap-1">
            <ShieldCheck className="w-2.5 h-2.5 text-indigo-400" /> TURN
          </span>
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                diagnostics.turnStatus === 'configured' || diagnostics.turnStatus === 'active'
                  ? 'bg-indigo-400'
                  : 'bg-slate-500'
              }`}
            />
            <span
              className={`font-semibold uppercase ${
                diagnostics.turnStatus === 'configured' || diagnostics.turnStatus === 'active'
                  ? 'text-indigo-300'
                  : 'text-slate-400'
              }`}
            >
              {diagnostics.turnStatus}
            </span>
          </div>
          <span className="text-[10px] text-slate-500">
            {diagnostics.turnStatus === 'configured' ? 'Short-lived credentials' : 'Optional (P2P/STUN)'}
          </span>
        </div>

        {/* ICE Gathering */}
        <div className="flex flex-col gap-0.5 pt-2 border-t border-slate-800/50">
          <span className="text-slate-500 text-[10px] uppercase font-sans font-medium">ICE Gathering</span>
          <span className="text-slate-300 font-semibold capitalize">{diagnostics.iceGatheringState}</span>
        </div>

        {/* ICE Connection */}
        <div className="flex flex-col gap-0.5 pt-2 border-t border-slate-800/50">
          <span className="text-slate-500 text-[10px] uppercase font-sans font-medium">ICE Connection</span>
          <span
            className={`font-semibold capitalize ${
              diagnostics.iceConnectionState === 'connected' || diagnostics.iceConnectionState === 'completed'
                ? 'text-emerald-400'
                : diagnostics.iceConnectionState === 'checking'
                ? 'text-amber-400'
                : 'text-slate-300'
            }`}
          >
            {diagnostics.iceConnectionState}
          </span>
        </div>

        {/* WebRTC Overall State */}
        <div className="flex flex-col gap-0.5 col-span-2 pt-2 border-t border-slate-800/50">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-[10px] uppercase font-sans font-medium">WebRTC P2P Mesh</span>
            <span className="text-slate-400 text-[10px] font-sans">
              {diagnostics.activePeerCount} {diagnostics.activePeerCount === 1 ? 'peer' : 'peers'} connected
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                diagnostics.peerConnectionState === 'connected'
                  ? 'bg-emerald-400'
                  : diagnostics.peerConnectionState === 'connecting'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-slate-500'
              }`}
            />
            <span className="text-slate-200 capitalize font-semibold">
              {diagnostics.peerConnectionState === 'new' && diagnostics.activePeerCount === 0
                ? 'Ready (Waiting for peers)'
                : diagnostics.peerConnectionState}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
