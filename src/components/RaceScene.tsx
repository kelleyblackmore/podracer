import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { CameraMode } from '../types';
import type { RaceEvent, RaceState, Racer } from '../game/engine';
import { NEUTRAL_CONTROLS, stepRace } from '../game/engine';
import {
  buildTrackMeshes,
  disposeTrackMeshes,
  GROUND_DROP,
  LAYER,
  racerHeight,
  RUNOFF_WIDTH,
  WALL_HEIGHT,
  type SceneryInstance,
} from '../game/trackMesh';
import {
  createCheckerTexture,
  createCurbTexture,
  createRoadTexture,
  createRunoffTexture,
  createWallTexture,
  disposeTextures,
} from '../game/textures';
import { maxPixelRatio } from '../game/device';
import type { InputManager } from '../game/input';
import type { SceneryKind } from '../types';

const PARTICLE_POOL = 220;
const SKID_POOL = 260;

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  color: THREE.Color;
}

interface Skid {
  x: number;
  /** Sampled from the banked road surface when the mark is laid down. */
  y: number;
  z: number;
  angle: number;
  bank: number;
  life: number;
}

export interface SceneProps {
  race: RaceState;
  input: InputManager;
  cameraMode: CameraMode;
  quality: 'low' | 'high';
  paused: boolean;
  onFrame: (race: RaceState, events: RaceEvent[]) => void;
}

// --- Pod ---------------------------------------------------------------------

