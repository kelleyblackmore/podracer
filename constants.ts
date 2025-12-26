import { CarConfig, TrackData } from './types';

// Simple track generation helper
const generateOval = (centerX: number, centerY: number, width: number, height: number, segments: number) => {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * 2 * Math.PI;
    points.push({
      x: centerX + (width / 2) * Math.cos(theta),
      y: centerY + (height / 2) * Math.sin(theta),
    });
  }
  return points;
};

// A figure-8 style track
const generateFigure8 = (centerX: number, centerY: number, scale: number) => {
  const points = [];
  const segments = 150;
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * 2 * Math.PI;
    const x = centerX + scale * Math.sin(t);
    const y = centerY + scale * Math.sin(t) * Math.cos(t);
    points.push({ x, y });
  }
  return points;
};

// Complex curvy track
const generateComplex = (centerX: number, centerY: number, scale: number) => {
    const points = [];
    const segments = 200;
    for(let i=0; i<=segments; i++) {
        const t = (i/segments) * 2 * Math.PI;
        // Parametric equation for a more complex loop (Boomerang shape)
        const x = centerX + scale * (Math.sin(t) + 0.3 * Math.sin(2*t));
        const y = centerY + scale * (0.8 * Math.cos(t) - 0.4 * Math.cos(2*t));
        points.push({x, y});
    }
    return points;
}

export const TRACKS: TrackData[] = [
  {
    id: 'oval-speedway',
    name: 'Mos Espa Circuit',
    difficulty: 'Easy',
    width: 250,
    color: '#f59e0b', // Desert Sand
    points: generateOval(0, 0, 3000, 1800, 100), // Significantly larger
  },
  {
    id: 'figure-8',
    name: 'Dune Sea Loop',
    difficulty: 'Medium',
    width: 220,
    color: '#ef4444',
    points: generateFigure8(0, 0, 2000), // Larger
  },
  {
    id: 'canyon-complex',
    name: 'Beggar\'s Canyon',
    difficulty: 'Hard',
    width: 200,
    color: '#a855f7',
    points: generateComplex(0, 0, 2200),
  }
];

export const CARS: CarConfig[] = [
  {
    id: 'pod-1',
    name: 'Titan Twin-Turbo',
    color: '#3b82f6',
    acceleration: 0.4,
    topSpeed: 32, // Faster than cars
    handling: 0.92,
  },
  {
    id: 'pod-2',
    name: 'Crimson Fury',
    color: '#ef4444',
    acceleration: 0.55,
    topSpeed: 38,
    handling: 0.88, // Hard to handle high speed
  },
  {
    id: 'pod-3',
    name: 'Jade Speeder',
    color: '#10b981',
    acceleration: 0.35,
    topSpeed: 30,
    handling: 0.96, // Very grippy
  },
];