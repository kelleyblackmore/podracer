import React, { useRef, useEffect, useState, useMemo, Suspense } from 'react';
import { TrackData, CarConfig, GameSessionStats, LapTelemetry } from '../types';
import { Zap, Map as MapIcon, RotateCcw, Bot, Eye } from 'lucide-react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Stars, Environment, PerspectiveCamera, Float } from '@react-three/drei';
import * as THREE from 'three';

// -----------------------------------------------------------------------------
// TYPES & INTERFACES
// -----------------------------------------------------------------------------

interface GameCanvasProps {
  track: TrackData;
  carConfig: CarConfig;
  onRaceEnd: (stats: GameSessionStats) => void;
  onExit: () => void;
}

type AIDifficulty = 'OFF' | 'EASY' | 'MEDIUM' | 'HARD';
type CameraMode = 'CINEMATIC' | 'COCKPIT';

interface ParticleData {
  id: number;
  x: number;
  y: number;
  z: number; // 3D z is height usually, but here Y is height
  vx: number;
  vy: number;
  vz: number;
  life: number;
  color: string;
}

interface SkidMarkData {
  id: number;
  x: number;
  z: number; // Game Y maps to World Z
  opacity: number;
  angle: number;
}

// -----------------------------------------------------------------------------
// 3D ASSETS & COMPONENTS
// -----------------------------------------------------------------------------