/** One pod racer. Every per-frame value is written through refs, never state. */
function Pod({ racer, race }: { racer: Racer; race: RaceState }) {
  const group = useRef<THREE.Group>(null);
  const flameLeft = useRef<THREE.Mesh>(null);
  const flameRight = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.PointLight>(null);

  const bodyColor = useMemo(() => new THREE.Color(racer.color), [racer.color]);
  const flameColor = useMemo(() => new THREE.Color('#60a5fa'), []);
  const boostColor = useMemo(() => new THREE.Color('#c084fc'), []);
  const driftColor = useMemo(() => new THREE.Color('#f87171'), []);

  useFrame((_, delta) => {
    const node = group.current;
    if (!node) return;

    const speedRatio = Math.min(1, Math.abs(racer.speed) / racer.config.topSpeed);
    // Engine vibration scales with speed; smoothed so it reads as thrust, not noise.
    const vibe = Math.sin(performance.now() * 0.05) * speedRatio * 1.2;

    // Sit on the banked, elevated road surface rather than a flat y = 0 plane.
    const samples = race.geometry.samples;
    const sample = samples[racer.trackIndex];
    const surface = racerHeight(sample, racer.lateral);
    node.position.set(racer.x, surface + 6 + vibe, racer.z);

    // YXZ so heading applies first: X then rolls about the pod's own nose-to-tail
    // axis and Z pitches it. With the default XYZ order these two swap over and
    // a banking pod appears to pitch instead.
    node.rotation.order = 'YXZ';
    node.rotation.y = -racer.angle;

    // Lean into the slide, on top of whatever the road itself is doing.
    const heading = Math.atan2(racer.vz, racer.vx);
    let slip = heading - racer.angle;
    while (slip > Math.PI) slip -= Math.PI * 2;
    while (slip < -Math.PI) slip += Math.PI * 2;
    const targetRoll = sample.bank + slip * 0.35;
    node.rotation.x = THREE.MathUtils.lerp(node.rotation.x, targetRoll, Math.min(1, delta * 8));

    // Pitch with the gradient of the road under the pod.
    const ahead = samples[(racer.trackIndex + 1) % samples.length];
    const behind = samples[(racer.trackIndex - 1 + samples.length) % samples.length];
    const slope = (ahead.y - behind.y) / (2 * race.geometry.spacing);
    node.rotation.z = THREE.MathUtils.lerp(
      node.rotation.z,
      Math.atan(slope) + vibe * 0.01,
      Math.min(1, delta * 6),
    );

    const boosting = racer.boostTimer > 0;
    const target = boosting ? 2.4 : racer.drifting ? 1.5 : 0.6 + speedRatio;
    const color = boosting ? boostColor : racer.drifting ? driftColor : flameColor;
    for (const flame of [flameLeft.current, flameRight.current]) {
      if (!flame) continue;
      const scale = THREE.MathUtils.lerp(flame.scale.x, target, Math.min(1, delta * 12));
      flame.scale.set(scale, 1, 1);
      (flame.material as THREE.MeshBasicMaterial).color.copy(color);
    }
    if (glow.current) {
      glow.current.intensity = boosting ? 6 : 1.5 + speedRatio * 2;
      glow.current.color.copy(boosting ? boostColor : bodyColor);
    }
  });

  return (
    <group ref={group}>
      {/* Cockpit, trailing the engines on cables */}
      <group position={[-34, 2, 0]}>
        <mesh castShadow>
          <boxGeometry args={[26, 11, 15]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.6} roughness={0.25} />
        </mesh>
        <mesh position={[6, 5, 0]}>
          <sphereGeometry args={[5, 16, 12]} />
          <meshStandardMaterial color={racer.color} metalness={0.8} roughness={0.15} />
        </mesh>
      </group>

      <mesh position={[-10, 2, 9]} rotation={[0, 0, -0.18]}>
        <cylinderGeometry args={[0.6, 0.6, 34, 6]} />
        <meshStandardMaterial color="#64748b" />
      </mesh>
      <mesh position={[-10, 2, -9]} rotation={[0, 0, -0.18]}>
        <cylinderGeometry args={[0.6, 0.6, 34, 6]} />
        <meshStandardMaterial color="#64748b" />
      </mesh>

      {[-17, 17].map((z, i) => (
        <group key={z} position={[16, 2, z]}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[6.5, 6.5, 34, 12]} />
            <meshStandardMaterial color={racer.color} metalness={0.7} roughness={0.3} />
          </mesh>
          <mesh position={[17, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[4, 5.5, 3, 12]} />
            <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.4} />
          </mesh>
          <mesh
            ref={i === 0 ? flameLeft : flameRight}
            position={[-26, 0, 0]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <coneGeometry args={[4.5, 34, 8, 1, true]} />
            <meshBasicMaterial color="#60a5fa" transparent opacity={0.75} toneMapped={false} />
          </mesh>
        </group>
      ))}

      {/* Energy binder arcing between the engines */}
      <mesh position={[16, 2, 0]}>
        <boxGeometry args={[2, 2, 30]} />
        <meshBasicMaterial color="#d8b4fe" wireframe transparent opacity={0.45} />
      </mesh>

      <pointLight ref={glow} position={[0, 6, 0]} color={racer.color} intensity={2} distance={220} decay={2} />
    </group>
  );
}

// --- Track -------------------------------------------------------------------

/** Unit prop geometry per scenery kind: radius 1, height 1, base at y = 0. */
function sceneryGeometry(kind: SceneryKind): THREE.BufferGeometry {
  switch (kind) {
    case 'spire': {
      const geo = new THREE.ConeGeometry(1, 1, 6);
      geo.translate(0, 0.5, 0);
      return geo;
    }
    case 'pylon': {
      const geo = new THREE.BoxGeometry(1.4, 1, 1.4);
      geo.translate(0, 0.5, 0);
      return geo;
    }
    case 'crystal': {
      const geo = new THREE.OctahedronGeometry(1, 0);
      geo.scale(0.7, 1, 0.7);
      geo.translate(0, 0.5, 0);
      return geo;
    }
    case 'dune': {
      const geo = new THREE.SphereGeometry(1, 10, 6);
      geo.scale(1.6, 0.5, 1.6);
      return geo;
    }
    case 'mesa':
    default: {
      const geo = new THREE.CylinderGeometry(0.62, 1, 1, 6);
      geo.translate(0, 0.5, 0);
      return geo;
    }
  }
}

