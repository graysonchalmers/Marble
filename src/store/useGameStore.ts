import { create } from "zustand";

export type GameState =
  | "start"
  | "setup"
  | "countdown"
  | "playing"
  | "gameover"
  | "won";

export interface GameStore {
  // Gameplay
  jumpForce: number;
  moveSpeed: number;
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

  // Perf
  soundEnabled: boolean;
  physicsRate: number;
  shadowsEnabled: boolean;
  pixelRatio: number;

  // Camera
  cameraStiffness: number;
  cameraOffset: number;

  // Gameplay V2
  useV2AI: boolean;
  playerAirControl: number;
  enemyAirControl: number;

  // Debug
  showPerf: boolean;

  // Visuals
  groundGridSize: number;
  groundColorBg: string;
  groundColorGrid: string;
  cubeGridSize: number;
  cubeColorBg: string;
  cubeColorGrid: string;
  uiAccentColor: string;

  // Audio Persistence
  masterVolume: number;
  audioPitchEnabled: boolean;
  audioRateEnabled: boolean;
  audioClosingVolume: number;
  audioOpeningVolume: number;
  audioPingVolume: number;
  audioToneVolume: number;
  audioPingStyle: "sine" | "square" | "triangle" | "sawtooth";
  audioToneStyle: "sine" | "square" | "triangle" | "sawtooth";

  // Granular Pitch/Dist
  audioClosingMaxDist: number;
  audioOpeningMaxDist: number;
  audioClosingPitch: number;
  audioOpeningPitch: number;
  audioSolidDistance: number;
  audioPitchModulation: number;
  audioStrategy: "drone" | "pulse";

  // UI Persistence
  controlsOpen: boolean;
  sectionStates: Record<string, boolean>;

  // Session State (Not Persisted)
  isPaused: boolean;
  gameState: GameState;
  countdownValue: number;
  audioDebugMode: { closingEnabled: boolean; openingEnabled: boolean };
  debugVelocity: number;
  enemyAIState: string;
  playerPosition: { x: number; y: number; z: number };
  enemyPosition: { x: number; y: number; z: number };
  perfStats: { fps: number; cpu: number; gpu: number };
  score: number;
  startTime: number;

  // Actions
  setSetting: <K extends keyof GameStore>(key: K, value: GameStore[K]) => void;
  setSettings: (settings: Partial<GameStore>) => void;
  setIsPaused: (isPaused: boolean | ((prev: boolean) => boolean)) => void;
  setGameState: (
    gameState: GameState | ((prev: GameState) => GameState),
  ) => void;
  setCountdownValue: (val: number | ((prev: number) => number)) => void;
  setSectionState: (section: string, isOpen: boolean) => void;
  restartGame: () => void;
}

const STORAGE_KEY = "MARBLE_GAME_SETTINGS_V2";

const DEFAULT_SETTINGS = {
  jumpForce: 5,
  moveSpeed: 8,
  enemySpeed: 2,
  enemySize: 0.9,
  enemyMass: 2.5,
  gravity: -22.5,
  friction: 0.35,
  restitution: 0.2,
  worldScale: 0.75,
  cubeCount: 30,
  cubeScale: 7,
  soundEnabled: true,
  physicsRate: 60,
  shadowsEnabled: true,
  pixelRatio: 1,
  cameraStiffness: 3,
  cameraOffset: 15,
  useV2AI: true,
  playerAirControl: 0.1,
  enemyAirControl: 0,
  showPerf: true,
  controlsOpen: true,
  sectionStates: {
    gameplay: true,
    physics: true,
    environment: true,
    graphics: true,
    visuals: true,
  },
  groundGridSize: 176,
  groundColorBg: "#70b348",
  groundColorGrid: "#3e6b1f",
  cubeGridSize: 256,
  cubeColorBg: "#d3d3d3",
  cubeColorGrid: "#404040",
  uiAccentColor: "#E53935",

  masterVolume: 0.5,
  audioPitchEnabled: true,
  audioRateEnabled: true,
  audioClosingVolume: 1,
  audioOpeningVolume: 0.3,
  audioPingVolume: 0.6,
  audioToneVolume: 0.5,
  audioPingStyle: "sine" as const,
  audioToneStyle: "triangle" as const,
  audioClosingMaxDist: 150,
  audioOpeningMaxDist: 150,
  audioClosingPitch: 300,
  audioOpeningPitch: 200,
  audioSolidDistance: 10,
  audioPitchModulation: 4,
  audioStrategy: "drone" as const,
};

function loadSettings() {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    } catch (e) {
      console.error("Failed to load settings", e);
    }
  }
  return DEFAULT_SETTINGS;
}

export const useGameStore = create<GameStore>((set) => {
  const initialSettings = loadSettings();

  return {
    ...initialSettings,

    // Session State
    isPaused: false,
    gameState: "start",
    countdownValue: 5,
    audioDebugMode: { closingEnabled: true, openingEnabled: true },
    debugVelocity: 0,
    enemyAIState: "idle",
    playerPosition: { x: 0, y: 0, z: 0 },
    enemyPosition: { x: 0, y: 20, z: -15 },
    perfStats: { fps: 0, cpu: 0, gpu: 0 },
    score: 0,
    startTime: 0,

    setSetting: (key, value) => {
      set({ [key]: value } as any);
      if (key in DEFAULT_SETTINGS) {
        const currentSettings = loadSettings();
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ ...currentSettings, [key]: value }),
        );
      }
    },

    setSettings: (settings) => {
      set(settings);
      const currentSettings = loadSettings();
      const toSave = { ...currentSettings };
      let needsSave = false;
      for (const key of Object.keys(settings)) {
        if (key in DEFAULT_SETTINGS) {
          (toSave as any)[key] = (settings as any)[key];
          needsSave = true;
        }
      }
      if (needsSave) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
      }
    },

    setIsPaused: (isPaused) =>
      set((state) => ({
        isPaused:
          typeof isPaused === "function" ? isPaused(state.isPaused) : isPaused,
      })),

    setGameState: (gameState) =>
      set((state) => {
        const nextState =
          typeof gameState === "function"
            ? gameState(state.gameState)
            : gameState;

        let newScore = state.score;
        let newStartTime = state.startTime;

        if (nextState === "playing") {
          newStartTime = Date.now();
          newScore = 0;
        } else if (nextState === "gameover" && state.startTime > 0) {
          newScore = (Date.now() - state.startTime) / 1000;
          newStartTime = 0;
        }

        return {
          gameState: nextState,
          score: newScore,
          startTime: newStartTime,
        };
      }),

    setCountdownValue: (val) =>
      set((state) => ({
        countdownValue:
          typeof val === "function" ? val(state.countdownValue) : val,
      })),

    setSectionState: (section, isOpen) =>
      set((state) => {
        const temp = { ...state.sectionStates, [section]: isOpen };
        const curSet = loadSettings();
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ ...curSet, sectionStates: temp }),
        );
        return { sectionStates: temp };
      }),

    restartGame: () => {
      set({
        isPaused: false,
        gameState: "start",
        countdownValue: 5,
      });
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    },
  };
});
