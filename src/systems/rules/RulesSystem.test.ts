import { describe, it, expect, beforeEach, vi } from "vitest";
import { rulesSystem } from "./RulesSystem";
import { useGameStore } from "../../store/useGameStore";
import { soundManager } from "../../audio/SoundManager";

// Mock soundManager to avoid audio context errors in node environment
vi.mock("../../audio/SoundManager", () => {
  return {
    soundManager: {
      playCountdownBeep: vi.fn(),
      playGoSignal: vi.fn(),
    },
  };
});

describe("RulesSystem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGameStore.setState({
      isPaused: false,
      gameState: "start",
      countdownValue: 5,
      score: 0,
      startTime: 0,
    });
    rulesSystem.reset();
  });

  it("should transition from start to setup on first tick", () => {
    rulesSystem.tick(0.016);
    expect(useGameStore.getState().gameState).toBe("setup");
  });

  it("should play beep and accumulate time in countdown state", () => {
    useGameStore.setState({ gameState: "countdown", countdownValue: 5 });

    // First tick in countdown triggers initial beep
    rulesSystem.tick(0.016);
    expect(soundManager.playCountdownBeep).toHaveBeenCalledWith(5);

    // Ticking less than 1.0s total should not decrement countdownValue
    rulesSystem.tick(0.5);
    expect(useGameStore.getState().countdownValue).toBe(5);

    // Ticking another 0.5s (total > 1.0s) should decrement countdownValue
    rulesSystem.tick(0.5);
    expect(useGameStore.getState().countdownValue).toBe(4);
    expect(soundManager.playCountdownBeep).toHaveBeenCalledWith(4);
  });

  it("should transition to playing when countdown reaches 0", () => {
    useGameStore.setState({ gameState: "countdown", countdownValue: 1 });

    // Tick rulesSystem once to register lastState = countdown
    rulesSystem.tick(0.016);

    // Tick 1s to hit 0
    rulesSystem.tick(1.0);
    
    const state = useGameStore.getState();
    expect(state.countdownValue).toBe(0);
    expect(state.gameState).toBe("playing");
    expect(soundManager.playGoSignal).toHaveBeenCalled();
  });
});
