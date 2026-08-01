import { useEffect, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Flame, Wind } from 'lucide-react';
import type { InputManager } from '../game/input';
import { isTouchPrimary } from '../game/device';

/** Touch-primary devices only; a mouse user gets the keyboard scheme instead. */
export function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    const update = () => setIsTouch(isTouchPrimary());
    update();
    const query = window.matchMedia('(pointer: coarse)');
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return isTouch;
}

interface PadProps {
  label: string;
  onDown: () => void;
  onUp: () => void;
  className?: string;
  children: ReactNode;
}

function Pad({ label, onDown, onUp, className = '', children }: PadProps) {
  const [active, setActive] = useState(false);

  const press = (event: React.PointerEvent) => {
    // Capture so a finger sliding off the button still releases it correctly.
    event.currentTarget.setPointerCapture(event.pointerId);
    setActive(true);
    onDown();
  };
  const release = () => {
    setActive(false);
    onUp();
  };

  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(event) => event.preventDefault()}
      className={`touch-control flex items-center justify-center rounded-2xl border backdrop-blur transition-colors ${
        active ? 'border-white/60 bg-white/25' : 'border-white/20 bg-slate-900/50'
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function TouchControls({ input }: { input: InputManager }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
      <div className="pointer-events-auto flex gap-3">
        <Pad
          label="Steer left"
          onDown={() => (input.touch.steer = -1)}
          onUp={() => (input.touch.steer = 0)}
          className="h-20 w-20"
        >
          <ChevronLeft className="h-9 w-9 text-white" />
        </Pad>
        <Pad
          label="Steer right"
          onDown={() => (input.touch.steer = 1)}
          onUp={() => (input.touch.steer = 0)}
          className="h-20 w-20"
        >
          <ChevronRight className="h-9 w-9 text-white" />
        </Pad>
      </div>

      <div className="pointer-events-auto flex items-end gap-3">
        <Pad
          label="Brake"
          onDown={() => (input.touch.brake = 1)}
          onUp={() => (input.touch.brake = 0)}
          className="h-16 w-16"
        >
          <span className="font-display text-sm font-bold text-white">BRK</span>
        </Pad>
        <Pad
          label="Drift"
          onDown={() => (input.touch.drift = true)}
          onUp={() => (input.touch.drift = false)}
          className="h-20 w-20"
        >
          <Wind className="h-8 w-8 text-cyan-300" />
        </Pad>
        <Pad
          label="Throttle"
          onDown={() => (input.touch.throttle = 1)}
          onUp={() => (input.touch.throttle = 0)}
          className="h-24 w-24"
        >
          <Flame className="h-10 w-10 text-orange-400" />
        </Pad>
      </div>
    </div>
  );
}
