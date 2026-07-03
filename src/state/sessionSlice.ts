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

        // score is the single responsibility of RulesSystem.tick(dt), driven by
        // deterministic sim time only (F8). Do NOT derive it from Date.now() here —
        // that was the source of a real determinism bug (two wall-clock writers
        // silently overwriting each other's value). This action only resets score
        // to 0 at the moment "playing" starts; RulesSystem takes it from there.
        const newScore = nextState === "playing" ? 0 : state.score;

        // startTime is informational only (e.g. "did a round actually start") —
        // it must never be read back to derive score/tagged-time.
        const newStartTime =
          nextState === "playing" ? Date.now() : state.startTime;

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


