

import * as THREE from 'three'
import { computeMovementAudioParams } from './movementAudio'

class SoundManager {
    ctx: AudioContext | null = null
    masterGain: GainNode | null = null

    enabled: boolean = true

    // Continuous Sonar Logic
    sonarOsc: OscillatorNode | null = null
    sonarGain: GainNode | null = null
    nextBeepTime: number = 0

    // Continuous movement audio (rolling rumble + wind whoosh)
    private noiseBuffer: AudioBuffer | null = null
    private rollSrc: AudioBufferSourceNode | null = null
    private rollFilter: BiquadFilterNode | null = null
    private rollGainNode: GainNode | null = null
    private windSrc: AudioBufferSourceNode | null = null
    private windFilter: BiquadFilterNode | null = null
    private windGainNode: GainNode | null = null

    constructor() {
        this.init()
    }

    init() {
        if (this.ctx) return

        try {
            // Fix for legacy browsers
            const AudioContext = (window.AudioContext || (window as any).webkitAudioContext)
            this.ctx = new AudioContext()

            // Master Gain
            this.masterGain = this.ctx.createGain()
            this.masterGain.gain.value = 0.5 // Default volume
            this.masterGain.connect(this.ctx.destination)

            this.enabled = true
        } catch (e) {
            console.warn('Web Audio API not supported', e)
            this.enabled = false
        }
    }