/** All scenery props share one InstancedMesh — a single draw call for the horizon. */
function Scenery({ items, kind, color }: { items: SceneryInstance[]; kind: SceneryKind; color: string }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => sceneryGeometry(kind), [kind]);
  const base = useMemo(() => new THREE.Color(color), [color]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useLayoutEffect(() => {
    const node = mesh.current;
    if (!node || items.length === 0) return;
    const tint = new THREE.Color();
    items.forEach((item, i) => {
      DUMMY.position.set(item.x, item.y, item.z);
      DUMMY.rotation.set(0, item.rotation, 0);
      DUMMY.scale.set(item.scale * 46, item.height, item.scale * 46);
      DUMMY.updateMatrix();
      node.setMatrixAt(i, DUMMY.matrix);
      // Vary brightness so a field of identical props still reads as terrain.
      tint.copy(base).multiplyScalar(0.62 + item.tint * 0.55);
      node.setColorAt(i, tint);
    });
    node.instanceMatrix.needsUpdate = true;
    if (node.instanceColor) node.instanceColor.needsUpdate = true;
  }, [items, base]);

  if (items.length === 0) return null;

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, undefined, items.length]}
      castShadow={false}
      receiveShadow={false}
      frustumCulled={false}
    >
      <meshStandardMaterial roughness={0.95} metalness={0.05} flatShading />
    </instancedMesh>
  );
}