const TrackVisuals = ({ track }: { track: TrackData }) => {
  const curve = useMemo(() => {
    const points = track.points.map(p => new THREE.Vector3(p.x, 0, p.y));
    return new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.5);
  }, [track]);

  const { roadGeo, borderGeo } = useMemo(() => {
    // Road Shape
    const roadShape = new THREE.Shape();
    const w = track.width / 2;
    roadShape.moveTo(-w, 0);
    roadShape.lineTo(w, 0);
    roadShape.lineTo(w + 2, 4); // Sloped Curb
    roadShape.lineTo(-w - 2, 4);
    
    // Border Shape (Thin rails)
    const borderShape = new THREE.Shape();
    borderShape.moveTo(-w - 2, 4);
    borderShape.absarc(-w - 4, 6, 2, 0, Math.PI * 2, false);
    
    // We need two borders. easier to do visually with a separate extrusion or just line rendering.
    // Let's create a specialized geometry for the road including curbs.
    
    const extrudeSettings = {
      steps: track.points.length * 8, // Higher resolution
      bevelEnabled: false,
      extrudePath: curve
    };
    
    const rGeo = new THREE.ExtrudeGeometry(roadShape, extrudeSettings);
    
    // Create borders by extruding small shapes at offset? 
    // Hard to offset cleanly without complex math. 
    // Easier: Generate points for TubeGeometry? No, Tube is center-line.
    // Let's just use the Road Geometry and use vertex colors or a texture?
    // We'll stick to geometry.
    
    return { roadGeo: rGeo, borderGeo: null };
  }, [track, curve]);

  // Generate scenery points
  const scenery = useMemo(() => {
    const items = [];
    const count = 50;
    for(let i=0; i<count; i++) {
        const t = (i / count);
        const pt = curve.getPointAt(t);
        const tangent = curve.getTangentAt(t).normalize();
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
        
        // Towers
        if (i % 5 === 0) {
            const offset = track.width/2 + 60;
            items.push({ 
                pos: pt.clone().add(normal.clone().multiplyScalar(offset)), 
                type: 'TOWER',
                rot: Math.atan2(normal.x, normal.z)
            });
             items.push({ 
                pos: pt.clone().add(normal.clone().multiplyScalar(-offset)), 
                type: 'TOWER',
                rot: Math.atan2(-normal.x, -normal.z)
            });
        }
        
        // Light Beacons
        const beaconOffset = track.width/2 + 10;
        items.push({
             pos: pt.clone().add(normal.clone().multiplyScalar(beaconOffset)),
             type: 'BEACON',
             color: track.color
        });
        items.push({
             pos: pt.clone().add(normal.clone().multiplyScalar(-beaconOffset)),
             type: 'BEACON',
             color: track.color
        });
    }
    return items;
  }, [track, curve]);

  return (
    <group>
      {/* Main Road Surface */}
      <mesh geometry={roadGeo} position={[0, -2, 0]} receiveShadow>
        <meshStandardMaterial color="#1e293b" roughness={0.7} metalness={0.2} />
      </mesh>
      
      {/* Fake Glowing Edges (Using slightly wider/higher geometry or just simple lines if possible) */}
      {/* Since we can't easily offset geometry in R3F without heavy lifting, we'll use the scenery to define edges */}

      {/* Start Line Gate */}
      <group position={[track.points[0].x, 0, track.points[0].y]} rotation={[0, -Math.atan2(track.points[1].y - track.points[0].y, track.points[1].x - track.points[0].x), 0]}>
         {/* Overhead Structure */}
         <mesh position={[0, 40, 0]}>
             <boxGeometry args={[10, 80, track.width + 40]} />
             <meshStandardMaterial color="#334155" />
         </mesh>
         <mesh position={[0, 60, 0]}>
             <boxGeometry args={[12, 5, track.width + 30]} />
             <meshBasicMaterial color="#ffffff" toneMapped={false} />
         </mesh>
         {/* Start Line Decal */}
         <mesh position={[0, 0.5, 0]} rotation={[-Math.PI/2, 0, 0]}>
            <planeGeometry args={[20, track.width]} />
            <meshBasicMaterial color="white" transparent opacity={0.6} />
         </mesh>
      </group>

      {/* Scenery Items */}
      {scenery.map((item, i) => (
          <group key={i} position={item.pos}>
              {item.type === 'TOWER' ? (
                  <group rotation={[0, item.rot || 0, 0]}>
                      <mesh position={[0, 50, 0]}>
                          <boxGeometry args={[20, 100, 20]} />
                          <meshStandardMaterial color="#334155" />
                      </mesh>
                      <mesh position={[0, 90, 0]}>
                          <boxGeometry args={[15, 40, 15]} />
                          <meshStandardMaterial color="#475569" />
                      </mesh>
                      {/* Floating Light */}
                      <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
                        <mesh position={[0, 120, 0]}>
                            <octahedronGeometry args={[8]} />
                            <meshBasicMaterial color={track.color} wireframe />
                        </mesh>
                      </Float>
                  </group>
              ) : (
                  // Beacon
                  <mesh position={[0, 5, 0]}>
                      <cylinderGeometry args={[2, 2, 10, 8]} />
                      <meshBasicMaterial color={item.color} transparent opacity={0.6} />
                  </mesh>
              )}
          </group>
      ))}
    </group>
  );
};

