import { useGameStore } from "../../store/useGameStore";
import { soundManager } from "../../audio/SoundManager";

export class RulesSystem {
  private accumulatedCountdownTime = 0;
  private lastState = "start";

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
      this.lastState = "playing";
      const { startTime } = state;
      if (startTime > 0) {
        useGameStore.setState({ score: (Date.now() - startTime) / 1000 });
      }
    } else if (gameState === "gameover") {
      if (this.lastState === "playing") {
        // Trigger high score evaluation and saving
        state.saveRecord(state.score);
      }
      this.lastState = "gameover";
    } else {
      this.lastState = gameState;
    }
  }

  reset() {
    this.accumulatedCountdownTime = 0;
    this.lastState = "setup";
  }
}
export const rulesSystem = new RulesSystem();

