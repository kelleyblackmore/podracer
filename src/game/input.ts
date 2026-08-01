import type { Controls } from './engine';

/** Keys we swallow so the page never scrolls or space-jumps mid-race. */
const CAPTURED = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ShiftLeft',
  'ShiftRight',
]);

export interface TouchInput {
  throttle: number;
  brake: number;
  steer: number;
  drift: boolean;
}

/**
 * Collects keyboard, gamepad and on-screen input into a single {@link Controls}
 * snapshot. The race loop reads it every frame; nothing here touches React
 * state, so input never causes a re-render.
 */
export class InputManager {
  private keys = new Set<string>();
  private controls: Controls = { throttle: 0, brake: 0, steer: 0, drift: false };
  readonly touch: TouchInput = { throttle: 0, brake: 0, steer: 0, drift: false };

  /** Fired for one-shot keys (pause, camera, restart) rather than held state. */
  onAction: (action: 'pause' | 'camera' | 'restart' | 'exit' | 'mute') => void = () => {};

  private handleKeyDown = (event: KeyboardEvent) => {
    if (event.repeat) {
      if (CAPTURED.has(event.code)) event.preventDefault();
      return;
    }
    if (CAPTURED.has(event.code)) event.preventDefault();
    this.keys.add(event.code);

    switch (event.code) {
      case 'KeyP':
      case 'Escape':
        this.onAction('pause');
        break;
      case 'KeyC':
        this.onAction('camera');
        break;
      case 'KeyR':
        this.onAction('restart');
        break;
      case 'KeyM':
        this.onAction('mute');
        break;
      default:
        break;
    }
  };

  private handleKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
  };

  /** Held keys survive a tab switch otherwise, leaving the pod stuck at full throttle. */
  private handleBlur = () => {
    this.keys.clear();
    this.touch.throttle = 0;
    this.touch.brake = 0;
    this.touch.steer = 0;
    this.touch.drift = false;
  };

  attach(): () => void {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    return () => {
      window.removeEventListener('keydown', this.handleKeyDown);
      window.removeEventListener('keyup', this.handleKeyUp);
      window.removeEventListener('blur', this.handleBlur);
      this.handleBlur();
    };
  }

  read(): Controls {
    const held = (...codes: string[]) => codes.some((code) => this.keys.has(code));

    let steer = 0;
    if (held('ArrowLeft', 'KeyA')) steer -= 1;
    if (held('ArrowRight', 'KeyD')) steer += 1;

    let throttle = held('ArrowUp', 'KeyW') ? 1 : 0;
    let brake = held('ArrowDown', 'KeyS') ? 1 : 0;
    let drift = held('ShiftLeft', 'ShiftRight', 'Space');

    const pad = this.readGamepad();
    if (pad) {
      steer += pad.steer;
      throttle = Math.max(throttle, pad.throttle);
      brake = Math.max(brake, pad.brake);
      drift = drift || pad.drift;
    }

    steer += this.touch.steer;
    throttle = Math.max(throttle, this.touch.throttle);
    brake = Math.max(brake, this.touch.brake);
    drift = drift || this.touch.drift;

    this.controls.steer = Math.max(-1, Math.min(1, steer));
    this.controls.throttle = Math.min(1, throttle);
    this.controls.brake = Math.min(1, brake);
    this.controls.drift = drift;
    return this.controls;
  }

  private readGamepad(): TouchInput | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const pad = navigator.getGamepads()[0];
    if (!pad) return null;
    const deadzone = (value: number) => (Math.abs(value) < 0.15 ? 0 : value);
    return {
      steer: deadzone(pad.axes[0] ?? 0),
      throttle: Math.max(pad.buttons[7]?.value ?? 0, pad.buttons[0]?.pressed ? 1 : 0),
      brake: pad.buttons[6]?.value ?? 0,
      drift: Boolean(pad.buttons[1]?.pressed || pad.buttons[5]?.pressed),
    };
  }
}
