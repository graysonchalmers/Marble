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
  physicsPreset: "current" | "frictionOnly" | "v1Gravity" | "blend";

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
  saveRecord: (score: number) => void;

  // Session Actions
  setIsPaused: (isPaused: boolean | ((prev: boolean) => boolean)) => void;
  setGameState: (gameState: GameState | ((prev: GameState) => GameState)) => void;
  setCountdownValue: (val: number | ((prev: number) => number)) => void;
  restartGame: () => void;
}

export type GameStore = SettingsState & SessionState & GameStoreActions;

