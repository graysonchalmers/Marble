import * as THREE from "three";
import { useGameStore } from "../../store/useGameStore";
import { soundManager } from "../../audio/SoundManager";

export class SonarSystem {
  private playerPos: { current: THREE.Vector3 };
  private enemyPos: { current: THREE.Vector3 };
  private lastDist = 0;
  private throttleTime = 0;

  constructor(
    playerPos: { current: THREE.Vector3 },
    enemyPos: { current: THREE.Vector3 }
  ) {
    this.playerPos = playerPos;
    this.enemyPos = enemyPos;
  }

  tick(dt: number) {
    const { gameState, isPaused } = useGameStore.getState();

    if (isPaused || gameState !== "playing") {
      return;
    }

    if (!this.playerPos.current || !this.enemyPos.current) return;

    const dist = this.playerPos.current.distanceTo(this.enemyPos.current);
    
    // Initialize lastDist on the first tick of playing
    if (this.lastDist === 0) {
      this.lastDist = dist;
    }

    // Closing speed: Positive if distance decreased (getting closer)
    let closingSpeed = dt > 0 ? -(dist - this.lastDist) / dt : 0;
    if (closingSpeed === 0) {
      closingSpeed = 0; // Normalize -0 to 0
    }

    // Update the sound manager using current settings
    soundManager.updateSonar(dist, closingSpeed, useGameStore.getState());

    // Throttled debug velocity UI update (~5Hz)
    this.throttleTime += dt;
    if (this.throttleTime >= 0.2) {
      useGameStore.setState({ debugVelocity: closingSpeed });
      this.throttleTime = 0;
    }

    this.lastDist = dist;
  }

  reset() {
    this.lastDist = 0;
    this.throttleTime = 0;
  }
}


