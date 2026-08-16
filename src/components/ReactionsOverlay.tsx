import React from 'react';
import { useRoomStore } from '../store/useRoomStore.ts';

export const ReactionsOverlay: React.FC = () => {
  const { floatingReactions } = useRoomStore();

  if (floatingReactions.length === 0) return null;

  return (
    <div
      id="reactions-overlay"
      className="fixed inset-0 pointer-events-none z-50 overflow-hidden select-none"
    >
      {floatingReactions.map((reaction, index) => {
        // Distribute slightly across the right bottom portion
        const randomX = 75 + (index % 5) * 4;
        return (
          <div
            key={reaction.id}
            className="absolute bottom-20 flex flex-col items-center gap-1 animate-floatUp"
            style={{
              left: `${randomX}%`,
            }}
          >
            <span className="text-3xl sm:text-4xl filter drop-shadow-md">{reaction.emoji}</span>
            <span className="px-2 py-0.5 rounded-full bg-black/75 backdrop-blur-md text-[10px] text-white font-medium border border-white/10 shadow-lg">
              {reaction.senderName}
            </span>
          </div>
        );
      })}
    </div>
  );
};
