import React, { useRef, useEffect, useState } from 'react';
import {
  Mic,
  MicOff,
  Camera,
  CameraOff,
  Crown,
  Volume2,
  VolumeX,
  RefreshCw,
  Sparkles,
  Sliders,
} from 'lucide-react';
import { useRoomStore } from '../store/useRoomStore.ts';
import { Participant } from '../types.ts';

interface ParticipantTileProps {
  participant: Participant;
  isSelf: boolean;
  stream?: MediaStream;
}

const ParticipantTile: React.FC<ParticipantTileProps> = ({ participant, isSelf, stream }) => {
  const { setParticipantVolume, flipCamera } = useRoomStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream, participant.isCameraOn]);

  useEffect(() => {
    if (audioRef.current && stream && !isSelf) {
      audioRef.current.srcObject = stream;
      audioRef.current.volume = participant.volume ?? 1;
      audioRef.current.play().catch(() => {});
    }
  }, [stream, participant.volume, isSelf]);

  const initials = participant.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  return (
    <div
      id={`participant-tile-${participant.id}`}
      className={`relative w-full h-full min-h-[160px] bg-slate-900/90 rounded-2xl overflow-hidden border transition-all duration-200 flex items-center justify-center group ${
        participant.isSpeaking
          ? 'border-emerald-400/90 shadow-lg shadow-emerald-500/20 ring-2 ring-emerald-500/40'
          : 'border-slate-800/80 hover:border-slate-700'
      }`}
    >
      {/* Video Track or Initials Avatar */}
      {participant.isCameraOn && stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isSelf} // Always mute local video element to avoid echo
          className={`w-full h-full object-cover ${isSelf ? '-scale-x-100' : ''}`}
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-3">
          <div
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center text-white font-bold text-xl sm:text-2xl shadow-xl ring-4 ring-slate-800/80"
            style={{ backgroundColor: participant.avatarColor || '#38bdf8' }}
          >
            {initials}
          </div>
        </div>
      )}

      {/* Hidden Audio Element for Remote Participant Voice */}
      {!isSelf && <audio ref={audioRef} autoPlay playsInline />}

      {/* Speaking Glow Ripple Animation */}
      {participant.isSpeaking && (
        <div className="absolute inset-0 pointer-events-none border-2 border-emerald-400 rounded-2xl animate-pulse" />
      )}

      {/* Top Left Badges: Host / Controller */}
      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-10 pointer-events-none">
        {participant.isHost && (
          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-bold flex items-center gap-1 shadow-sm">
            <Crown className="w-2.5 h-2.5" /> Host
          </span>
        )}
        {participant.isController && !participant.isHost && (
          <span className="px-2 py-0.5 rounded-full bg-sky-500/20 border border-sky-500/40 text-sky-300 text-[10px] font-bold shadow-sm">
            Controller
          </span>
        )}
      </div>

      {/* Top Right Mobile Flip Camera (For self) */}
      {isSelf && participant.isCameraOn && (
        <button
          onClick={flipCamera}
          className="absolute top-2.5 right-2.5 p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-md transition-colors z-10 cursor-pointer"
          title="Flip camera"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Bottom Info Bar: Name, Mic Status, Volume Slider */}
      <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 z-10">
        <div className="flex items-center gap-1.5 bg-black/75 backdrop-blur-md px-2.5 py-1 rounded-xl border border-white/10 text-xs text-white shadow-md max-w-[70%] truncate">
          <span className="font-semibold truncate">{isSelf ? `${participant.name} (You)` : participant.name}</span>
          {participant.isSpeaking && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
          )}
        </div>

        {/* Mic Status & Remote Volume Controls */}
        <div className="flex items-center gap-1">
          {!isSelf && (
            <div className="relative">
              <button
                onClick={() => setShowVolumeSlider(!showVolumeSlider)}
                className="p-1.5 rounded-xl bg-black/75 hover:bg-black/90 text-slate-300 hover:text-white backdrop-blur-md border border-white/10 transition-colors cursor-pointer"
                title="Adjust participant volume"
              >
                <Sliders className="w-3.5 h-3.5" />
              </button>

              {/* Volume Slider Popover */}
              {showVolumeSlider && (
                <div className="absolute bottom-full right-0 mb-2 p-2 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl z-30 flex flex-col items-center gap-1 w-28 animate-fadeIn">
                  <div className="flex items-center justify-between w-full text-[10px] text-slate-400">
                    <span>Volume</span>
                    <span>{Math.round((participant.volume ?? 1) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1.5"
                    step="0.05"
                    value={participant.volume ?? 1}
                    onChange={(e) => setParticipantVolume(participant.id, parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
                  />
                </div>
              )}
            </div>
          )}

          <div
            className={`p-1.5 rounded-xl backdrop-blur-md border border-white/10 ${
              participant.isMicOn ? 'bg-black/75 text-emerald-400' : 'bg-rose-500/30 text-rose-300'
            }`}
          >
            {participant.isMicOn ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
          </div>
        </div>
      </div>
    </div>
  );
};

export const CameraGridView: React.FC = () => {
  const {
    participants,
    currentUserId,
    currentUserName,
    localCamStream,
    remoteCamStreams,
    isMicOn,
    isCameraOn,
    isHost,
    isController,
  } = useRoomStore();

  const allParticipants = Object.values(participants);

  // If participants list is empty or local user not in participants yet, synthesize self
  const localParticipant: Participant = (currentUserId && participants[currentUserId]) || {
    id: currentUserId || 'local',
    name: currentUserName,
    avatarColor: '#38bdf8',
    isHost: isHost,
    isController: isController,
    hasRequestedControl: false,
    isMicOn: isMicOn,
    isCameraOn: isCameraOn,
    isScreenSharing: false,
    isSpeaking: false,
    volume: 1,
    joinedAt: Date.now(),
  };

  const displayList = allParticipants.length > 0 ? allParticipants : [localParticipant];

  // Responsive Grid Class Calculation
  const count = displayList.length;
  let gridClass = 'grid-cols-1';
  if (count === 2) gridClass = 'grid-cols-1 sm:grid-cols-2';
  else if (count >= 3 && count <= 4) gridClass = 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-2';
  else if (count >= 5 && count <= 6) gridClass = 'grid-cols-2 sm:grid-cols-3';
  else if (count > 6) gridClass = 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4';

  return (
    <div id="camera-grid-view" className="w-full h-full p-3 sm:p-4 bg-slate-950 overflow-y-auto flex items-center justify-center select-none">
      <div className={`w-full max-w-6xl max-h-full grid ${gridClass} gap-3 sm:gap-4 auto-rows-fr`}>
        {displayList.map((p) => {
          const isSelf = p.id === currentUserId;
          const stream = isSelf ? (localCamStream || undefined) : remoteCamStreams[p.id];
          return (
            <ParticipantTile
              key={p.id}
              participant={p}
              isSelf={isSelf}
              stream={stream}
            />
          );
        })}
      </div>
    </div>
  );
};
