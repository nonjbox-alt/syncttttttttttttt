import React, { useRef, useEffect, useState } from 'react';
import { Mic, MicOff, ChevronDown, ChevronUp, Users } from 'lucide-react';
import { useRoomStore } from '../store/useRoomStore.ts';
import { Participant } from '../types.ts';

const FloatingTile: React.FC<{ participant: Participant; isSelf: boolean; stream?: MediaStream }> = ({
  participant,
  isSelf,
  stream,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

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
      className={`relative w-24 h-20 sm:w-32 sm:h-24 bg-slate-900/90 backdrop-blur-md rounded-xl overflow-hidden border shadow-lg transition-all shrink-0 ${
        participant.isSpeaking
          ? 'border-emerald-400 ring-2 ring-emerald-400/50'
          : 'border-white/10'
      }`}
    >
      {participant.isCameraOn && stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isSelf}
          className={`w-full h-full object-cover ${isSelf ? '-scale-x-100' : ''}`}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-slate-950/80">
          <div
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-white font-bold text-xs"
            style={{ backgroundColor: participant.avatarColor || '#38bdf8' }}
          >
            {initials}
          </div>
        </div>
      )}

      {!isSelf && <audio ref={audioRef} autoPlay playsInline />}

      {/* Name and mic pill */}
      <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-sm text-[9px] text-white">
        <span className="truncate max-w-[70%] font-medium">{isSelf ? 'You' : participant.name}</span>
        {participant.isMicOn ? (
          <Mic className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
        ) : (
          <MicOff className="w-2.5 h-2.5 text-rose-400 shrink-0" />
        )}
      </div>
    </div>
  );
};

export const FloatingCameras: React.FC = () => {
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

  const [isMinimized, setIsMinimized] = useState(false);

  const allParticipants = Object.values(participants);

  const localParticipant: Participant = (currentUserId && participants[currentUserId]) || {
    id: currentUserId || 'local',
    name: currentUserName,
    avatarColor: '#38bdf8',
    isHost,
    isController,
    hasRequestedControl: false,
    isMicOn,
    isCameraOn,
    isScreenSharing: false,
    isSpeaking: false,
    volume: 1,
    joinedAt: Date.now(),
  };

  const list = allParticipants.length > 0 ? allParticipants : [localParticipant];

  return (
    <div className="absolute bottom-14 right-3 z-30 flex flex-col items-end pointer-events-auto">
      {/* Minimize / Expand Toggle Header */}
      <button
        onClick={() => setIsMinimized(!isMinimized)}
        className="mb-1 px-2 py-1 bg-black/75 hover:bg-black/90 backdrop-blur-md text-white text-[10px] rounded-lg border border-white/10 flex items-center gap-1 cursor-pointer transition-colors shadow-md"
      >
        <Users className="w-3 h-3 text-sky-400" />
        <span>Cameras ({list.length})</span>
        {isMinimized ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {/* Floating Strip */}
      {!isMinimized && (
        <div className="flex gap-2 max-w-[calc(100vw-24px)] sm:max-w-md overflow-x-auto p-1 bg-black/40 backdrop-blur-sm rounded-2xl border border-white/10 no-scrollbar">
          {list.map((p) => {
            const isSelf = p.id === currentUserId;
            const stream = isSelf ? (localCamStream || undefined) : remoteCamStreams[p.id];
            return (
              <FloatingTile
                key={p.id}
                participant={p}
                isSelf={isSelf}
                stream={stream}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
