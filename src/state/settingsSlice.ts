import type { StateCreator } from "zustand";
import type { SettingsState, GameStore } from "./types";
import {
  loadSettings,
  saveSettingsDebounced,
  V1_PRESET,
  V2_PRESET,
  DEFAULT_SETTINGS,
} from "./persistence";
import { PLAYFEEL_PRESETS, PLAYFEEL_KEYS } from "../systems/sim/tuning";

export const createSettingsSlice: StateCreator<
  GameStore,
  [],
  [],
  SettingsState & Pick<GameStore, "setSetting" | "setSettings" | "setSectionState" | "loadPreset" | "loadGraphicsPreset" | "applyPlayfeelPreset" | "saveRecord">
> = (set) => {
  const initialSettings = loadSettings();

  return {
    ...initialSettings,

    setSetting: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
      set((state) => {
        const nextState = {
          ...state,
          [key]: value,
        };

        // If a settings key is changed (other than activePreset itself), mark preset as custom.
        // The Box3D-beta feel knobs are independent dev selectors — changing them must NOT trip activePreset.
        const BOX3D_FEEL_KEYS = ["physicsPreset", "playerDrift", "downhillRoll", "jumpHeight", "moveTopSpeed", "moveAccel", "moveBrakeDecel", "moveAirControl", "enemyVelUnit", "enemyVelAccel"];
        if (key !== "activePreset" && !BOX3D_FEEL_KEYS.includes(key as string) && key in DEFAULT_SETTINGS) {
          nextState.activePreset = "custom";
        }

        // If a graphics setting is modified manually, mark graphicsPreset as custom
        const GRAPHICS_KEYS = ["shadowsEnabled", "pixelRatio", "maxParticles", "physicsRate"];
        if (GRAPHICS_KEYS.includes(key as string)) {
          nextState.graphicsPreset = "custom";
        }

        // If a play-feel knob is nudged, the play-feel preset becomes "custom".
        if ((PLAYFEEL_KEYS as readonly string[]).includes(key as string)) {
          nextState.playfeelPreset = "custom";
        }

        // Save persisted settings
        saveSettingsDebounced(nextState);

        return nextState;
      });
    },

    setSettings: (settings: Partial<SettingsState>) => {
      set((state) => {
        const nextState = {
          ...state,
          ...settings,
        };

        // Mark preset as custom if any actual setting key is modified
        const hasTuningKey = Object.keys(settings).some(
          (k) => k !== "activePreset" && k in DEFAULT_SETTINGS
        );
        if (hasTuningKey) {
          nextState.activePreset = "custom";
        }

        const hasGraphicsKey = Object.keys(settings).some(
          (k) => ["shadowsEnabled", "pixelRatio", "maxParticles", "physicsRate"].includes(k)
        );
        if (hasGraphicsKey) {
          nextState.graphicsPreset = "custom";
        }

        saveSettingsDebounced(nextState);

        return nextState;
      });
    },

    setSectionState: (section: string, isOpen: boolean) => {
      set((state) => {
        const nextSectionStates = {
          ...state.sectionStates,
          [section]: isOpen,
        };
        const nextState = {
          ...state,
          sectionStates: nextSectionStates,
        };

        saveSettingsDebounced(nextState);

        return nextState;
      });
    },

    loadPreset: (presetName: "v1" | "v2") => {
      set((state) => {
        const preset = presetName === "v1" ? V1_PRESET : V2_PRESET;
        const nextState = {
          ...state,
          ...preset,
          activePreset: presetName,
        };

        saveSettingsDebounced(nextState);

        return nextState;
      });
    },

    loadGraphicsPreset: (presetName: "low" | "medium" | "high" | "ultra") => {
      set((state) => {
        let presetSettings: Partial<SettingsState> = {};
        if (presetName === "low") {
          presetSettings = { shadowsEnabled: false, pixelRatio: 0.75, maxParticles: 20, physicsRate: 60 };
        } else if (presetName === "medium") {
          presetSettings = { shadowsEnabled: true, pixelRatio: 1.0, maxParticles: 50, physicsRate: 60 };
        } else if (presetName === "high") {
          presetSettings = { shadowsEnabled: true, pixelRatio: 1.5, maxParticles: 100, physicsRate: 120 };
        } else if (presetName === "ultra") {
          presetSettings = { shadowsEnabled: true, pixelRatio: 2.0, maxParticles: 200, physicsRate: 120 };
        }

        const nextState = {
          ...state,
          ...presetSettings,
          graphicsPreset: presetName,
        };

        saveSettingsDebounced(nextState);

        return nextState;
      });
    },

    applyPlayfeelPreset: (name) => {
      set((state) => {
        const p = PLAYFEEL_PRESETS[name];
        const nextState = {
          ...state,
          physicsPreset: p.physicsPreset,
          playerDrift: p.playerDrift,
          downhillRoll: p.downhillRoll,
          jumpHeight: p.jumpHeight,
          enemySpeed: p.enemySpeed,
          playfeelPreset: name,
        };
        saveSettingsDebounced(nextState);
        return nextState;
      });
    },

    saveRecord: (score: number) => {
      set((state) => {
        let isNewPB = false;
        let nextBest = state.personalBest;

        // If score is greater than personal best, update PB
        if (score > state.personalBest) {
          nextBest = score;
          isNewPB = true;
        }

        const newRecord = {
          date: new Date().toLocaleDateString(),
          timeAlive: score,
        };

        const nextRecords = [...state.personalRecords, newRecord]
          .sort((a, b) => b.timeAlive - a.timeAlive)
          .slice(0, 10);

        const nextState = {
          ...state,
          personalBest: nextBest,
          personalRecords: nextRecords,
        };

        saveSettingsDebounced(nextState);

        return {
          ...nextState,
          isNewRecord: isNewPB,
        } as any;
      });
    },
  };
};


