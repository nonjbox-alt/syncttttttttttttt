import React, { useState, useEffect, useRef } from 'react';
import {
  Tv,
  Globe,
  Monitor,
  Video,
  Mic,
  MicOff,
  Camera,
  CameraOff,
  Sparkles,
  ArrowRight,
  Plus,
  LogIn,
  RefreshCw,
  Download,
  Users,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { useRoomStore } from '../store/useRoomStore.ts';

function generateRandomRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

const FUN_NAMES = [
  'CaptainSync',
  'CosmicWatcher',
  'PopcornMaster',
  'StreamKnight',
  'PixelHero',
  'CinemaVoyager',
  'WaveRider',
  'EchoPulse',
  'NovaStar',
];

export const Lobby: React.FC = () => {
  const { currentUserName, setUserName, joinRoom } = useRoomStore();
  const [activeTab, setActiveTab] = useState<'create' | 'join'>('create');
  const [roomIdInput, setRoomIdInput] = useState('');
  const [nameInput, setNameInput] = useState(currentUserName);
  const [isMicPreview, setIsMicPreview] = useState(false);
  const [isCamPreview, setIsCamPreview] = useState(false);
  const [micVolume, setMicVolume] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    const pathMatch = window.location.pathname.match(/\/room\/([a-zA-Z0-9]+)/i);

    if (roomParam) {
      setRoomIdInput(roomParam.toUpperCase());
      setActiveTab('join');
    } else if (pathMatch && pathMatch[1]) {
      setRoomIdInput(pathMatch[1].toUpperCase());
      setActiveTab('join');
    }

    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function updatePreview() {
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((t) => t.stop());
        previewStreamRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      if (!isMicPreview && !isCamPreview) {
        if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = null;
        }
        setMicVolume(0);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: isCamPreview ? { width: { ideal: 640 }, height: { ideal: 360 } } : false,
          audio: isMicPreview ? { echoCancellation: true, noiseSuppression: true } : false,
        });

        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        previewStreamRef.current = stream;

        if (videoPreviewRef.current && isCamPreview) {
          videoPreviewRef.current.srcObject = stream;
        }

        if (isMicPreview) {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          const audioCtx = new AudioContextClass();
          audioContextRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const updateMeter = () => {
            if (isCancelled) return;
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const avg = sum / dataArray.length;
            setMicVolume(Math.min(100, Math.round((avg / 128) * 100)));
            animationFrameRef.current = requestAnimationFrame(updateMeter);
          };
          updateMeter();
        }
      } catch (err) {
        console.warn('Preview device access declined or unavailable:', err);
      }
    }

    updatePreview();

    return () => {
      isCancelled = true;
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isMicPreview, isCamPreview]);

  const handleRandomName = () => {
    const randomName = FUN_NAMES[Math.floor(Math.random() * FUN_NAMES.length)] + Math.floor(10 + Math.random() * 90);
    setNameInput(randomName);
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    const newCode = generateRandomRoomCode();
    const finalName = nameInput.trim() || `User${Math.floor(1000 + Math.random() * 9000)}`;
    setUserName(finalName);
    if (previewStreamRef.current) previewStreamRef.current.getTracks().forEach((t) => t.stop());
    window.history.pushState({}, '', `/room/${newCode}`);
    await joinRoom(newCode, finalName);
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const targetRoom = roomIdInput.trim().toUpperCase();
    if (!targetRoom) return;
    setIsSubmitting(true);
    const finalName = nameInput.trim() || `User${Math.floor(1000 + Math.random() * 9000)}`;
    setUserName(finalName);
    if (previewStreamRef.current) previewStreamRef.current.getTracks().forEach((t) => t.stop());
    window.history.pushState({}, '', `/room/${targetRoom}`);
    await joinRoom(targetRoom, finalName);
  };

  const handleInstallPWA = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setInstallPrompt(null);
  };

  return (
    <div id="lobby-view" className="w-full h-full min-h-[100dvh] overflow-y-auto bg-gradient-to-b from-[#090d16] via-[#0d1322] to-[#090d16] flex flex-col justify-between p-4 sm:p-6 md:p-8 relative">
      <header className="w-full max-w-6xl mx-auto flex items-center justify-between py-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <Tv className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              SyncRoom
              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">P2P Ultra</span>
            </h1>
            <p className="text-xs text-slate-400">Next-Gen Watch Party & Shared Browsing</p>
          </div>
        </div>
        {installPrompt && (
          <button id="install-pwa-btn" onClick={handleInstallPWA} className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 rounded-lg transition-colors cursor-pointer">
            <Download className="w-3.5 h-3.5" /><span>Install App</span>
          </button>
        )}
      </header>

      <main className="w-full max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-center my-auto py-6">
        <div className="lg:col-span-6 space-y-6 text-center lg:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs text-slate-300"><Sparkles className="w-3.5 h-3.5 text-sky-400" /><span>Real-time watch party with no registration needed</span></div>
          <div className="space-y-3">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-tight">Watch anything. <br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-indigo-300 to-sky-300">Browse together.</span> <br />Talk together.</h2>
            <p className="text-slate-400 text-sm sm:text-base max-w-lg mx-auto lg:mx-0 leading-relaxed">Synchronize video streaming, surf websites in interactive shared browser mode, share your screen, and hang out with HD WebRTC webcam & voice chat.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-col items-center lg:items-start gap-1"><Globe className="w-4 h-4 text-sky-400" /><span className="text-xs font-semibold text-slate-200">Shared Browse</span><span className="text-[10px] text-slate-500">Sync URL & scroll</span></div>
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-col items-center lg:items-start gap-1"><Monitor className="w-4 h-4 text-indigo-400" /><span className="text-xs font-semibold text-slate-200">Screen Share</span><span className="text-[10px] text-slate-500">Tab, window, screen</span></div>
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-col items-center lg:items-start gap-1"><Video className="w-4 h-4 text-pink-400" /><span className="text-xs font-semibold text-slate-200">Webcam Grid</span><span className="text-[10px] text-slate-500">WebRTC P2P mesh</span></div>
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-col items-center lg:items-start gap-1"><Zap className="w-4 h-4 text-amber-400" /><span className="text-xs font-semibold text-slate-200">Sync Video</span><span className="text-[10px] text-slate-500">Sub-second sync</span></div>
          </div>
        </div>

        <div className="lg:col-span-6 w-full max-w-md mx-auto">
          <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800/90 rounded-2xl p-6 shadow-2xl shadow-black/60 relative overflow-hidden">
            <div className="flex p-1 bg-slate-950/70 rounded-xl border border-slate-800/60 mb-6">
              <button id="tab-create-room" type="button" onClick={() => setActiveTab('create')} className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${activeTab === 'create' ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}><Plus className="w-3.5 h-3.5" />Create Room</button>
              <button id="tab-join-room" type="button" onClick={() => setActiveTab('join')} className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${activeTab === 'join' ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}><LogIn className="w-3.5 h-3.5" />Join Room</button>
            </div>

            <div className="space-y-2 mb-5">
              <div className="flex items-center justify-between"><label htmlFor="display-name-input" className="text-xs font-medium text-slate-300">Your Display Name</label><button type="button" onClick={handleRandomName} className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors cursor-pointer"><RefreshCw className="w-3 h-3" />Randomize</button></div>
              <input id="display-name-input" type="text" value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="e.g. Alex" maxLength={24} className="w-full bg-slate-950/90 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500/80 focus:ring-1 focus:ring-sky-500/80 transition-colors" />
            </div>

            {activeTab === 'join' && (
              <div className="space-y-2 mb-5"><label htmlFor="room-code-input" className="text-xs font-medium text-slate-300">Room Code or URL</label><input id="room-code-input" type="text" value={roomIdInput} onChange={(e) => setRoomIdInput(e.target.value.toUpperCase())} placeholder="e.g. AB82KX" maxLength={12} className="w-full bg-slate-950/90 border border-slate-800 rounded-xl px-4 py-2.5 text-sm font-mono tracking-wider text-white uppercase placeholder-slate-500 focus:outline-none focus:border-sky-500/80 focus:ring-1 focus:ring-sky-500/80 transition-colors" /></div>
            )}

            <div className="mb-6 p-3 bg-slate-950/50 rounded-xl border border-slate-800/60 space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-300"><span className="font-medium">Device Preview</span><span className="text-[10px] text-slate-500">Optional before entering</span></div>
              <div className="relative w-full h-28 bg-slate-900 rounded-lg overflow-hidden flex items-center justify-center border border-slate-800/80">
                {isCamPreview ? <video ref={videoPreviewRef} autoPlay playsInline muted className="w-full h-full object-cover -scale-x-100" /> : <div className="flex flex-col items-center gap-1.5 text-slate-500"><CameraOff className="w-5 h-5" /><span className="text-[11px]">Camera is off</span></div>}
                {isMicPreview && <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded-md"><Mic className="w-3 h-3 text-emerald-400 animate-pulse" /><div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-emerald-500 to-sky-400 transition-all duration-75 rounded-full" style={{ width: `${micVolume}%` }} /></div></div>}
              </div>
              <div className="flex items-center gap-2">
                <button id="preview-toggle-mic" type="button" onClick={() => setIsMicPreview(!isMicPreview)} className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 border transition-colors cursor-pointer ${isMicPreview ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'}`}>{isMicPreview ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}<span>{isMicPreview ? 'Mic Active' : 'Test Mic'}</span></button>
                <button id="preview-toggle-cam" type="button" onClick={() => setIsCamPreview(!isCamPreview)} className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 border transition-colors cursor-pointer ${isCamPreview ? 'bg-sky-500/10 border-sky-500/30 text-sky-300' : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'}`}>{isCamPreview ? <Camera className="w-3.5 h-3.5" /> : <CameraOff className="w-3.5 h-3.5" />}<span>{isCamPreview ? 'Cam Active' : 'Test Cam'}</span></button>
              </div>
            </div>

            {activeTab === 'create' ? (
              <button id="submit-create-room" type="button" onClick={handleCreateRoom} disabled={isSubmitting} className="w-full py-3 px-4 bg-gradient-to-r from-sky-500 via-indigo-600 to-sky-500 hover:brightness-110 active:scale-[0.99] text-white font-semibold text-sm rounded-xl shadow-lg shadow-sky-500/25 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50">{isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><span>Create Room</span><ArrowRight className="w-4 h-4" /></>}</button>
            ) : (
              <button id="submit-join-room" type="button" onClick={handleJoinRoom} disabled={isSubmitting || !roomIdInput.trim()} className="w-full py-3 px-4 bg-gradient-to-r from-sky-500 via-indigo-600 to-sky-500 hover:brightness-110 active:scale-[0.99] text-white font-semibold text-sm rounded-xl shadow-lg shadow-sky-500/25 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50">{isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><span>Join Room</span><ArrowRight className="w-4 h-4" /></>}</button>
            )}

            <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-500"><ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /><span>Peer-to-peer encrypted media streams</span></div>
          </div>
        </div>
      </main>

      <footer className="w-full max-w-6xl mx-auto text-center py-2 text-xs text-slate-600 flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-slate-900">
        <div>SyncRoom &copy; 2026 — Shared Browsing, Screen Share & Synchronized Watch Party</div>
        <div className="flex items-center gap-4 text-slate-500"><span>WebRTC P2P</span><span>•</span><span>Zero Sign-up</span><span>•</span><span>PWA Ready</span></div>
      </footer>

      {/* Build/version marker */}
      <span className="fixed bottom-2 right-3 text-[10px] font-mono text-slate-600/80 pointer-events-none select-none">v2.0</span>
    </div>
  );
};
