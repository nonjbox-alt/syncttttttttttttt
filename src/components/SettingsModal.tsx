import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  X,
  Mic,
  Video,
  Volume2,
  Sliders,
  Radio,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { useRoomStore } from '../store/useRoomStore.ts';

export const SettingsModal: React.FC = () => {
  const {
    isSettingsOpen,
    toggleSettings,
    selectedAudioDevice,
    selectedVideoDevice,
    echoCancellation,
    noiseSuppression,
    autoGainControl,
    isPushToTalk,
    setPushToTalk,
    updateSettings,
  } = useRoomStore();

  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    if (!isSettingsOpen) return;

    async function loadDevices() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setAudioInputs(devices.filter((d) => d.kind === 'audioinput'));
        setVideoInputs(devices.filter((d) => d.kind === 'videoinput'));
        setAudioOutputs(devices.filter((d) => d.kind === 'audiooutput'));
      } catch (err) {
        console.warn('Unable to enumerate devices:', err);
      }
    }

    loadDevices();
  }, [isSettingsOpen]);

  if (!isSettingsOpen) return null;

  return (
    <div
      id="settings-modal-backdrop"
      className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn select-none"
    >
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="h-14 px-6 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-4 h-4 text-sky-400" />
            <h3 className="font-bold text-sm text-white">Audio & Video Settings</h3>
          </div>
          <button
            onClick={toggleSettings}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Settings Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-200">
          {/* Microphones */}
          <div className="space-y-2">
            <label className="font-semibold text-slate-300 flex items-center gap-2">
              <Mic className="w-3.5 h-3.5 text-sky-400" />
              Microphone
            </label>
            <select
              value={selectedAudioDevice}
              onChange={(e) => updateSettings({ selectedAudioDevice: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
            >
              <option value="">Default Microphone</option>
              {audioInputs.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Microphone ${i + 1}`}
                </option>
              ))}
            </select>
          </div>

          {/* Webcams */}
          <div className="space-y-2">
            <label className="font-semibold text-slate-300 flex items-center gap-2">
              <Video className="w-3.5 h-3.5 text-indigo-400" />
              Camera
            </label>
            <select
              value={selectedVideoDevice}
              onChange={(e) => updateSettings({ selectedVideoDevice: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
            >
              <option value="">Default Camera</option>
              {videoInputs.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
          </div>

          {/* Voice Processing Features */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <span className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">
              Voice Processing (WebRTC)
            </span>

            <div className="space-y-2">
              <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 cursor-pointer">
                <div>
                  <div className="font-medium text-white">Echo Cancellation</div>
                  <div className="text-[10px] text-slate-500">Prevents audio feedback loops</div>
                </div>
                <input
                  type="checkbox"
                  checked={echoCancellation}
                  onChange={(e) => updateSettings({ echoCancellation: e.target.checked })}
                  className="w-4 h-4 rounded accent-sky-500 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 cursor-pointer">
                <div>
                  <div className="font-medium text-white">Noise Suppression</div>
                  <div className="text-[10px] text-slate-500">Filters background hum and fans</div>
                </div>
                <input
                  type="checkbox"
                  checked={noiseSuppression}
                  onChange={(e) => updateSettings({ noiseSuppression: e.target.checked })}
                  className="w-4 h-4 rounded accent-sky-500 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 cursor-pointer">
                <div>
                  <div className="font-medium text-white">Auto Gain Control</div>
                  <div className="text-[10px] text-slate-500">Normalizes speaking volume</div>
                </div>
                <input
                  type="checkbox"
                  checked={autoGainControl}
                  onChange={(e) => updateSettings({ autoGainControl: e.target.checked })}
                  className="w-4 h-4 rounded accent-sky-500 cursor-pointer"
                />
              </label>
            </div>
          </div>

          {/* Push To Talk */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <span className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">
              Microphone Mode
            </span>

            <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 cursor-pointer">
              <div>
                <div className="font-medium text-white">Push-to-Talk (Spacebar)</div>
                <div className="text-[10px] text-slate-500">Hold Spacebar to speak</div>
              </div>
              <input
                type="checkbox"
                checked={isPushToTalk}
                onChange={(e) => setPushToTalk(e.target.checked)}
                className="w-4 h-4 rounded accent-sky-500 cursor-pointer"
              />
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            onClick={toggleSettings}
            className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