    setEnabled(val: boolean) {
        this.enabled = val
        if (this.ctx && this.masterGain) {
            // Apply mute/unmute to master gain
            // But we also have explicit volumes. 
            // If disabled, maybe mute master gain entirely?
            if (!val) {
                this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime)
                this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime)
            } else {
                this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime)
                this.masterGain.gain.setValueAtTime(0.5, this.ctx.currentTime)
            }
        }

        // If re-enabling, might need to resume context if suspended
        if (val && this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume()
        }
    }

    setMasterVolume(val: number) {
        if (!this.ctx || !this.masterGain) return
        this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime)
        this.masterGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.1)
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume()
        }
    }

    playBeep(frequency: number, duration: number = 0.1, type: OscillatorType = 'sine', volume: number = 0.5) {
        if (!this.enabled || !this.ctx || !this.masterGain) return
        this.resume()

        const osc = this.ctx.createOscillator()
        const gain = this.ctx.createGain()

        osc.type = type
        osc.frequency.value = frequency

        gain.gain.setValueAtTime(0, this.ctx.currentTime)
        gain.gain.linearRampToValueAtTime(volume, this.ctx.currentTime + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration)

        osc.connect(gain)
        gain.connect(this.masterGain)

        osc.start()
        osc.stop(this.ctx.currentTime + duration + 0.1)
    }

    playCountdownBeep(count: number) {
        if (count > 0) {
            // High pitch short beep
            this.playBeep(800, 0.1, 'sine', 0.5)
        }
    }

    playGoSignal() {
        // "GO!" sound - Chord
        if (!this.enabled || !this.ctx || !this.masterGain) return
        const now = this.ctx.currentTime

        const osc1 = this.ctx.createOscillator()
        const osc2 = this.ctx.createOscillator()
        const gain = this.ctx.createGain()

        osc1.type = 'triangle'
        osc1.frequency.value = 600
        osc2.type = 'square'
        osc2.frequency.value = 900 // Fifth up

        gain.gain.setValueAtTime(0, now)
        gain.gain.linearRampToValueAtTime(0.6, now + 0.05)
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8)

        osc1.connect(gain)
        osc2.connect(gain)
        gain.connect(this.masterGain)

        osc1.start(now)
        osc2.start(now)

        osc1.stop(now + 1)
        osc2.stop(now + 1)
    }

    playTagSound() {
        this.playBeep(150, 0.4, 'sawtooth', 0.6)
    }

    playAlertSound() {
        // "Huh?" sound - rising pitch
        this.playBeep(300, 0.1, 'square', 0.4)
        setTimeout(() => this.playBeep(450, 0.2, 'square', 0.4), 100)
    }

    playLostSound() {
        // "Must have been the wind" - descending
        this.playBeep(400, 0.3, 'sine', 0.3)
        setTimeout(() => this.playBeep(300, 0.4, 'sine', 0.2), 200)
    }

    playBonkSound() {
        if (!this.enabled || !this.ctx || !this.masterGain) return
        const now = this.ctx.currentTime

        const osc = this.ctx.createOscillator()
        const gain = this.ctx.createGain()

        // Low "Bonk" - Longer and deeper
        osc.type = 'sawtooth'
        osc.frequency.setValueAtTime(80, now)
        osc.frequency.exponentialRampToValueAtTime(10, now + 1.5) // Drop way down over 1.5s

        gain.gain.setValueAtTime(1.0, now) // Louder start
        gain.gain.exponentialRampToValueAtTime(0.01, now + 1.2) // Long fade

        osc.connect(gain)
        gain.connect(this.masterGain)

        osc.start(now)
        osc.stop(now + 1.5)
    }

    // Updated signature to match EnemySphere usage, but it's unused in Sonar flow now
    // EnemySphere calls playPing(freq). We should support that for backward compatibility/other enemies.
    playPing(frequency: number = 800) {
        if (!this.enabled || !this.ctx) return
        this.playBeep(frequency, 0.15, 'sine', 0.3)
    }

    // --- Continuous Sonar Logic ---

    startSonar() {
        if (!this.enabled || !this.ctx || !this.masterGain) return
        if (this.sonarOsc) return

        this.sonarOsc = this.ctx.createOscillator()
        this.sonarGain = this.ctx.createGain()

        this.sonarOsc.type = 'sine'
        this.sonarOsc.frequency.value = 400

        this.sonarGain.gain.value = 0

        this.sonarOsc.connect(this.sonarGain)
        this.sonarGain.connect(this.masterGain)

        this.sonarOsc.start()
        this.nextBeepTime = this.ctx.currentTime
    }

    stopSonar() {
        if (this.sonarOsc) {
            try {
                this.sonarOsc.stop()
                this.sonarOsc.disconnect()
            } catch (e) { /* ignore */ }
            this.sonarOsc = null
        }
        if (this.sonarGain) {
            this.sonarGain.disconnect()
            this.sonarGain = null
        }
    }

    /*
     * Updates the sonar sound based on granular settings.
     */
    updateSonar(
        distance: number,
        closingSpeed: number,
        settings: {
            masterVolume: number
            audioPitchEnabled: boolean
            audioRateEnabled: boolean
            audioClosingVolume: number
            audioOpeningVolume: number
            audioPingVolume: number
            audioToneVolume: number
            audioPingStyle: 'sine' | 'square' | 'triangle' | 'sawtooth'
            audioToneStyle: 'sine' | 'square' | 'triangle' | 'sawtooth'
            audioClosingMaxDist: number
            audioOpeningMaxDist: number
            audioClosingPitch: number
            audioOpeningPitch: number
        },
        debugMode?: { closingEnabled: boolean, openingEnabled: boolean }
    ) {
        if (!this.enabled || !this.ctx || !this.sonarOsc || !this.sonarGain) return

        const now = this.ctx.currentTime
        const SOLID_THRESHOLD = 10

        // 1. Determine State (Closing vs Opening)
        const isClosing = closingSpeed > 0

        // 2. Select Max Dist & Volume Mult & Base Pitch
        let maxDist = 150
        let volumeMult = 1.0
        let basePitch = 600

        if (isClosing) {
            maxDist = settings.audioClosingMaxDist
            volumeMult = settings.audioClosingVolume
            basePitch = settings.audioClosingPitch
            if (debugMode && !debugMode.closingEnabled) volumeMult = 0
        } else {
            maxDist = settings.audioOpeningMaxDist
            volumeMult = settings.audioOpeningVolume
            basePitch = settings.audioOpeningPitch
            if (debugMode && !debugMode.openingEnabled) volumeMult = 0
        }

        const globalMult = volumeMult

        if (globalMult <= 0.001) {
            this.sonarGain.gain.setTargetAtTime(0, now, 0.1)
            return
        }

        // 3. Solid Tone Logic (Override)
        if (distance < SOLID_THRESHOLD) {
            // Use Tone Style
            if (this.sonarOsc.type !== settings.audioToneStyle) {
                this.sonarOsc.type = settings.audioToneStyle
            }

            // Tone Pitch - Ramps up from base pitch equivalent? Or keep standard "Panic" pitch?
            // Let's keep panic pitch relatively high/fixed so it screams "TOO CLOSE"
            // But maybe influence it by the base pitch?
            const solidPitch = 1500 + ((1 - (distance / SOLID_THRESHOLD)) * 500)
            this.sonarOsc.frequency.setTargetAtTime(solidPitch, now, 0.05)

            // Tone Volume

            // Actually solid is < 10. Max dist doesn't really matter for solid volume as it's full.
            // But for smooth transition...

            const finalVol = settings.audioToneVolume * globalMult

            this.sonarGain.gain.cancelScheduledValues(now)
            this.sonarGain.gain.setTargetAtTime(finalVol, now, 0.1)

            this.nextBeepTime = now + 0.1
            return
        }

        // 4. Standard Ping/Hum Logic

        // Ensure Style
        if (this.sonarOsc.type !== settings.audioPingStyle) {
            this.sonarOsc.type = settings.audioPingStyle
        }

        // Pitch Logic
        let pitch = basePitch // Use state base pitch
        if (settings.audioPitchEnabled) {
            const distFactor = Math.max(0, 1 - (distance / maxDist))
            // Modulate pitch: Base + (Factor * Range)
            // Example: 300 + (0.5 * 1200) = 900
            pitch = basePitch + (Math.pow(distFactor, 2) * 1200)
        }

        // Update Pitch
        this.sonarOsc.frequency.setTargetAtTime(pitch, now, 0.1)

        let distVol = Math.max(0, 1 - (distance / maxDist))
        distVol = Math.pow(distVol, 2) // Quadratic falloff

        const finalVol = distVol * settings.audioToneVolume * globalMult

        this.sonarGain.gain.setTargetAtTime(finalVol, now, 0.1)
    }

    // --- Continuous Movement Audio (roll rumble + wind) ---

    /** Lazily build a 2s looping white-noise buffer (shared by roll/wind/impacts). */
    private getNoiseBuffer(): AudioBuffer | null {
        if (!this.ctx) return null
        if (this.noiseBuffer) return this.noiseBuffer
        const len = Math.floor(this.ctx.sampleRate * 2)
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
        const data = buf.getChannelData(0)
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
        this.noiseBuffer = buf
        return buf
    }

    /** Spin up the two looping noise voices (roll → lowpass, wind → highpass), silent. */
    startMovementAudio() {
        if (!this.enabled || !this.ctx || !this.masterGain) return
        if (this.rollSrc) return // already running
        const buf = this.getNoiseBuffer()
        if (!buf) return

        // Roll: dull-to-bright grind. Lowpass cutoff rides speed (set in updateMovementAudio).
        this.rollSrc = this.ctx.createBufferSource()
        this.rollSrc.buffer = buf
        this.rollSrc.loop = true
        this.rollFilter = this.ctx.createBiquadFilter()
        this.rollFilter.type = 'lowpass'
        this.rollFilter.frequency.value = 300
        this.rollGainNode = this.ctx.createGain()
        this.rollGainNode.gain.value = 0
        this.rollSrc.connect(this.rollFilter)
        this.rollFilter.connect(this.rollGainNode)
        this.rollGainNode.connect(this.masterGain)
        this.rollSrc.start()

        // Wind: airy highpassed noise, gain rides total speed.
        this.windSrc = this.ctx.createBufferSource()
        this.windSrc.buffer = buf
        this.windSrc.loop = true
        this.windFilter = this.ctx.createBiquadFilter()
        this.windFilter.type = 'highpass'
        this.windFilter.frequency.value = 700
        this.windGainNode = this.ctx.createGain()
        this.windGainNode.gain.value = 0
        this.windSrc.connect(this.windFilter)
        this.windFilter.connect(this.windGainNode)
        this.windGainNode.connect(this.masterGain)
        this.windSrc.start()
    }

    /** Per-frame: map current motion → roll/wind gains + roll timbre. Smoothed. */
    updateMovementAudio(groundSpeed: number, speed: number, grounded: boolean) {
        if (!this.enabled || !this.ctx || !this.rollGainNode || !this.windGainNode || !this.rollFilter) return
        const now = this.ctx.currentTime
        const p = computeMovementAudioParams(groundSpeed, speed, grounded)
        this.rollGainNode.gain.setTargetAtTime(p.rollGain, now, 0.08)
        this.rollFilter.frequency.setTargetAtTime(p.rollCutoff, now, 0.08)
        this.windGainNode.gain.setTargetAtTime(p.windGain, now, 0.08)
    }

    /** Tear down the looping voices (on pause / gameover / unmount). */
    stopMovementAudio() {
        for (const src of [this.rollSrc, this.windSrc]) {
            if (src) { try { src.stop(); src.disconnect() } catch { /* ignore */ } }
        }
        for (const node of [this.rollFilter, this.rollGainNode, this.windFilter, this.windGainNode]) {
            if (node) { try { node.disconnect() } catch { /* ignore */ } }
        }
        this.rollSrc = null; this.windSrc = null
        this.rollFilter = null; this.windFilter = null
        this.rollGainNode = null; this.windGainNode = null
    }

    /**
     * Percussive hit — ball into a cube/column/wall. `strength` = the sudden horizontal
     * speed drop from the sim's onImpact (harder hit → louder + brighter + higher thump).
     */
    playImpact(strength: number) {
        if (!this.enabled || !this.ctx || !this.masterGain) return
        this.resume()
        const s = Math.max(0, Math.min(1, strength / 15))
        if (s < 0.03) return // ignore micro-bumps
        const now = this.ctx.currentTime
        const vol = 0.22 + s * 0.55

        // Bandpassed noise "clack".
        const buf = this.getNoiseBuffer()
        if (buf) {
            const src = this.ctx.createBufferSource()
            src.buffer = buf
            const bp = this.ctx.createBiquadFilter()
            bp.type = 'bandpass'
            bp.frequency.value = 400 + s * 900
            bp.Q.value = 0.8
            const g = this.ctx.createGain()
            g.gain.setValueAtTime(vol, now)
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.12)
            src.connect(bp); bp.connect(g); g.connect(this.masterGain)
            src.start(now); src.stop(now + 0.14)
            setTimeout(() => { try { bp.disconnect(); g.disconnect() } catch { /* ignore */ } }, 250)
        }

        // Low sine "thump" body.
        const osc = this.ctx.createOscillator()
        const og = this.ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(120 + s * 60, now)
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.12)
        og.gain.setValueAtTime(vol * 0.8, now)
        og.gain.exponentialRampToValueAtTime(0.001, now + 0.14)
        osc.connect(og); og.connect(this.masterGain)
        osc.start(now); osc.stop(now + 0.16)
        setTimeout(() => { try { og.disconnect() } catch { /* ignore */ } }, 250)
    }

    /**
     * Soft touchdown thud after a jump/fall. `impactSpeed` = downward speed at landing
     * (from the sim's onLand) — harder landings are louder/deeper.
     */
    playLanding(impactSpeed: number) {
        if (!this.enabled || !this.ctx || !this.masterGain) return
        this.resume()
        const s = Math.max(0, Math.min(1, impactSpeed / 12))
        if (s < 0.05) return
        const now = this.ctx.currentTime
        const vol = 0.18 + s * 0.5

        const osc = this.ctx.createOscillator()
        const g = this.ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(90 + s * 40, now)
        osc.frequency.exponentialRampToValueAtTime(38, now + 0.18)
        g.gain.setValueAtTime(vol, now)
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.22)
        osc.connect(g); g.connect(this.masterGain)
        osc.start(now); osc.stop(now + 0.24)
        setTimeout(() => { try { g.disconnect() } catch { /* ignore */ } }, 300)

        // Soft dust puff.
        const buf = this.getNoiseBuffer()
        if (buf) {
            const src = this.ctx.createBufferSource()
            src.buffer = buf
            const lp = this.ctx.createBiquadFilter()
            lp.type = 'lowpass'
            lp.frequency.value = 500
            const ng = this.ctx.createGain()
            ng.gain.setValueAtTime(vol * 0.4, now)
            ng.gain.exponentialRampToValueAtTime(0.001, now + 0.16)
            src.connect(lp); lp.connect(ng); ng.connect(this.masterGain)
            src.start(now); src.stop(now + 0.18)
            setTimeout(() => { try { lp.disconnect(); ng.disconnect() } catch { /* ignore */ } }, 300)
        }
    }

    // --- Spatial Audio ---

    updateListener(camera: THREE.Camera) {
        if (!this.enabled || !this.ctx) return

        const listener = this.ctx.listener

        // Ensure camera has up to date matrices
        // camera.updateMatrixWorld() // Usually done by renderer, but safe to assume it's close enough in useFrame

        const pos = new THREE.Vector3()
        pos.setFromMatrixPosition(camera.matrixWorld)

        const forward = new THREE.Vector3(0, 0, -1)
        forward.applyQuaternion(camera.quaternion)

        const up = new THREE.Vector3(0, 1, 0)
        up.applyQuaternion(camera.quaternion)

        if (listener.positionX) {
            // Standard Web Audio API
            listener.positionX.value = pos.x
            listener.positionY.value = pos.y
            listener.positionZ.value = pos.z

            listener.forwardX.value = forward.x
            listener.forwardY.value = forward.y
            listener.forwardZ.value = forward.z

            listener.upX.value = up.x
            listener.upY.value = up.y
            listener.upZ.value = up.z
        } else {
            // Deprecated setPosition/setOrientation logic if needed, but modern browsers support automation
            // (listener as any).setPosition(pos.x, pos.y, pos.z)
            // (listener as any).setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z)
        }
    }

    playSpatialPing(position: THREE.Vector3, frequency: number = 800) {
        if (!this.enabled || !this.ctx || !this.masterGain) return
        this.resume()

        const now = this.ctx.currentTime

        // Create Panner
        const panner = this.ctx.createPanner()
        panner.panningModel = 'HRTF'
        panner.distanceModel = 'inverse'
        panner.refDistance = 10
        panner.maxDistance = 100
        panner.rolloffFactor = 1

        panner.positionX.value = position.x
        panner.positionY.value = position.y
        panner.positionZ.value = position.z

        panner.connect(this.masterGain)

        // Create Sound Source
        const osc = this.ctx.createOscillator()
        const gain = this.ctx.createGain()

        osc.type = 'sine'
        osc.frequency.setValueAtTime(frequency, now)

        gain.gain.setValueAtTime(0, now)
        gain.gain.linearRampToValueAtTime(0.5, now + 0.05)
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2)

        osc.connect(gain)
        gain.connect(panner)

        osc.start(now)
        osc.stop(now + 0.3)

        // Cleanup panner nodes after sound is done
        setTimeout(() => {
            panner.disconnect()
        }, 400)
    }
}

export const soundManager = new SoundManager()
