import { useEffect, useMemo, useRef } from 'react';
import type { RaceState } from '../game/engine';

const SIZE = 148;
const PADDING = 12;

/**
 * Draws the circuit and live racer dots to a 2D canvas on its own rAF loop.
 * Deliberately outside React's render cycle — it updates 60 times a second and
 * must not cost a re-render.
 */
export function Minimap({ race }: { race: RaceState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const projection = useMemo(() => {
    const samples = race.geometry.samples;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const sample of samples) {
      minX = Math.min(minX, sample.x);
      maxX = Math.max(maxX, sample.x);
      minZ = Math.min(minZ, sample.z);
      maxZ = Math.max(maxZ, sample.z);
    }
    const span = Math.max(maxX - minX, maxZ - minZ) || 1;
    const scale = (SIZE - PADDING * 2) / span;
    const offsetX = (SIZE - (maxX - minX) * scale) / 2;
    const offsetZ = (SIZE - (maxZ - minZ) * scale) / 2;
    return {
      toX: (x: number) => (x - minX) * scale + offsetX,
      toY: (z: number) => (z - minZ) * scale + offsetZ,
    };
  }, [race.geometry]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    ctx.scale(dpr, dpr);

    let frame = 0;
    const samples = race.geometry.samples;

    const draw = () => {
      ctx.clearRect(0, 0, SIZE, SIZE);

      ctx.beginPath();
      for (let i = 0; i < samples.length; i++) {
        const x = projection.toX(samples[i].x);
        const y = projection.toY(samples[i].z);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
      ctx.lineWidth = 7;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.strokeStyle = race.geometry.data.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Start line marker
      const start = samples[0];
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(projection.toX(start.x) - 2, projection.toY(start.z) - 2, 4, 4);

      for (const racer of race.racers) {
        const x = projection.toX(racer.x);
        const y = projection.toY(racer.z);
        ctx.beginPath();
        ctx.arc(x, y, racer.isPlayer ? 4.5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = racer.color;
        ctx.fill();
        if (racer.isPlayer) {
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = '#f8fafc';
          ctx.stroke();
        }
      }

      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [race, projection]);

  return (
    <canvas
      ref={canvasRef}
      width={SIZE}
      height={SIZE}
      style={{ width: SIZE, height: SIZE }}
      className="rounded-xl border border-slate-700/60 bg-slate-950/70 backdrop-blur"
      aria-label="Circuit map"
    />
  );
}
