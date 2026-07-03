import { describe, it, expect, beforeEach, vi } from "vitest";
import { Vector3 } from "three";
import { GameLoop } from "../engine/loop";
import { rulesSystem } from "./rules/RulesSystem";
import { SonarSystem } from "./sonar/SonarSystem";
import { useGameStore } from "../store/useGameStore";

vi.mock("../../audio/SoundManager", () => {
  return {
    soundManager: {
      playCountdownBeep: vi.fn(),
      playGoSignal: vi.fn(),
      updateSonar: vi.fn(),
      startSonar: vi.fn(),
      stopSonar: vi.fn(),
    },
  };
});

describe("Headless Simulation Smoke Test", () => {
  let playerPos: { current: Vector3 };
  let enemyPos: { current: Vector3 };
  let sonarSystem: SonarSystem;
  let loop: GameLoop;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset store to defaults
    useGameStore.setState({
      isPaused: false,
      gameState: "setup",
      countdownValue: 5,
      score: 0,
      startTime: 0,
      personalBest: 0,
      personalRecords: [],
      isNewRecord: false,
    });

    playerPos = { current: new Vector3(0, 5, 0) };
    enemyPos = { current: new Vector3(0, 20, -15) };

    sonarSystem = new SonarSystem(playerPos, enemyPos);
    loop = new GameLoop({ simRate: 60, maxFrameDelta: 10.0 });

    loop.addTick((dt) => rulesSystem.tick(dt));
    loop.addTick((dt) => sonarSystem.tick(dt));
  });

  it("should execute a full match simulation cycle headlessly", () => {
    // 1. Verify initial boot state
    expect(useGameStore.getState().gameState).toBe("setup");
    expect(useGameStore.getState().score).toBe(0);

    // 2. Transition to countdown
    useGameStore.getState().setGameState("countdown");
    expect(useGameStore.getState().gameState).toBe("countdown");

    // Tick the loop to count down (run 6 seconds to safely clear the 5-second countdown)
    for (let i = 0; i < 6; i++) {
      loop.advance(1.0);
    }

    // Verify transition to playing
    expect(useGameStore.getState().gameState).toBe("playing");
    expect(useGameStore.getState().startTime).toBeGreaterThan(0);

    // 3. Tick while playing
    const initialPlayTime = useGameStore.getState().score;
    // Tick 2 seconds ahead
    loop.advance(2.0);
    expect(useGameStore.getState().score).toBeGreaterThan(initialPlayTime);

    // 4. Simulate a tag collision -> transition to gameover
    const finalScore = useGameStore.getState().score;
    useGameStore.getState().setGameState("gameover");
    
    // Tick rulesSystem once in gameover to trigger saveRecord evaluation
    loop.advance(0.016);

    expect(useGameStore.getState().gameState).toBe("gameover");
    
    // 5. Verify records persistence
    const state = useGameStore.getState();
    expect(state.personalBest).toBe(finalScore);
    expect(state.isNewRecord).toBe(true);
    expect(state.personalRecords.length).toBe(1);
    expect(state.personalRecords[0].timeAlive).toBe(finalScore);

    // 6. Restart game
    useGameStore.getState().restartGame();
    expect(useGameStore.getState().gameState).toBe("setup");
    expect(useGameStore.getState().score).toBe(0);
    expect(useGameStore.getState().isNewRecord).toBe(false);
    
    // Personal best should remain persisted across rounds!
    expect(useGameStore.getState().personalBest).toBe(finalScore);
  });
});
