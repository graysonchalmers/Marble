import type { SettingsState } from "./types";
import { MOVEMENT, ENEMY, DEFAULT_TERRAIN_ROUGHNESS } from "../systems/sim/tuning";

const STORAGE_KEY = "MARBLE_GAME_SETTINGS_V2";
const SCHEMA_VERSION = 5;

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
  // Tall pillars (Obst-2): fewer, thinner, and taller than cubes — weave-and-dodge cover
  // the player can't jump over (default jump clears ~1.8u). Live in SettingsMenu → Environment.
  columnCount: 6,
  columnSize: 3,
  columnHeight: 12,
  // Phase P — scattered dynamic props (knock-around clutter) + variable-floor roughness.
  // Both ON at a modest default so the physics shows off; dial to 0 to disable.
  propCount: 12,
  terrainRoughness: DEFAULT_TERRAIN_ROUGHNESS,
  soundEnabled: true,
  physicsRate: 60, // Changed default to 60 for Medium preset
  shadowsEnabled: true,
  pixelRatio: 1,
  maxParticles: 50,
  graphicsPreset: "medium",
  // Camera feel — these now drive the Box3D follow-camera live (were hardcoded 6/11 in the
  // scene). Defaults re-anchored to that shipped feel so wiring the sliders is feel-neutral.
  cameraStiffness: 6,
  cameraOffset: 11,
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
  // Ground look — matches the Box3D scene's previously-hardcoded terrain texture
  // (#1a4d2e bg / #4f772d grid at 64px), so the now-live Visuals→Ground sliders are
  // look-neutral at default. (Old Cannon-era values were #70b348 / #3e6b1f / 176.)
  groundGridSize: 64,
  groundColorBg: "#1a4d2e",
  groundColorGrid: "#4f772d",
  cubeGridSize: 256,
  cubeColorBg: "#d3d3d3",
  cubeColorGrid: "#404040",
  uiAccentColor: "#E53935",
  occlusionMode: "ghost",

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
  // Keep in sync with tuning.ts DEFAULT_DRIFT / DEFAULT_DOWNHILL_ROLL / PLAYER.jumpHeight.
  playerDrift: 0.55,
  downhillRoll: 0.7,
  jumpHeight: 1.8,
  // Velocity-model movement knobs — sourced from tuning.ts so the slider defaults can't drift.
  moveTopSpeed: MOVEMENT.topSpeed,
  moveAccel: MOVEMENT.accel,
  moveBrakeDecel: MOVEMENT.brakeDecel,
  moveAirControl: MOVEMENT.airControl,
  enemyVelUnit: ENEMY.velUnit,
  enemyVelAccel: ENEMY.velAccel,
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
    if (version < 4) {
      // These settings used to be hardcoded/ignored in the Box3D path; they're now live.
      // Reset stale Cannon-era persisted values to the shipped Box3D look/feel so wiring
      // them up doesn't retroactively change anyone's camera or terrain. Fresh forward.
      delete saved.cameraStiffness;
      delete saved.cameraOffset;
      delete saved.groundColorBg;
      delete saved.groundColorGrid;
      delete saved.groundGridSize;
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
