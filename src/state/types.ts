export type GameState =
  | "start"
  | "setup"
  | "countdown"
  | "playing"
  | "gameover"
  | "won";

export interface PersonalRecord {
  date: string;
  timeAlive: number;
}

export interface SettingsState {
  // Gameplay
  jumpForce: number;
  moveSpeed: number;
  playerTopSpeed: number;
  enemySpeed: number;
  enemySize: number;
  enemyMass: number;
  gravity: number;
  friction: number;
  restitution: number;
  worldScale: number;

  // Level
  cubeCount: number;
  cubeScale: number;
  columnCount: number;
  columnSize: number;
  columnHeight: number;
  // Physics playground (Phase P)
  propCount: number;        // scattered dynamic knock-around props (0 = off) — Feature A
  terrainRoughness: number; // variable-floor bump amplitude (0 = flat) — Feature B
  crumbleCount: number;     // crashable crumble blocks that burst into debris (0 = off) — Feature C
  columnsCrumble: boolean;  // make the scattered columns destructible → brick debris — Feature D
  rampCubeRatio: number;    // fraction (0..1) of unbreakable cubes converted to 4-sided launch pyramids (1 = all, 0 = off) — Feature E
  debugAI: boolean;         // AI legibility overlay: vision/LOS/hunt-state/waypoints (dev-only) — Debug

  // Perf / Graphics
  soundEnabled: boolean;
  physicsRate: number;
  shadowsEnabled: boolean;
  pixelRatio: number;
  maxParticles: number;
  graphicsPreset: "low" | "medium" | "high" | "ultra" | "custom";

  // Camera
  cameraStiffness: number;
  cameraOffset: number;

  // Gameplay V2
  useV2AI: boolean;
  playerAirControl: number;
  enemyAirControl: number;

  // Visuals
  groundGridSize: number;
  groundColorBg: string;
  groundColorGrid: string;
  cubeGridSize: number;
  cubeColorBg: string;
  cubeColorGrid: string;
  uiAccentColor: string;
  // How obstacles between the camera and the player are revealed (see-through style):
  //   ghost = 40% transparent textured (default) · wireframe = edges-only bounding box ·
  //   xray = back-faces-only (shows the far interior wall, reads depth/collision) ·
  //   silhouette = dark tinted see-through fill + bright edges · off = stays solid.
  occlusionMode: "ghost" | "wireframe" | "xray" | "silhouette" | "off";

  // Audio settings
  masterVolume: number;
  audioPitchEnabled: boolean;
  audioRateEnabled: boolean;
  audioClosingVolume: number;
  audioOpeningVolume: number;
  audioPingVolume: number;
  audioToneVolume: number;
  audioPingStyle: "sine" | "square" | "triangle" | "sawtooth";
  audioToneStyle: "sine" | "square" | "triangle" | "sawtooth";
  audioClosingMaxDist: number;
  audioOpeningMaxDist: number;
  audioClosingPitch: number;
  audioOpeningPitch: number;
  audioSolidDistance: number;
  audioPitchModulation: number;
  audioStrategy: "drone" | "pulse";

  // UI Settings
  controlsOpen: boolean;
  sectionStates: Record<string, boolean>;

  // Preset
  activePreset: "v1" | "v2" | "custom";

  // Box3D physics feel preset (traction A/B — drives gravity/jump/friction in the Box3D sim)
  physicsPreset: "current" | "v1Gravity" | "blend";

  // Feel knobs (velocity model): coast glide/inertia on release (0 snappy stop .. 1 long glide)
  playerDrift: number;
  // Downhill roll strength while coasting on a slope (0 off .. 1 = full gravity along the surface)
  downhillRoll: number;
  // Jump apex target height in units — impulse derived from height + gravity + mass
  jumpHeight: number;

  // Velocity-model movement knobs (live, no rebuild) — mirror tuning.ts MOVEMENT.*
  moveTopSpeed: number;   // horizontal top speed (u/s)
  moveAccel: number;      // accel toward target velocity (u/s²) — snappiness
  moveBrakeDecel: number; // decel while braking / shift (u/s²)
  moveAirControl: number; // midair steering authority as a fraction of accel (0..1)

  // Enemy velocity-drive knobs (live) — mirror tuning.ts ENEMY.velUnit / velAccel
  enemyVelUnit: number;   // enemy top-speed unit: chaseSpeed = enemySpeed · stateMult · velUnit
  enemyVelAccel: number;  // enemy accel toward its target velocity (u/s²)

  // Play-feel preset (bundles physics/drift/downhill/jump/enemySpeed); "custom" once any is nudged
  playfeelPreset: "classic" | "iceRink" | "arcade" | "heavyweight" | "predator" | "custom";

  // Records
  personalBest: number;
  personalRecords: PersonalRecord[];
}

export interface SessionState {
  isPaused: boolean;
  gameState: GameState;
  countdownValue: number;
  audioDebugMode: { closingEnabled: boolean; openingEnabled: boolean };
  debugVelocity: number;
  enemyAIState: string;
  playerPosition: { x: number; y: number; z: number };
  enemyPosition: { x: number; y: number; z: number };
  perfStats: {
    fps: number;
    simMs: number;
    renderMs: number;
    drawCalls: number;
    triangles: number;
    geometries: number;
    textures: number;
    memory: number;
  };
  score: number;
  startTime: number;
  isNewRecord: boolean;
}

export interface GameStoreActions {
  // Settings Actions
  setSetting: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  setSettings: (settings: Partial<SettingsState>) => void;
  setSectionState: (section: string, isOpen: boolean) => void;
  loadPreset: (presetName: "v1" | "v2") => void;
  loadGraphicsPreset: (presetName: "low" | "medium" | "high" | "ultra") => void;
  applyPlayfeelPreset: (name: "classic" | "iceRink" | "arcade" | "heavyweight" | "predator") => void;
  saveRecord: (score: number) => void;

  // Session Actions
  setIsPaused: (isPaused: boolean | ((prev: boolean) => boolean)) => void;
  setGameState: (gameState: GameState | ((prev: GameState) => GameState)) => void;
  setCountdownValue: (val: number | ((prev: number) => number)) => void;
  restartGame: () => void;
}

export type GameStore = SettingsState & SessionState & GameStoreActions;

