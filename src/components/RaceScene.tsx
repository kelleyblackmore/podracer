import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { CameraMode } from '../types';
import type { RaceEvent, RaceState, Racer } from '../game/engine';
import { NEUTRAL_CONTROLS, stepRace } from '../game/engine';
import { buildTrackMeshes, disposeTrackMeshes, LAYER, WALL_HEIGHT } from '../game/trackMesh';
import type { InputManager } from '../game/input';

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
  z: number;
  angle: number;
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
function Pod({ racer }: { racer: Racer }) {
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

    node.position.set(racer.x, 6 + vibe, racer.z);
    node.rotation.y = -racer.angle;

    // Bank into the slide: the angle between where we point and where we go.
    const heading = Math.atan2(racer.vz, racer.vx);
    let slip = heading - racer.angle;
    while (slip > Math.PI) slip -= Math.PI * 2;
    while (slip < -Math.PI) slip += Math.PI * 2;
    node.rotation.z = THREE.MathUtils.lerp(node.rotation.z, slip * 0.5, Math.min(1, delta * 8));
    node.rotation.x = vibe * 0.02;

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

function TrackVisuals({ race }: { race: RaceState }) {
  const meshes = useMemo(() => buildTrackMeshes(race.geometry), [race.geometry]);
  useEffect(() => () => disposeTrackMeshes(meshes), [meshes]);

  const accent = race.geometry.data.color;
  const trackWidth = race.geometry.data.width;

  return (
    <group>
      <mesh geometry={meshes.road} receiveShadow>
        <meshStandardMaterial color="#1e293b" roughness={0.85} metalness={0.1} />
      </mesh>
      <mesh geometry={meshes.runoffLeft} receiveShadow>
        <meshStandardMaterial color="#422006" roughness={1} />
      </mesh>
      <mesh geometry={meshes.runoffRight} receiveShadow>
        <meshStandardMaterial color="#422006" roughness={1} />
      </mesh>
      <mesh geometry={meshes.edgeLeft}>
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
      <mesh geometry={meshes.edgeRight}>
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
      <mesh geometry={meshes.wallLeft}>
        <meshStandardMaterial color="#334155" side={THREE.DoubleSide} roughness={0.8} />
      </mesh>
      <mesh geometry={meshes.wallRight}>
        <meshStandardMaterial color="#334155" side={THREE.DoubleSide} roughness={0.8} />
      </mesh>

      {/* Start / finish gate */}
      <group
        position={[meshes.startLine.x, 0, meshes.startLine.z]}
        rotation={[0, -meshes.startLine.angle, 0]}
      >
        <mesh position={[0, LAYER.startLine, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[18, trackWidth]} />
          <meshBasicMaterial color="#f8fafc" transparent opacity={0.75} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[0, 45, side * (trackWidth / 2 + 30)]}>
            <boxGeometry args={[14, 90, 14]} />
            <meshStandardMaterial color="#334155" />
          </mesh>
        ))}
        <mesh position={[0, 92, 0]}>
          <boxGeometry args={[16, 8, trackWidth + 74]} />
          <meshBasicMaterial color={accent} toneMapped={false} />
        </mesh>
      </group>

      {/* Marker posts along both barriers */}
      {meshes.posts.map((post, i) => (
        <group key={i} position={[post.x, 0, post.z]} rotation={[0, -post.angle, 0]}>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[0, WALL_HEIGHT + 14, side * (trackWidth / 2 + 55)]}>
              <boxGeometry args={[4, 28, 4]} />
              <meshBasicMaterial color={accent} toneMapped={false} />
            </mesh>
          ))}
        </group>
      ))}
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
    () => Array.from({ length: skidCount }, () => ({ x: 0, z: 0, angle: 0, life: 0 })),
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

      if (emitSkid) {
        const skid = skidPool[nextSkid.current];
        nextSkid.current = (nextSkid.current + 1) % skidPool.length;
        skid.x = racer.x;
        skid.z = racer.z;
        skid.angle = racer.angle;
        skid.life = 1;
      }

      const charge = racer.driftCharge;
      const hex = charge >= 85 ? '#f87171' : charge >= 45 ? '#facc15' : '#cbd5e1';
      const emitCount = quality === 'high' ? 2 : 1;
      for (let i = 0; i < emitCount; i++) {
        const particle = particles[nextParticle.current];
        nextParticle.current = (nextParticle.current + 1) % particles.length;
        particle.x = racer.x + (Math.random() - 0.5) * 26;
        particle.y = 4 + Math.random() * 4;
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
          DUMMY.position.set(skid.x, LAYER.skid, skid.z);
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
      const radius = 9000 + Math.random() * 3000;
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

    let desired: THREE.Vector3;
    let target: THREE.Vector3;

    if (cameraMode === 'TOPDOWN') {
      desired = new THREE.Vector3(player.x, 900, player.z + 260);
      target = new THREE.Vector3(player.x, 0, player.z);
    } else if (cameraMode === 'COCKPIT') {
      desired = new THREE.Vector3(
        player.x - Math.cos(player.angle) * 6,
        20,
        player.z - Math.sin(player.angle) * 6,
      );
      target = new THREE.Vector3(
        player.x + Math.cos(player.angle) * 400,
        14,
        player.z + Math.sin(player.angle) * 400,
      );
    } else {
      // Chase cam pulls back and drops as speed rises.
      const distance = 150 + speedRatio * 60;
      const height = 62 + speedRatio * 14;
      desired = new THREE.Vector3(
        player.x - Math.cos(player.angle) * distance,
        height,
        player.z - Math.sin(player.angle) * distance,
      );
      target = new THREE.Vector3(
        player.x + Math.cos(player.angle) * 220,
        18,
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

export function RaceScene({ race, input, cameraMode, quality, paused, onFrame }: SceneProps) {
  const accent = race.geometry.data.color;

  return (
    <Canvas
      shadows={quality === 'high'}
      dpr={quality === 'high' ? [1, 1.75] : 1}
      gl={{ antialias: quality === 'high', powerPreference: 'high-performance' }}
      camera={{ position: [0, 400, 400], fov: 62, near: 1, far: 20000 }}
    >
      <color attach="background" args={['#050914']} />
      <fog attach="fog" args={['#050914', 900, 6000]} />

      <ambientLight intensity={0.35} />
      <hemisphereLight intensity={0.5} color="#93c5fd" groundColor="#1c1917" />
      <directionalLight
        position={[600, 900, 300]}
        intensity={1.4}
        castShadow={quality === 'high'}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-1500}
        shadow-camera-right={1500}
        shadow-camera-top={1500}
        shadow-camera-bottom={-1500}
        shadow-camera-far={4000}
      />
      <pointLight position={[0, 400, 0]} intensity={0.6} color={accent} distance={6000} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -8, 0]} receiveShadow>
        <planeGeometry args={[40000, 40000]} />
        <meshStandardMaterial color="#0b1220" roughness={1} />
      </mesh>
      <gridHelper args={[40000, 160, '#1e293b', '#131c2e']} position={[0, -7, 0]} />

      <TrackVisuals race={race} />
      {race.racers.map((racer) => (
        <Pod key={racer.id} racer={racer} />
      ))}
      <Effects race={race} quality={quality} />
      <Starfield count={quality === 'high' ? 1400 : 500} />

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
