import { describe, it, expect, beforeEach, vi } from "vitest";
import * as THREE from "three";
import { SonarSystem } from "./SonarSystem";
import { useGameStore } from "../../store/useGameStore";
import { soundManager } from "../../audio/SoundManager";

vi.mock("../../audio/SoundManager", () => {
  return {
    soundManager: {
      updateSonar: vi.fn(),
      startSonar: vi.fn(),
      stopSonar: vi.fn(),
    },
  };
});

describe("SonarSystem", () => {
  let playerPos: { current: THREE.Vector3 };
  let enemyPos: { current: THREE.Vector3 };
  let sonarSystem: SonarSystem;

  beforeEach(() => {
    vi.clearAllMocks();
    useGameStore.setState({
      isPaused: false,
      gameState: "playing",
      masterVolume: 0.5,
    });

    playerPos = { current: new THREE.Vector3(0, 0, 0) };
    enemyPos = { current: new THREE.Vector3(0, 0, 10) }; // 10 units away
    sonarSystem = new SonarSystem(playerPos, enemyPos);
  });

  it("should not update sonar if not in playing state", () => {
    useGameStore.setState({ gameState: "setup" });
    sonarSystem.tick(0.016);
    expect(soundManager.updateSonar).not.toHaveBeenCalled();
  });

  it("should calculate closing speed correctly", () => {
    // First tick to set initial distance (10u)
    sonarSystem.tick(0.1);
    expect(soundManager.updateSonar).toHaveBeenCalledWith(10, 0, expect.any(Object));

    // Move player closer (from 10u away to 8u away) -> distance decreased -> positive closing speed
    playerPos.current.set(0, 0, 2); // enemy at 10, player at 2 -> dist = 8
    sonarSystem.tick(0.1); // dt = 0.1s, deltaDist = -2 -> closingSpeed = -(-2) / 0.1 = 20
    expect(soundManager.updateSonar).toHaveBeenCalledWith(8, 20, expect.any(Object));

    // Move player further (from 8u away to 9u away) -> distance increased -> negative closing speed
    playerPos.current.set(0, 0, 1); // enemy at 10, player at 1 -> dist = 9
    sonarSystem.tick(0.1); // dt = 0.1s, deltaDist = +1 -> closingSpeed = -(1) / 0.1 = -10
    expect(soundManager.updateSonar).toHaveBeenCalledWith(9, -10, expect.any(Object));
  });
});