const CarModel = ({ config, angle, boost, drift }: { config: CarConfig, angle: number, boost: number, drift: boolean }) => {
    // Pod Racer 3D Model Construction
    const boostColor = boost > 0 ? new THREE.Color('#a855f7') : drift ? new THREE.Color('#ef4444') : new THREE.Color('#60a5fa');
    
    return (
        <group rotation={[0, -angle, 0]}> 
           {/* Cockpit - Behind */}
           <group position={[-35, 8, 0]}>
              <mesh castShadow receiveShadow>
                 <boxGeometry args={[25, 12, 16]} />
                 <meshStandardMaterial color="#e2e8f0" metalness={0.5} roughness={0.2} />
              </mesh>
              <mesh position={[5, 4, 0]}>
                 <sphereGeometry args={[5]} />
                 <meshStandardMaterial color={config.color} metalness={0.8} roughness={0.1} />
              </mesh>
           </group>

           {/* Cables */}
           <group>
               <mesh position={[-10, 8, 10]} rotation={[0, 0, -0.2]}>
                   <cylinderGeometry args={[0.5, 0.5, 30]} />
                   <meshStandardMaterial color="#64748b" />
               </mesh>
               <mesh position={[-10, 8, -10]} rotation={[0, 0, -0.2]}>
                   <cylinderGeometry args={[0.5, 0.5, 30]} />
                   <meshStandardMaterial color="#64748b" />
               </mesh>
           </group>

           {/* Left Engine */}
           <group position={[15, 8, -16]}>
               <mesh rotation={[0, 0, Math.PI/2]} castShadow receiveShadow>
                   <cylinderGeometry args={[6, 6, 32]} />
                   <meshStandardMaterial color={config.color} metalness={0.6} roughness={0.3} />
               </mesh>
               <mesh position={[16, 0, 0]} rotation={[0, 0, Math.PI/2]}>
                   <cylinderGeometry args={[4, 5, 2]} />
                   <meshStandardMaterial color="#111" />
               </mesh>
               {/* Engine Flame */}
               {(boost > 0 || Math.random() > 0.1) && (
                   <mesh position={[-20 - (boost * 5), 0, 0]} rotation={[0, 0, Math.PI/2]}>
                       <coneGeometry args={[4 + (boost ? 2:0), 30 + (boost ? 20:0), 8]} />
                       <meshBasicMaterial color={boostColor} transparent opacity={0.8} />
                   </mesh>
               )}
           </group>

           {/* Right Engine */}
           <group position={[15, 8, 16]}>
               <mesh rotation={[0, 0, Math.PI/2]} castShadow receiveShadow>
                   <cylinderGeometry args={[6, 6, 32]} />
                   <meshStandardMaterial color={config.color} metalness={0.6} roughness={0.3} />
               </mesh>
               <mesh position={[16, 0, 0]} rotation={[0, 0, Math.PI/2]}>
                   <cylinderGeometry args={[4, 5, 2]} />
                   <meshStandardMaterial color="#111" />
               </mesh>
               {/* Engine Flame */}
               {(boost > 0 || Math.random() > 0.1) && (
                   <mesh position={[-20 - (boost * 5), 0, 0]} rotation={[0, 0, Math.PI/2]}>
                       <coneGeometry args={[4 + (boost ? 2:0), 30 + (boost ? 20:0), 8]} />
                       <meshBasicMaterial color={boostColor} transparent opacity={0.8} />
                   </mesh>
               )}
           </group>

           {/* Energy Binder */}
           <mesh position={[15, 8, 0]}>
               <boxGeometry args={[2, 2, 28]} />
               <meshBasicMaterial color="#d8b4fe" wireframe transparent opacity={0.4} />
           </mesh>
           
           {/* Fake Glow Point Light */}
           <pointLight position={[15, 8, 0]} color={config.color} intensity={2} distance={50} decay={2} />
        </group>
    )
}

const Particles = ({ particles }: { particles: ParticleData[] }) => {
    return (
        <group>
            {particles.map(p => (
                <mesh key={p.id} position={[p.x, p.y, p.z]}>
                    <sphereGeometry args={[1.5]} />
                    <meshBasicMaterial color={p.color} transparent opacity={p.life} toneMapped={false} />
                </mesh>
            ))}
        </group>
    )
}

const SkidMarks = ({ marks }: { marks: SkidMarkData[] }) => {
    return (
        <group>
            {marks.map(m => (
                <mesh key={m.id} position={[m.x, 0.5, m.z]} rotation={[-Math.PI/2, 0, m.angle]}>
                    <planeGeometry args={[8, 12]} />
                    <meshBasicMaterial color="#000" transparent opacity={m.opacity * 0.4} />
                </mesh>
            ))}
        </group>
    )
}

// -----------------------------------------------------------------------------
// GAME LOGIC WRAPPER
// -----------------------------------------------------------------------------

