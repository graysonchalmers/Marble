import type { StateCreator } from "zustand";
import type { SessionState, GameStore, GameState } from "./types";

export const createSessionSlice: StateCreator<
  GameStore,
  [],
  [],
  SessionState & Pick<GameStore, "setIsPaused" | "setGameState" | "setCountdownValue" | "restartGame">
> = (set) => {
  return {
    isPaused: false,
    gameState: "start",
    countdownValue: 5,
    audioDebugMode: { closingEnabled: true, openingEnabled: true },
    debugVelocity: 0,
    enemyAIState: "idle",
    playerPosition: { x: 0, y: 0, z: 0 },
    enemyPosition: { x: 0, y: 20, z: -15 },
    perfStats: {
      fps: 0,
      simMs: 0,
      renderMs: 0,
      drawCalls: 0,
      triangles: 0,
      geometries: 0,
      textures: 0,
      memory: 0
    },
    score: 0,
    startTime: 0,
    isNewRecord: false,

    setIsPaused: (isPaused: boolean | ((prev: boolean) => boolean)) =>
      set((state) => ({
        isPaused:
          typeof isPaused === "function" ? isPaused(state.isPaused) : isPaused,
      })),

    setGameState: (gameState: GameState | ((prev: GameState) => GameState)) =>
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

    setCountdownValue: (val: number | ((prev: number) => number)) =>
      set((state) => ({
        countdownValue:
          typeof val === "function" ? val(state.countdownValue) : val,
      })),

    restartGame: () => {
      set({
        isPaused: false,
        gameState: "setup", // Reset to setup directly for smooth restart
        countdownValue: 5,
        score: 0,
        startTime: 0,
        playerPosition: { x: 0, y: 5, z: 0 },
        enemyPosition: { x: 0, y: 20, z: -15 },
        debugVelocity: 0,
        enemyAIState: "idle",
        isNewRecord: false,
      });
    },
  };
};