function TrackVisuals({ race, quality }: { race: RaceState; quality: 'low' | 'high' }) {
  const meshes = useMemo(() => buildTrackMeshes(race.geometry), [race.geometry]);
  useEffect(() => () => disposeTrackMeshes(meshes), [meshes]);

  const theme = race.geometry.data.theme;
  const trackWidth = race.geometry.data.width;
  const outer = race.geometry.halfWidth + RUNOFF_WIDTH;

  const textures = useMemo(
    () => ({
      road: createRoadTexture(theme.road, '#e2e8f0'),
      curb: createCurbTexture(theme.curb),
      runoff: createRunoffTexture(theme.runoff),
      wall: createWallTexture(theme.wall, theme.accent),
      checker: createCheckerTexture(),
    }),
    [theme],
  );
  useEffect(() => () => disposeTextures(Object.values(textures)), [textures]);

  return (
    <group>
      <mesh geometry={meshes.road} receiveShadow>
        <meshStandardMaterial map={textures.road} roughness={0.82} metalness={0.12} />
      </mesh>

      <mesh geometry={meshes.runoffLeft} receiveShadow>
        <meshStandardMaterial map={textures.runoff} roughness={1} />
      </mesh>
      <mesh geometry={meshes.runoffRight} receiveShadow>
        <meshStandardMaterial map={textures.runoff} roughness={1} />
      </mesh>

      <mesh geometry={meshes.curbLeft}>
        <meshStandardMaterial map={textures.curb} roughness={0.6} />
      </mesh>
      <mesh geometry={meshes.curbRight}>
        <meshStandardMaterial map={textures.curb} roughness={0.6} />
      </mesh>

      <mesh geometry={meshes.wallLeft}>
        <meshStandardMaterial map={textures.wall} side={THREE.DoubleSide} roughness={0.85} />
      </mesh>
      <mesh geometry={meshes.wallRight}>
        <meshStandardMaterial map={textures.wall} side={THREE.DoubleSide} roughness={0.85} />
      </mesh>

      {/* Emissive rail capping each barrier — the strongest read of the track's
          shape from a distance, and what makes a corner legible at speed. */}
      <mesh geometry={meshes.railLeft}>
        <meshBasicMaterial color={theme.accent} toneMapped={false} />
      </mesh>
      <mesh geometry={meshes.railRight}>
        <meshBasicMaterial color={theme.accent} toneMapped={false} />
      </mesh>

      <mesh geometry={meshes.startLine}>
        <meshBasicMaterial map={textures.checker} toneMapped={false} />
      </mesh>

      {/* Start / finish gantry */}
      <group
        position={[meshes.gantry.x, meshes.gantry.y, meshes.gantry.z]}
        rotation={[0, -meshes.gantry.angle, 0]}
      >
        {[-1, 1].map((side) => (
          <mesh key={side} position={[0, 48, side * (trackWidth / 2 + 34)]} castShadow>
            <boxGeometry args={[16, 96, 16]} />
            <meshStandardMaterial color={theme.wall} roughness={0.7} metalness={0.3} />
          </mesh>
        ))}
        <mesh position={[0, 100, 0]}>
          <boxGeometry args={[18, 14, trackWidth + 82]} />
          <meshStandardMaterial color={theme.wall} roughness={0.6} metalness={0.4} />
        </mesh>
        <mesh position={[0, 92, 0]}>
          <boxGeometry args={[20, 4, trackWidth + 78]} />
          <meshBasicMaterial color={theme.accent} toneMapped={false} />
        </mesh>

        {/* Grandstands flanking the straight */}
        {[-1, 1].map((side) =>
          [0, 1, 2].map((tier) => (
            <mesh
              key={`${side}-${tier}`}
              position={[
                -120 - tier * 4,
                14 + tier * 22,
                side * (outer + 60 + tier * 26),
              ]}
            >
              <boxGeometry args={[520, 22, 46]} />
              <meshStandardMaterial
                color={tier % 2 === 0 ? theme.wall : theme.sceneryColor}
                roughness={0.9}
              />
            </mesh>
          )),
        )}
      </group>

      {/* Marker posts along both barriers */}
      {meshes.posts.map((post, i) => (
        <group key={i} position={[post.x, post.y, post.z]} rotation={[0, -post.angle, 0]}>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[0, WALL_HEIGHT + 16, side * (outer + 6)]}>
              <boxGeometry args={[5, 32, 5]} />
              <meshBasicMaterial color={theme.accent} toneMapped={false} />
            </mesh>
          ))}
        </group>
      ))}

      {quality === 'high' && (
        <Scenery items={meshes.scenery} kind={theme.scenery} color={theme.sceneryColor} />
      )}

      {/* Ground sits below the lowest point of the circuit so an elevated
          track never sinks into it. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, meshes.minHeight - GROUND_DROP, 0]} receiveShadow>
        <planeGeometry args={[60000, 60000]} />
        <meshStandardMaterial color={theme.ground} roughness={1} />
      </mesh>
      <gridHelper
        args={[60000, 200, theme.wall, theme.ground]}
        position={[0, meshes.minHeight - GROUND_DROP + 1, 0]}
      />
    </group>
  );
}

// --- Effects -----------------------------------------------------------------

const DUMMY = new THREE.Object3D();
const HIDDEN = new THREE.Vector3(0, -10000, 0);

/**
 * Drift sparks and skid marks share one InstancedMesh each. The pools are fixed
 * size and recycled, so the whole effects system costs two draw calls and
 * causes zero React re-renders.
 */
function Effects({ race, quality }: { race: RaceState; quality: 'low' | 'high' }) {
  const sparks = useRef<THREE.InstancedMesh>(null);
  const skids = useRef<THREE.InstancedMesh>(null);

  const particleCount = quality === 'high' ? PARTICLE_POOL : Math.floor(PARTICLE_POOL / 3);
  const skidCount = quality === 'high' ? SKID_POOL : Math.floor(SKID_POOL / 3);

  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: particleCount }, () => ({
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        color: new THREE.Color(),
      })),
    [particleCount],
  );
  const skidPool = useMemo<Skid[]>(
    () => Array.from({ length: skidCount }, () => ({ x: 0, y: 0, z: 0, angle: 0, bank: 0, life: 0 })),
    [skidCount],
  );

  const nextParticle = useRef(0);
  const nextSkid = useRef(0);
  const skidTimer = useRef(0);
  const roadColor = useMemo(() => new THREE.Color('#1e293b'), []);
  const markColor = useMemo(() => new THREE.Color('#020617'), []);
  const scratch = useMemo(() => new THREE.Color(), []);

  // Start every instance parked off-screen instead of stacked at the origin.
  useLayoutEffect(() => {
    for (const mesh of [sparks.current, skids.current]) {
      if (!mesh) continue;
      DUMMY.position.copy(HIDDEN);
      DUMMY.scale.set(0.001, 0.001, 0.001);
      DUMMY.rotation.set(0, 0, 0);
      DUMMY.updateMatrix();
      for (let i = 0; i < mesh.count; i++) mesh.setMatrixAt(i, DUMMY.matrix);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }, [particleCount, skidCount]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);

    // Emit from any racer that is sliding.
    skidTimer.current += delta;
    const emitSkid = skidTimer.current > 0.03;
    if (emitSkid) skidTimer.current = 0;

    for (const racer of race.racers) {
      if (!racer.drifting || Math.abs(racer.speed) < racer.config.topSpeed * 0.35) continue;

      const sample = race.geometry.samples[racer.trackIndex];
      const surface = racerHeight(sample, racer.lateral);

      if (emitSkid) {
        const skid = skidPool[nextSkid.current];
        nextSkid.current = (nextSkid.current + 1) % skidPool.length;
        skid.x = racer.x;
        skid.y = surface;
        skid.z = racer.z;
        skid.angle = racer.angle;
        skid.bank = sample.bank;
        skid.life = 1;
      }

      const charge = racer.driftCharge;
      const hex = charge >= 85 ? '#f87171' : charge >= 45 ? '#facc15' : '#cbd5e1';
      const emitCount = quality === 'high' ? 2 : 1;
      for (let i = 0; i < emitCount; i++) {
        const particle = particles[nextParticle.current];
        nextParticle.current = (nextParticle.current + 1) % particles.length;
        particle.x = racer.x + (Math.random() - 0.5) * 26;
        particle.y = surface + 4 + Math.random() * 4;
        particle.z = racer.z + (Math.random() - 0.5) * 26;
        particle.vx = -Math.cos(racer.angle) * racer.speed * 48 + (Math.random() - 0.5) * 60;
        particle.vy = 30 + Math.random() * 70;
        particle.vz = -Math.sin(racer.angle) * racer.speed * 48 + (Math.random() - 0.5) * 60;
        particle.maxLife = 0.3 + Math.random() * 0.25;
        particle.life = particle.maxLife;
        particle.color.set(hex);
      }
    }

    const sparkMesh = sparks.current;
    if (sparkMesh) {
      for (let i = 0; i < particles.length; i++) {
        const particle = particles[i];
        if (particle.life > 0) {
          particle.life -= delta;
          particle.x += particle.vx * delta;
          particle.y += particle.vy * delta;
          particle.z += particle.vz * delta;
          particle.vy -= 180 * delta;
        }
        if (particle.life > 0) {
          const scale = 1.6 * (particle.life / particle.maxLife) + 0.4;
          DUMMY.position.set(particle.x, particle.y, particle.z);
          DUMMY.scale.set(scale, scale, scale);
          sparkMesh.setColorAt(i, particle.color);
        } else {
          DUMMY.position.copy(HIDDEN);
          DUMMY.scale.set(0.001, 0.001, 0.001);
        }
        DUMMY.updateMatrix();
        sparkMesh.setMatrixAt(i, DUMMY.matrix);
      }
      sparkMesh.instanceMatrix.needsUpdate = true;
      if (sparkMesh.instanceColor) sparkMesh.instanceColor.needsUpdate = true;
    }

    const skidMesh = skids.current;
    if (skidMesh) {
      for (let i = 0; i < skidPool.length; i++) {
        const skid = skidPool[i];
        if (skid.life > 0) {
          skid.life -= delta * 0.32;
          DUMMY.position.set(skid.x, skid.y + LAYER.skid * Math.cos(skid.bank), skid.z);
          DUMMY.rotation.set(-Math.PI / 2, 0, -skid.angle);
          DUMMY.scale.set(1, 1, 1);
          // No per-instance opacity without a custom shader, so fade the mark
          // toward the road colour instead.
          scratch.copy(roadColor).lerp(markColor, Math.max(0, Math.min(1, skid.life)));
          skidMesh.setColorAt(i, scratch);
        } else {
          DUMMY.position.copy(HIDDEN);
          DUMMY.rotation.set(0, 0, 0);
          DUMMY.scale.set(0.001, 0.001, 0.001);
        }
        DUMMY.updateMatrix();
        skidMesh.setMatrixAt(i, DUMMY.matrix);
      }
      skidMesh.instanceMatrix.needsUpdate = true;
      if (skidMesh.instanceColor) skidMesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <>
      <instancedMesh ref={sparks} args={[undefined, undefined, particleCount]} frustumCulled={false}>
        <sphereGeometry args={[1.6, 6, 5]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={skids} args={[undefined, undefined, skidCount]} frustumCulled={false}>
        <planeGeometry args={[26, 12]} />
        <meshBasicMaterial />
      </instancedMesh>
    </>
  );
}

/** Self-contained star field — replaces drei's Stars so nothing is fetched at runtime. */
function Starfield({ count }: { count: number }) {
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Rejection-free spherical shell distribution.
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      // Must stay inside the camera far plane (14000) once the track extent is added.
      const radius = 6800 + Math.random() * 2400;
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = Math.abs(radius * Math.cos(phi)) * 0.7 + 500;
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [count]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <points geometry={geometry} frustumCulled={false}>
      <pointsMaterial size={26} color="#cbd5e1" sizeAttenuation transparent opacity={0.85} fog={false} />
    </points>
  );
}

