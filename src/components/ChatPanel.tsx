import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  X,
  MessageSquare,
  Smile,
  Sparkles,
} from 'lucide-react';
import { useRoomStore } from '../store/useRoomStore.ts';

const QUICK_EMOJIS = ['😂', '❤️', '🔥', '👏', '🍿', '🚀', '🎉', '💯'];

function formatChatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export const ChatPanel: React.FC = () => {
  const {
    chatMessages,
    sendChatMessage,
    sendReaction,
    isChatOpen,
    toggleChat,
    currentUserId,
  } = useRoomStore();

  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isChatOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isChatOpen]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    sendChatMessage(inputText);
    setInputText('');
  };

  const handleReactionClick = (emoji: string) => {
    sendReaction(emoji);
  };

  if (!isChatOpen) return null;

  return (
    <div
      id="chat-panel"
      className="fixed inset-y-0 right-0 w-full sm:w-80 md:w-96 bg-slate-950/95 backdrop-blur-xl border-l border-slate-800/90 shadow-2xl z-40 flex flex-col justify-between animate-slideLeft select-none"
    >
      {/* Panel Header */}
      <div className="h-14 px-4 border-b border-slate-800/80 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-sky-400" />
          <h3 className="font-bold text-sm text-white">Room Chat</h3>
          <span className="text-[10px] text-slate-500 font-mono">({chatMessages.length})</span>
        </div>
        <button
          id="close-chat-btn"
          onClick={toggleChat}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages List */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3">
        {chatMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 gap-2">
            <MessageSquare className="w-8 h-8 opacity-30" />
            <p className="text-xs">No messages yet. Say hi!</p>
          </div>
        ) : (
          chatMessages.map((msg) => {
            const isSelf = msg.senderId === currentUserId;
            const isSystem = msg.type === 'system';

            if (isSystem) {
              return (
                <div key={msg.id} className="text-center my-2">
                  <span className="px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800/80 text-[11px] text-slate-400 inline-block max-w-[90%]">
                    {msg.text}
                  </span>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                className={`flex flex-col gap-0.5 ${isSelf ? 'items-end' : 'items-start'}`}
              >
                {/* Sender name & timestamp */}
                <div className="flex items-center gap-1.5 px-1 text-[10px] text-slate-400">
                  <span
                    className="font-semibold"
                    style={{ color: msg.senderColor || '#38bdf8' }}
                  >
                    {isSelf ? 'You' : msg.senderName}
                  </span>
                  <span>•</span>
                  <span>{formatChatTime(msg.timestamp)}</span>
                </div>

                {/* Message Bubble */}
                <div
                  className={`px-3 py-2 rounded-2xl text-xs max-w-[85%] break-words leading-relaxed select-text ${
                    isSelf
                      ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white rounded-tr-xs'
                      : 'bg-slate-900 text-slate-200 border border-slate-800 rounded-tl-xs'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Reaction Emojis Bar */}
      <div className="px-3 py-2 bg-slate-900/60 border-t border-slate-900 flex items-center justify-between gap-1 overflow-x-auto no-scrollbar shrink-0">
        {QUICK_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => handleReactionClick(emoji)}
            className="p-1.5 hover:scale-125 active:scale-95 rounded-lg hover:bg-slate-800 transition-all text-base cursor-pointer shrink-0"
            title={`React with ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Message Input Bar */}
      <form onSubmit={handleSend} className="p-3 bg-slate-950 border-t border-slate-800/80 flex items-center gap-2 shrink-0">
        <input
          id="chat-text-input"
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type a message..."
          maxLength={500}
          className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500/80 focus:ring-1 focus:ring-sky-500/80 transition-colors"
        />
        <button
          id="chat-send-btn"
          type="submit"
          disabled={!inputText.trim()}
          className="p-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 text-white hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100 transition-all cursor-pointer"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