export const GameCanvas: React.FC<GameCanvasProps> = ({ track, carConfig, onRaceEnd, onExit }) => {
  // --- HUD STATE ---
  const [hudState, setHudState] = useState({
    speed: 0,
    currentLap: 1,
    lastLapTime: 0,
    currentLapTime: 0,
    boost: 0,
  });

  const [aiMode, setAiMode] = useState<AIDifficulty>('OFF');
  const aiModeRef = useRef<AIDifficulty>('OFF');
  const [cameraMode, setCameraMode] = useState<CameraMode>('CINEMATIC');
  const cameraModeRef = useRef<CameraMode>('CINEMATIC');

  // --- GAME REF STATE ---
  const gameState = useRef({
    car: {
      x: track.points[0].x,
      z: track.points[0].y, // Map 2D Y to 3D Z
      angle: 0, 
      velocity: { x: 0, z: 0 },
      speed: 0,
      drifting: false,
      driftCharge: 0,
      boostTimer: 0,
    },
    keys: {
      ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, Shift: false,
    },
    particles: [] as ParticleData[],
    skidMarks: [] as SkidMarkData[],
    laps: 0,
    lapStartTime: Date.now(),
    checkpoints: [false, false, false, false],
    telemetry: [] as LapTelemetry[],
    currentTelemetry: { maxSpeed: 0, collisions: 0, offTrackFrames: 0 },
    particleIdCounter: 0,
  });

  // Key Listeners
  useEffect(() => {
    // Initialize car pos
    const startP = track.points[0];
    const nextP = track.points[1] || { x: startP.x + 10, y: startP.y };
    gameState.current.car.x = startP.x;
    gameState.current.car.z = startP.y;
    // Orient
    const dx = nextP.x - startP.x;
    const dy = nextP.y - startP.y;
    gameState.current.car.angle = Math.atan2(dy, dx); 

    const handleKeyDown = (e: KeyboardEvent) => {
        if (gameState.current.keys.hasOwnProperty(e.code)) (gameState.current.keys as any)[e.code] = true;
        if (e.key === 'Shift') gameState.current.keys.Shift = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
        if (gameState.current.keys.hasOwnProperty(e.code)) (gameState.current.keys as any)[e.code] = false;
        if (e.key === 'Shift') gameState.current.keys.Shift = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, [track]);

  // --- PHYSICS ENGINE ---
  const runGameLoop = (dt: number) => {
    const state = gameState.current;
    const { car, keys } = state;

    // 0. Find Closest Point
    let minDistance = Infinity;
    let closestPointIndex = -1;

    for (let i = 0; i < track.points.length; i++) {
      const p = track.points[i];
      // 2D distance check (x, z vs p.x, p.y)
      const dist = Math.sqrt((car.x - p.x) ** 2 + (car.z - p.y) ** 2);
      if (dist < minDistance) {
        minDistance = dist;
        closestPointIndex = i;
      }
    }

    // AI Logic
    if (aiModeRef.current !== 'OFF' && closestPointIndex !== -1) {
        let lookAhead = 15;
        if (aiModeRef.current === 'HARD') lookAhead = 35;
        
        const targetIdx = (closestPointIndex + lookAhead) % track.points.length;
        const targetP = track.points[targetIdx];
        const dx = targetP.x - car.x;
        const dz = targetP.y - car.z; // Track Y is World Z
        const targetAngle = Math.atan2(dz, dx);
        
        let headingError = targetAngle - car.angle;
        while (headingError <= -Math.PI) headingError += Math.PI * 2;
        while (headingError > Math.PI) headingError -= Math.PI * 2;

        keys.ArrowLeft = false; keys.ArrowRight = false; keys.ArrowUp = false; keys.ArrowDown = false; keys.Shift = false;

        if (headingError > 0.05) keys.ArrowRight = true;
        else if (headingError < -0.05) keys.ArrowLeft = true;

        const turnSeverity = Math.abs(headingError);
        const maxSpeed = carConfig.topSpeed * (aiModeRef.current === 'HARD' ? 1.05 : 0.8);
        const desiredSpeed = maxSpeed / (1 + turnSeverity * 5);
        
        if (Math.abs(car.speed) < desiredSpeed) keys.ArrowUp = true;
        else keys.ArrowDown = true;

        if (aiModeRef.current === 'HARD' && turnSeverity > 0.5 && Math.abs(car.speed) > 20) keys.Shift = true;
    }

    // Drift & Boost Logic
    const isTurning = keys.ArrowLeft || keys.ArrowRight;
    const canDrift = Math.abs(car.speed) > 10;
    
    if (keys.Shift && canDrift && (isTurning || car.drifting)) {
        car.drifting = true;
        if (car.driftCharge < 100) car.driftCharge += dt * 30;
    } else {
        if (car.drifting && car.driftCharge > 30) {
            car.boostTimer = car.driftCharge > 80 ? 2.0 : 1.0;
        }
        car.drifting = false;
        car.driftCharge = 0;
    }

    // Physics
    let currentTopSpeed = carConfig.topSpeed;
    let acceleration = carConfig.acceleration;
    if (car.boostTimer > 0) {
        car.boostTimer -= dt;
        currentTopSpeed *= 1.5; 
        acceleration *= 2.0;    
    }

    if (keys.ArrowUp) car.speed += acceleration * dt * 60;
    else if (keys.ArrowDown) car.speed -= acceleration * 1.5 * dt * 60;
    else car.speed *= car.drifting ? 0.99 : 0.98;

    car.speed = Math.max(Math.min(car.speed, currentTopSpeed), -currentTopSpeed / 3);

    let turnRate = (0.04 * (Math.abs(car.speed) / carConfig.topSpeed) + 0.02);
    if (car.drifting) turnRate *= 1.4;

    if (Math.abs(car.speed) > 0.1) {
      if (keys.ArrowLeft) car.angle -= turnRate * dt * 60;
      if (keys.ArrowRight) car.angle += turnRate * dt * 60;
    }

    const headingX = Math.cos(car.angle);
    const headingZ = Math.sin(car.angle);

    let grip = carConfig.handling;
    if (car.drifting) grip = 0.92;

    const targetVX = headingX * car.speed;
    const targetVZ = headingZ * car.speed;

    car.velocity.x = car.velocity.x * grip + targetVX * (1 - grip);
    car.velocity.z = car.velocity.z * grip + targetVZ * (1 - grip);

    car.x += car.velocity.x * dt * 60;
    car.z += car.velocity.z * dt * 60;

    // Off-track
    const isOffTrack = minDistance > track.width / 2;
    if (isOffTrack) {
        car.drifting = false;
        car.driftCharge = 0;
        car.speed *= 0.92;
        car.velocity.x *= 0.92;
        car.velocity.z *= 0.92;
        state.currentTelemetry.offTrackFrames++;
    }

    // Particles
    for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        p.x += p.vx; p.y += p.vy; p.z += p.vz;
        p.life -= dt;
        if (p.life <= 0) state.particles.splice(i, 1);
    }
    // Update Skidmarks
    for (let i = state.skidMarks.length - 1; i >= 0; i--) {
        state.skidMarks[i].opacity -= dt * 0.5;
        if (state.skidMarks[i].opacity <= 0) state.skidMarks.splice(i, 1);
    }
    // Spawn
    if (car.drifting && Math.abs(car.speed) > 15) {
        if (Math.random() > 0.5) {
             state.skidMarks.push({ id: state.particleIdCounter++, x: car.x, z: car.z, opacity: 0.8, angle: car.angle });
        }
        const sparkColor = car.driftCharge > 80 ? '#ef4444' : car.driftCharge > 30 ? '#eab308' : '#cbd5e1';
        for(let i=0; i<2; i++) {
            state.particles.push({
                id: state.particleIdCounter++,
                x: car.x + (Math.random()-0.5)*20,
                y: 5, // Height
                z: car.z + (Math.random()-0.5)*20,
                vx: -headingX * car.speed * 0.2, vy: Math.random() * 2, vz: -headingZ * car.speed * 0.2,
                life: 0.3 + Math.random()*0.2,
                color: sparkColor
            });
        }
    }

    // Laps
    const totalPoints = track.points.length;
    const checkpointZone = Math.floor(totalPoints / 4);
    const currentSection = Math.floor(closestPointIndex / checkpointZone);
    if (currentSection >= 0 && currentSection < 4) state.checkpoints[currentSection] = true;

    if (closestPointIndex < 10 && state.checkpoints[2] && state.checkpoints[3]) {
        const lapTime = (Date.now() - state.lapStartTime) / 1000;
        state.telemetry.push({
            lapNumber: state.laps + 1,
            time: lapTime,
            maxSpeed: Math.round(state.currentTelemetry.maxSpeed * 10),
            averageSpeed: 0,
            collisions: Math.floor(state.currentTelemetry.collisions / 10),
            offTrackCount: Math.floor(state.currentTelemetry.offTrackFrames / 60),
        });
        state.currentTelemetry = { maxSpeed: 0, collisions: 0, offTrackFrames: 0 };
        state.checkpoints.fill(false);
        state.laps++;
        state.lapStartTime = Date.now();
        setHudState(prev => ({ ...prev, lastLapTime: lapTime, currentLap: state.laps + 1 }));
    }

    const currentMph = Math.abs(car.speed) * 10;
    if (currentMph > state.currentTelemetry.maxSpeed) state.currentTelemetry.maxSpeed = currentMph;

    return { currentMph };
  };

  // --- R3F SCENE COMPONENT ---
  const SceneContent = () => {
     const { camera } = useThree();
     
     // Refs for binding meshes to physics state
     const carGroupRef = useRef<THREE.Group>(null);
     const [particles, setParticles] = useState<ParticleData[]>([]);
     const [skidMarks, setSkidMarks] = useState<SkidMarkData[]>([]);
     const lastHudUpdate = useRef(0);

     // Frame Loop
     useFrame((state, delta) => {
        const { currentMph } = runGameLoop(Math.min(delta, 0.1));
        
        setParticles([...gameState.current.particles]);
        setSkidMarks([...gameState.current.skidMarks]);

        const car = gameState.current.car;
        if (carGroupRef.current) {
            carGroupRef.current.position.set(car.x, 0, car.z);
            carGroupRef.current.rotation.y = -car.angle;
            
            const driftRoll = car.drifting ? (gameState.current.keys.ArrowLeft ? -0.2 : 0.2) : 0;
            // Add subtle engine vibration
            const vibe = Math.random() * 0.5 * (Math.abs(car.speed) / carConfig.topSpeed);
            carGroupRef.current.position.y = vibe;
            carGroupRef.current.rotation.x = driftRoll + (vibe * 0.05);
            carGroupRef.current.rotation.z = (vibe * 0.05);
        }

        // Update Camera
        if (cameraModeRef.current === 'CINEMATIC') {
            const targetPos = new THREE.Vector3(car.x, 800, car.z + 500);
            camera.position.lerp(targetPos, 0.05);
            camera.lookAt(car.x, 0, car.z);
        } else {
            // Cockpit/Chase Cam
            const offsetDist = 120;
            const height = 40;
            const cx = car.x - Math.cos(car.angle) * offsetDist;
            const cz = car.z - Math.sin(car.angle) * offsetDist;
            
            // Smoother lerp
            camera.position.lerp(new THREE.Vector3(cx, height, cz), 0.1);
            
            const lookTarget = new THREE.Vector3(
                car.x + Math.cos(car.angle) * 200, 
                0, 
                car.z + Math.sin(car.angle) * 200
            );
            camera.lookAt(lookTarget);
        }

        // HUD Update (Throttled ~20FPS)
        if (state.clock.elapsedTime - lastHudUpdate.current > 0.05) {
            lastHudUpdate.current = state.clock.elapsedTime;
            setHudState(prev => ({
                ...prev,
                speed: Math.round(currentMph),
                currentLapTime: (Date.now() - gameState.current.lapStartTime) / 1000,
                boost: Math.min(gameState.current.car.driftCharge, 100)
            }));
        }
     });

     return (
         <>
            <ambientLight intensity={0.2} />
            <directionalLight position={[100, 200, 50]} intensity={1.5} castShadow shadow-mapSize={[2048, 2048]} />
            <hemisphereLight intensity={0.3} color="#ffffff" groundColor="#0f172a" />
            
            {/* Fog for depth */}
            <fog attach="fog" args={['#0f172a', 500, 4000]} />

            <TrackVisuals track={track} />
            
            {/* Ground Plane */}
            <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, -5, 0]} receiveShadow>
                <planeGeometry args={[20000, 20000]} />
                <meshStandardMaterial color="#0f172a" roughness={0.9} />
                <gridHelper args={[20000, 200, 0x334155, 0x1e293b]} rotation={[-Math.PI/2, 0, 0]} />
            </mesh>
            
            <group ref={carGroupRef}>
                <CarModel 
                    config={carConfig} 
                    angle={0} // Rotation handled by group 
                    boost={gameState.current.car.boostTimer}
                    drift={gameState.current.car.drifting}
                />
            </group>

            <Particles particles={particles} />
            <SkidMarks marks={skidMarks} />
            
            <Stars radius={5000} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
            <Environment preset="night" />
         </>
     );
  };

  // --- HELPERS ---
  const toggleCamera = () => {
    const next = cameraMode === 'CINEMATIC' ? 'COCKPIT' : 'CINEMATIC';
    setCameraMode(next);
    cameraModeRef.current = next;
  };
  
  const cycleAI = () => {
    const modes: AIDifficulty[] = ['OFF', 'EASY', 'MEDIUM', 'HARD'];
    const next = modes[(modes.indexOf(aiMode) + 1) % modes.length];
    setAiMode(next);
    aiModeRef.current = next;
  };

  const finishRace = () => {
      onRaceEnd({
          totalLaps: gameState.current.laps,
          bestLap: gameState.current.telemetry.length > 0 ? Math.min(...gameState.current.telemetry.map(t => t.time)) : null,
          telemetry: gameState.current.telemetry,
          timestamp: new Date().toISOString()
      });
  };

  const getAIButtonColor = () => {
    switch (aiMode) {
      case 'EASY': return 'bg-green-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.6)]';
      case 'MEDIUM': return 'bg-yellow-500 text-white shadow-[0_0_15px_rgba(234,179,8,0.6)]';
      case 'HARD': return 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.6)]';
      default: return 'bg-slate-700/80 text-slate-400 hover:bg-slate-600 hover:text-white';
    }
  };

  return (
    <div className="relative w-full h-screen bg-slate-900 overflow-hidden">
       {/* Added camera prop to initialization to avoid 0,0,0 glitches */}
       <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0, 800, 500], fov: 50 }}>
          <Suspense fallback={null}>
             <SceneContent />
          </Suspense>
       </Canvas>

      {/* HUD Overlay */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none p-8 flex flex-col justify-between">
        
        {/* Top Bar */}
        <div className="flex justify-between items-start">
            <div className="bg-slate-900/80 backdrop-blur border border-slate-700 p-4 rounded-lg text-white transform -skew-x-12">
                <div className="transform skew-x-12 flex items-center gap-4">
                    <div>
                        <div className="text-xs text-slate-400 uppercase tracking-wider font-bold">Current Lap</div>
                        <div className="text-4xl font-display font-bold text-yellow-400">
                             {hudState.currentLapTime.toFixed(2)}<span className="text-lg text-white">s</span>
                        </div>
                    </div>
                    <div className="h-10 w-px bg-slate-600 mx-2"></div>
                     <div>
                        <div className="text-xs text-slate-400 uppercase tracking-wider font-bold">Last Lap</div>
                        <div className="text-2xl font-display text-white">
                             {hudState.lastLapTime > 0 ? hudState.lastLapTime.toFixed(2) : '--.--'}<span className="text-sm text-slate-500">s</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex gap-2 pointer-events-auto">
                 <button onClick={cycleAI} className={`p-3 rounded-full backdrop-blur transition-all flex items-center gap-2 ${getAIButtonColor()}`} title="Toggle AI">
                    <Bot className="w-6 h-6" /> {aiMode !== 'OFF' && <span className="font-bold text-xs uppercase pr-1">{aiMode}</span>}
                </button>
                <button onClick={toggleCamera} className={`p-3 rounded-full backdrop-blur transition-all flex items-center gap-2 ${cameraMode === 'COCKPIT' ? 'bg-indigo-500 text-white' : 'bg-slate-700/80 text-slate-400'}`} title="Camera">
                    <Eye className="w-6 h-6" />
                </button>
                 <button onClick={onExit} className="bg-red-500/80 hover:bg-red-600 text-white p-3 rounded-full backdrop-blur transition-all" title="Abort">
                    <RotateCcw className="w-6 h-6" />
                </button>
            </div>
        </div>

        {/* Bottom Bar */}
        <div className="flex justify-between items-end">
             <div className="bg-slate-900/80 backdrop-blur border border-slate-700 p-4 rounded-lg text-white flex flex-col gap-2 w-48">
                 <div className="flex items-center gap-2 text-slate-400 text-sm font-bold uppercase tracking-wider"><MapIcon className="w-4 h-4" /> {track.name}</div>
                 <div className="flex justify-between items-end">
                     <div><span className="text-4xl font-display font-bold text-white">{hudState.currentLap}</span><span className="text-slate-500 text-lg"> / ∞</span></div>
                     <div className="text-xs text-slate-500">LAP</div>
                 </div>
             </div>

             <div className="relative">
                <div className="absolute bottom-0 right-0 w-64 h-32 bg-gradient-to-t from-slate-900/90 to-transparent pointer-events-none"></div>
                
                {/* Visual Drift/Boost Meter (Always Visible) */}
                <div className="mb-4 flex flex-col items-end gap-1 relative z-10">
                    <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold uppercase tracking-wider ${hudState.boost >= 100 ? 'text-red-500 animate-pulse' : 'text-slate-500'}`}>
                           {hudState.boost >= 100 ? 'OVERCHARGE READY' : 'Drift Charge'}
                        </span>
                        <Zap className={`w-3 h-3 ${hudState.boost > 0 ? 'text-yellow-400' : 'text-slate-600'}`} />
                    </div>
                    <div className="w-48 h-2 bg-slate-800/80 rounded-full overflow-hidden border border-slate-700/50 backdrop-blur-sm">
                        <div 
                            className={`h-full transition-all duration-100 ease-out ${
                                hudState.boost >= 100 ? 'bg-gradient-to-r from-red-500 to-yellow-400' : 
                                hudState.boost > 50 ? 'bg-gradient-to-r from-yellow-500 to-orange-500' : 
                                'bg-blue-500'
                            }`}
                            style={{ width: `${hudState.boost}%` }}
                        />
                    </div>
                </div>

                <div className="relative flex items-baseline gap-2 text-right">
                    <span className="text-8xl font-display font-black text-white italic tracking-tighter shadow-lg drop-shadow-lg">{hudState.speed}</span>
                    <span className="text-xl font-bold text-slate-400">MPH</span>
                </div>
                 <div className="w-64 h-4 bg-slate-800 rounded-full overflow-hidden mt-2 border border-slate-700">
                    <div className="h-full bg-gradient-to-r from-green-400 via-yellow-400 to-red-500 transition-all duration-100" style={{ width: `${Math.min(hudState.speed / 2, 100)}%` }} />
                 </div>
             </div>
        </div>

        <div className="absolute top-1/2 right-8 transform -translate-y-1/2 pointer-events-auto">
             <button onClick={finishRace} className="group flex items-center gap-3 bg-white hover:bg-slate-200 text-slate-900 px-6 py-4 rounded-r-lg rounded-bl-lg font-bold shadow-[0_0_20px_rgba(255,255,255,0.3)] transition-all hover:pr-8">
                <span className="uppercase tracking-widest font-display">Box Box</span><Zap className="w-5 h-5 group-hover:scale-110 transition-transform" />
             </button>
             <div className="text-right mt-2 text-xs text-slate-400 font-mono bg-black/50 p-1 rounded">End Session & Analyze</div>
        </div>
      </div>
    </div>
  );
};