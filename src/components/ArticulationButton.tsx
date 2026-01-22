'use client';

import { Articulation, LOGIC_COLORS, midiNoteToName } from '@/lib/logicArticulationParser';
import { midiHandler } from '@/lib/midiHandler';

interface ArticulationButtonProps {
  articulation: Articulation;
  isActive: boolean;
  onActivate: (articulation: Articulation) => void;
  size?: 'small' | 'medium' | 'large';
}

export function ArticulationButton({
  articulation,
  isActive,
  onActivate,
  size = 'medium'
}: ArticulationButtonProps) {
  const handleClick = () => {
    // Send MIDI messages
    if (articulation.remoteTrigger) {
      const success = midiHandler.sendMessages([{
        status: articulation.remoteTrigger.status,
        data1: articulation.remoteTrigger.data1,
        data2: 127
      }]);

      if (success) {
        onActivate(articulation);
      }
    } else if (articulation.midiMessages.length > 0) {
      // Fallback to output MIDI messages
      const success = midiHandler.sendMessages(articulation.midiMessages);
      if (success) {
        onActivate(articulation);
      }
    }
  };

  // Get color
  const bgColor = LOGIC_COLORS[articulation.color] || LOGIC_COLORS[0];

  // Size classes
  const sizeClasses = {
    small: 'h-12 text-xs',
    medium: 'h-16 text-sm',
    large: 'h-20 text-base'
  };

  // Key switch display
  const keySwitch = articulation.keySwitch !== undefined
    ? midiNoteToName(articulation.keySwitch)
    : articulation.remoteTrigger
      ? midiNoteToName(articulation.remoteTrigger.data1)
      : null;

  return (
    <button
      onClick={handleClick}
      className={`
        relative w-full rounded-lg font-medium
        transition-all duration-150 ease-out
        flex flex-col items-center justify-center gap-0.5
        border-2
        ${sizeClasses[size]}
        ${isActive
          ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900 scale-95'
          : 'hover:scale-[1.02] active:scale-95'
        }
      `}
      style={{
        backgroundColor: bgColor,
        borderColor: isActive ? 'white' : 'rgba(255,255,255,0.2)',
        color: 'white',
        textShadow: '0 1px 2px rgba(0,0,0,0.5)'
      }}
      title={articulation.description || articulation.name}
    >
      <span className="font-semibold truncate px-1 max-w-full">
        {articulation.shortName || articulation.name}
      </span>

      {keySwitch && (
        <span className="text-[10px] opacity-75">
          {keySwitch}
        </span>
      )}

      {/* Auto-assigned indicator */}
      {articulation.remoteTrigger?.isAutoAssigned && (
        <span
          className="absolute top-1 right-1 w-2 h-2 rounded-full bg-orange-400"
          title="Auto-assigned remote trigger"
        />
      )}

      {/* Type indicator */}
      {articulation.articulationType === 1 && (
        <span
          className="absolute bottom-1 right-1 text-[8px] opacity-60"
          title="Direction"
        >
          DIR
        </span>
      )}
    </button>
  );
}
