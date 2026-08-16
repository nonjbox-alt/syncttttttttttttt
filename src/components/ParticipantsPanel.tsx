import React from 'react';
import {
  Users,
  X,
  Crown,
  Mic,
  MicOff,
  Camera,
  CameraOff,
  Sliders,
  Volume2,
  Hand,
  Check,
  ShieldAlert,
} from 'lucide-react';
import { useRoomStore } from '../store/useRoomStore.ts';

export const ParticipantsPanel: React.FC = () => {
  const {
    participants,
    currentUserId,
    isParticipantsOpen,
    toggleParticipants,
    setParticipantVolume,
    isHost,
    pendingControlRequest,
    respondControl,
  } = useRoomStore();

  if (!isParticipantsOpen) return null;

  const list = Object.values(participants);

  return (
    <div
      id="participants-panel"
      className="fixed inset-y-0 right-0 w-full sm:w-80 md:w-96 bg-slate-950/95 backdrop-blur-xl border-l border-slate-800/90 shadow-2xl z-40 flex flex-col justify-between animate-slideLeft select-none"
    >
      {/* Header */}
      <div className="h-14 px-4 border-b border-slate-800/80 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-sky-400" />
          <h3 className="font-bold text-sm text-white">Participants</h3>
          <span className="text-[10px] text-slate-500 font-mono">({list.length})</span>
        </div>
        <button
          id="close-participants-btn"
          onClick={toggleParticipants}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Host Pending Control Banner */}
      {isHost && pendingControlRequest && (
        <div className="m-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-xs text-amber-300 font-semibold">
            <Hand className="w-3.5 h-3.5 text-amber-400" />
            <span>Control Request</span>
          </div>
          <p className="text-[11px] text-slate-300">
            <strong>{pendingControlRequest.userName}</strong> wants to control the shared browser.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => respondControl(pendingControlRequest.userId, true)}
              className="flex-1 py-1 px-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-colors cursor-pointer"
            >
              Allow
            </button>
            <button
              onClick={() => respondControl(pendingControlRequest.userId, false)}
              className="flex-1 py-1 px-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-colors cursor-pointer"
            >
              Deny
            </button>
          </div>
        </div>
      )}

      {/* Participants List */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3">
        {list.map((p) => {
          const isSelf = p.id === currentUserId;
          const initials = p.name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .substring(0, 2)
            .toUpperCase();

          return (
            <div
              key={p.id}
              className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2"
            >
              {/* Top User Info */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs"
                    style={{ backgroundColor: p.avatarColor || '#38bdf8' }}
                  >
                    {initials}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white">
                        {isSelf ? `${p.name} (You)` : p.name}
                      </span>
                      {p.isHost && (
                        <Crown className="w-3 h-3 text-amber-400 shrink-0" title="Room Host" />
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      {p.isController && (
                        <span className="text-[9px] font-semibold text-sky-400 bg-sky-500/10 px-1.5 py-0.2 rounded border border-sky-500/20">
                          Controller
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Media Status Badges */}
                <div className="flex items-center gap-1.5 text-slate-400">
                  <span
                    className={`p-1 rounded-md ${
                      p.isMicOn ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                    }`}
                  >
                    {p.isMicOn ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                  </span>
                  <span
                    className={`p-1 rounded-md ${
                      p.isCameraOn ? 'bg-sky-500/10 text-sky-400' : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    {p.isCameraOn ? <Camera className="w-3.5 h-3.5" /> : <CameraOff className="w-3.5 h-3.5" />}
                  </span>
                </div>
              </div>

              {/* Volume Slider for Remote Participants */}
              {!isSelf && (
                <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2 text-[11px] text-slate-400">
                  <Volume2 className="w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="range"
                    min="0"
                    max="1.5"
                    step="0.05"
                    value={p.volume ?? 1}
                    onChange={(e) => setParticipantVolume(p.id, parseFloat(e.target.value))}
                    className="flex-1 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
                  />
                  <span className="text-[10px] w-8 text-right font-mono">
                    {Math.round((p.volume ?? 1) * 100)}%
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="p-3 bg-slate-900/60 border-t border-slate-800 text-center text-[11px] text-slate-500">
        Peer-to-Peer Mesh Connected
      </div>
    </div>
  );
};