// --- Simulation driver -------------------------------------------------------

function Simulation({ race, input, cameraMode, paused, onFrame }: Omit<SceneProps, 'quality'>) {
  const { camera } = useThree();
  const smoothed = useRef(new THREE.Vector3());
  const lookTarget = useRef(new THREE.Vector3());
  const initialised = useRef(false);

  useFrame((_, rawDelta) => {
    // Clamp so an alt-tab pause can't teleport pods through walls.
    const delta = Math.min(rawDelta, 1 / 20);
    const controls = paused ? NEUTRAL_CONTROLS : input.read();
    const events = paused ? [] : stepRace(race, delta, controls);
    onFrame(race, events);

    const player = race.player;
    const speedRatio = Math.min(1, Math.abs(player.speed) / player.config.topSpeed);

    // Everything below is offset by the height of the road under the pod, so
    // the camera climbs and drops with an elevated circuit.
    const samples = race.geometry.samples;
    const surface = racerHeight(samples[player.trackIndex], player.lateral);
    // Look-ahead height keeps a crest from hiding the road beyond it.
    const aheadSample = samples[(player.trackIndex + 24) % samples.length];

    let desired: THREE.Vector3;
    let target: THREE.Vector3;

    if (cameraMode === 'TOPDOWN') {
      desired = new THREE.Vector3(player.x, surface + 900, player.z + 260);
      target = new THREE.Vector3(player.x, surface, player.z);
    } else if (cameraMode === 'COCKPIT') {
      desired = new THREE.Vector3(
        player.x - Math.cos(player.angle) * 6,
        surface + 14,
        player.z - Math.sin(player.angle) * 6,
      );
      target = new THREE.Vector3(
        player.x + Math.cos(player.angle) * 400,
        aheadSample.y + 14,
        player.z + Math.sin(player.angle) * 400,
      );
    } else {
      // Chase cam pulls back and drops as speed rises.
      const distance = 150 + speedRatio * 60;
      const height = 62 + speedRatio * 14;
      desired = new THREE.Vector3(
        player.x - Math.cos(player.angle) * distance,
        surface + height,
        player.z - Math.sin(player.angle) * distance,
      );
      target = new THREE.Vector3(
        player.x + Math.cos(player.angle) * 220,
        aheadSample.y + 18,
        player.z + Math.sin(player.angle) * 220,
      );
    }

    if (!initialised.current) {
      smoothed.current.copy(desired);
      lookTarget.current.copy(target);
      initialised.current = true;
    }

    // Frame-rate independent smoothing.
    const follow = 1 - Math.pow(0.0001, delta);
    smoothed.current.lerp(desired, cameraMode === 'COCKPIT' ? 1 : follow);
    lookTarget.current.lerp(target, follow);

    camera.position.copy(smoothed.current);
    camera.lookAt(lookTarget.current);

    const perspective = camera as THREE.PerspectiveCamera;
    if (perspective.isPerspectiveCamera) {
      const targetFov = cameraMode === 'TOPDOWN' ? 50 : 62 + speedRatio * 14;
      perspective.fov += (targetFov - perspective.fov) * Math.min(1, delta * 4);
      perspective.updateProjectionMatrix();
    }
  });

  return null;
}

