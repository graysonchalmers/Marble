import { create } from "zustand";
import type { GameStore } from "./types";
import { createSettingsSlice } from "./settingsSlice";
import { createSessionSlice } from "./sessionSlice";

export const useGameStoreInner = create<GameStore>()((...a) => ({
  ...createSettingsSlice(...a),
  ...createSessionSlice(...a),
} as GameStore));

