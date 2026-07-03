import { useGameStore } from "../../store/useGameStore";
import { soundManager } from "../../audio/SoundManager";

export class RulesSystem {
  private accumulatedCountdownTime = 0;
  private lastState = "start";
  /** Deterministic elapsed play time, accumulated from sim `dt` only. Single source of truth for `score` (ARCHITECTURE §4 / F8). */
  private playElapsed = 0;

  tick(dt: number) {
    const state = useGameStore.getState();
    const { gameState, countdownValue, setCountdownValue, setGameState, isPaused } = state;

    if (isPaused) return;

    if (gameState === "start") {
      setGameState("setup");
      this.lastState = "setup";
      return;
    }

    if (gameState === "countdown") {
      // On first entering countdown, play the initial beep
      if (this.lastState !== "countdown") {
        this.accumulatedCountdownTime = 0;
        soundManager.playCountdownBeep(countdownValue);
        this.lastState = "countdown";
      }

      this.accumulatedCountdownTime += dt;
      if (this.accumulatedCountdownTime >= 1.0) {
        this.accumulatedCountdownTime -= 1.0;

        const nextVal = countdownValue - 1;
        if (nextVal > 0) {
          setCountdownValue(nextVal);
          soundManager.playCountdownBeep(nextVal);
        } else if (nextVal === 0) {
          setCountdownValue(0);
          soundManager.playGoSignal();
          setGameState("playing");
        }
      }
    } else if (gameState === "playing") {
      // On first entering playing, reset the deterministic elapsed-time accumulator
      if (this.lastState !== "playing") {
        this.playElapsed = 0;
      }
      this.lastState = "playing";

      // Score/tagged-time is driven purely by simulated dt, never wall-clock time
      // (F8: same scripted input must yield the same tagged-time every run).
      this.playElapsed += dt;
      useGameStore.setState({ score: this.playElapsed });
    } else if (gameState === "gameover") {
      if (this.lastState === "playing") {
        // Trigger high score evaluation and saving using the dt-accumulated score
        state.saveRecord(state.score);
      }
      this.lastState = "gameover";
    } else {
      this.lastState = gameState;
    }
  }

  reset() {
    this.accumulatedCountdownTime = 0;
    this.playElapsed = 0;
    this.lastState = "setup";
  }
}
export const rulesSystem = new RulesSystem();

