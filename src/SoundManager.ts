

class SoundManager {
    ctx: AudioContext | null = null
    masterGain: GainNode | null = null
    enabled: boolean = true

    // Continuous Sonar Logic
    sonarOsc: OscillatorNode | null = null
    sonarGain: GainNode | null = null
    nextBeepTime: number = 0

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

        // Volume Falloff
        let distVol = Math.max(0, 1 - (distance / maxDist))
        distVol = Math.pow(distVol, 2) // Quadratic falloff

        const finalVol = distVol * settings.audioToneVolume * globalMult

        this.sonarGain.gain.setTargetAtTime(finalVol, now, 0.1)
    }
}

export const soundManager = new SoundManager()
