import type { SettingsState } from "./types";

const STORAGE_KEY = "MARBLE_GAME_SETTINGS_V2";
const SCHEMA_VERSION = 3;

export const DEFAULT_SETTINGS: SettingsState = {
  jumpForce: 5,
  moveSpeed: 8,
  playerTopSpeed: 20,
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
  physicsRate: 60, // Changed default to 60 for Medium preset
  shadowsEnabled: true,
  pixelRatio: 1,
  maxParticles: 50,
  graphicsPreset: "medium",
  cameraStiffness: 3,
  cameraOffset: 15,
  useV2AI: true,
  playerAirControl: 0.1,
  enemyAirControl: 0,
  controlsOpen: true,
  sectionStates: {
    gameplay: true,
    physics: true,
    environment: true,
    graphics: true,
    visuals: true,
    audio: true,
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
  audioPingStyle: "sine",
  audioToneStyle: "triangle",
  audioClosingMaxDist: 150,
  audioOpeningMaxDist: 150,
  audioClosingPitch: 300,
  audioOpeningPitch: 200,
  audioSolidDistance: 10,
  audioPitchModulation: 4,
  audioStrategy: "drone",
  activePreset: "v2",
  // Baseline physics feel = blend (C): gravity -15, playtested-good with the velocity model.
  physicsPreset: "blend",
  movementModel: "velocity",
  enemyMovementModel: "velocity",
  // Keep in sync with tuning.ts DEFAULT_DRIFT / DEFAULT_DOWNHILL_ROLL / PLAYER.jumpHeight.
  playerDrift: 0.55,
  downhillRoll: 0.7,
  jumpHeight: 1.8,
  playfeelPreset: "classic",

  personalBest: 0,
  personalRecords: [],
};

export const V1_PRESET: SettingsState = {
  ...DEFAULT_SETTINGS,
  activePreset: "v1",
};

export const V2_PRESET: SettingsState = {
  ...DEFAULT_SETTINGS,
  activePreset: "v2",
};

// Simple schema migration
function migrate(saved: any): SettingsState {
  const version = saved.schemaVersion ?? saved.version ?? 0;
  
  if (version < SCHEMA_VERSION) {
    console.log(`Migrating settings from version ${version} to ${SCHEMA_VERSION}`);
    if (version < 3) {
      saved.personalBest = saved.personalBest ?? 0;
      saved.personalRecords = saved.personalRecords ?? [];
    }
  }
  
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    schemaVersion: SCHEMA_VERSION,
  };
}

export function loadSettings(): SettingsState {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      return migrate(parsed);
    } catch (e) {
      console.error("Failed to parse saved settings", e);
    }
  }
  
  return DEFAULT_SETTINGS;
}

let debounceTimeout: any = null;

export function saveSettingsDebounced(settings: SettingsState): void {
  if (typeof window === "undefined") return;

  if (debounceTimeout) {
    clearTimeout(debounceTimeout);
  }

  debounceTimeout = setTimeout(() => {
    try {
      const toSave = {
        ...settings,
        schemaVersion: SCHEMA_VERSION,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
      console.error("Failed to write settings to localStorage", e);
    }
  }, 300); // 300ms debounce
}
