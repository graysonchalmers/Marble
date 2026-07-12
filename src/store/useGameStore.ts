import { useGameStoreInner } from "../state/store";
export type { GameState, GameStore } from "../state/types";
export const useGameStore = useGameStoreInner;
