/**
 * The GameLoop's sim tick for Box3DScene, as a factory so it can be tested headless.
 *
 * Replay re-simulates from the recorded stream (one recorded frame per fixed step,
 * ignoring the game-state machine and live keyboard); live play reads the store.
 */
import { useGameStore } from '../../store/useGameStore'
import { useReplayStore } from '../../state/replayStore'
import type { MarbleSim, SimInput } from '../../systems/sim/MarbleSim'
import type { ReplayRecorder } from '../../systems/replay/recorder'
import type { ReplayPlayer } from '../../systems/replay/player'

interface Ref<T> { current: T }

export interface SimTickDeps {
    sim: MarbleSim
    keys: Ref<SimInput>
    replayRef: Ref<{ player: ReplayPlayer } | null | undefined>
    recorderRef: Ref<ReplayRecorder>
    earlyReleasedRef: Ref<boolean>
}

export function makeSimTick({ sim, keys, replayRef, recorderRef, earlyReleasedRef }: SimTickDeps) {
    return (dt: number) => {
        // A settings/replay rebuild destroys this sim's world in the boot effect's cleanup,
        // but the replacement sim only arrives (setSim) after an async boot, so this tick
        // stays registered for a few frames. Stepping a dead world throws "Failed to read
        // body transform"; skip before touching the bridge or consuming a replay frame.
        if (sim.world.isDestroyed) return

        const rp = replayRef.current
        if (rp) {
            const frame = rp.player.next()
            if (frame) {
                sim.step(dt, frame.input, frame.params)
                useReplayStore.getState().reportPosition(rp.player.position)
            } else {
                // Reached the end — freeze on the last frame.
                useReplayStore.getState().setPaused(true)
            }
            return
        }

        // --- LIVE play ---
        const s = useGameStore.getState()
        const params = {
            enemySpeed: s.enemySpeed,
            enemyAirControl: s.enemyAirControl,
            playerDrift: s.playerDrift,
            downhillRoll: s.downhillRoll,
            jumpHeight: s.jumpHeight,
            moveTopSpeed: s.moveTopSpeed,
            moveAccel: s.moveAccel,
            moveBrakeDecel: s.moveBrakeDecel,
            moveAirControl: s.moveAirControl,
            enemyVelUnit: s.enemyVelUnit,
            enemyVelAccel: s.enemyVelAccel
        }
        if (s.gameState === 'setup') {
            sim.resetPositions()
            return
        }
        if (s.gameState === 'countdown') {
            // Early release: the first control-key press during the countdown breaks the
            // player free for a head start; the enemy stays pinned at spawn (freezeEnemy)
            // until the timer hits zero and RulesSystem flips gameState to 'playing'.
            const k = keys.current
            if (!earlyReleasedRef.current && (k.w || k.a || k.s || k.d || k.space)) {
                earlyReleasedRef.current = true
            }
            if (!earlyReleasedRef.current) {
                sim.resetPositions()
                return
            }
            const releaseParams = { ...params, freezeEnemy: true }
            sim.step(dt, k, releaseParams)
            recorderRef.current.capture(k, releaseParams) // record the head-start frames too
            return
        }
        sim.step(dt, keys.current, params)
        recorderRef.current.capture(keys.current, params)
    }
}