// --- Canvas ------------------------------------------------------------------

export function RaceScene({
  race,
  input,
  cameraMode,
  quality,
  paused,
  onFrame,
}: SceneProps) {
  const theme = race.geometry.data.theme;
  const stars = quality === 'high' ? theme.starCount : Math.round(theme.starCount * 0.35);

  return (
    <Canvas
      shadows={quality === 'high'}
      dpr={[1, maxPixelRatio(quality)]}
      gl={{
        antialias: quality === 'high',
        // 'high-performance' can fail outright on some mobile drivers, and on
        // a phone the discrete-GPU hint buys nothing anyway.
        powerPreference: quality === 'high' ? 'high-performance' : 'default',
        // Cheaper on tile-based mobile GPUs; nothing here reads back the buffer.
        depth: true,
        stencil: false,
      }}
      // near/far was 1/30000. That 30000:1 ratio is fine on a 24-bit depth
      // buffer but shreds precision on the 16-bit buffers common in mobile
      // GPUs, and the road, curbs and start line are stacked barely a unit
      // apart. Tightening the range keeps them from z-fighting.
      camera={{ position: [0, 400, 400], fov: 62, near: 6, far: 14000 }}
    >
      <color attach="background" args={[theme.sky]} />
      <fog attach="fog" args={[theme.sky, theme.fogNear, theme.fogFar]} />

      <ambientLight intensity={0.34} />
      <hemisphereLight intensity={0.55} color={theme.light} groundColor={theme.ground} />
      <directionalLight
        position={[600, 900, 300]}
        intensity={1.35}
        color={theme.light}
        castShadow={quality === 'high'}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-1500}
        shadow-camera-right={1500}
        shadow-camera-top={1500}
        shadow-camera-bottom={-1500}
        shadow-camera-far={4000}
      />
      {/* Low fill in the circuit's accent colour, so the neon rails bleed into
          the scene instead of floating on top of it. */}
      <pointLight position={[0, 500, 0]} intensity={0.7} color={theme.accent} distance={9000} />

      <TrackVisuals race={race} quality={quality} />
      {race.racers.map((racer) => (
        <Pod key={racer.id} racer={racer} race={race} />
      ))}
      <Effects race={race} quality={quality} />
      <Starfield count={stars} />

      <Simulation
        race={race}
        input={input}
        cameraMode={cameraMode}
        paused={paused}
        onFrame={onFrame}
      />
    </Canvas>
  );
}
