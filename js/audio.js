// Audio system using Web Audio API (procedural sounds) + Speech Synthesis
class AudioManager {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.initialized = false;
        this.voice = null;
        this.voiceReady = false;
        this.lastSpeech = 0;
        this.speechQueue = [];
        this.speaking = false;
        this.lastSoundTime = {}; // throttle per-sound
        this._initVoice();
    }

    _initVoice() {
        if (!('speechSynthesis' in window)) return;

        const pickVoice = () => {
            const voices = speechSynthesis.getVoices();
            const preferred = [
                'Samantha', 'Karen', 'Victoria', 'Allison', 'Ava',
                'Susan', 'Zira', 'Microsoft Zira', 'Google US English'
            ];
            for (const name of preferred) {
                const v = voices.find(v => v.name.includes(name) && v.lang.startsWith('en'));
                if (v) { this.voice = v; break; }
            }
            if (!this.voice) {
                this.voice = voices.find(v => v.lang === 'en-US') ||
                             voices.find(v => v.lang.startsWith('en')) ||
                             voices[0];
            }
            if (this.voice) this.voiceReady = true;
        };

        if (speechSynthesis.getVoices().length > 0) {
            pickVoice();
        }
        speechSynthesis.onvoiceschanged = () => pickVoice();
    }

    init() {
        if (this.initialized) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.initialized = true;
            this.musicPlaying = false;
            this.musicGain = null;
            this.musicVolume = 0.25;

            // Resume AudioContext on any user interaction (browsers require this)
            const resumeAudio = () => {
                if (this.ctx && this.ctx.state === 'suspended') {
                    this.ctx.resume();
                }
            };
            document.addEventListener('click', resumeAudio);
            document.addEventListener('keydown', resumeAudio);
            document.addEventListener('mousedown', resumeAudio);
        } catch (e) {
            this.enabled = false;
        }
    }

    // =================== BACKGROUND MUSIC ===================
    startMusic() {
        if (!this.ctx || this.musicPlaying) return;
        this._ensureRunning();
        this.musicPlaying = true;

        // Master music gain
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = this.musicVolume;
        this.musicGain.connect(this.ctx.destination);

        // Start all music layers
        this._startDrone();
        this._startPercussion();
        this._startMelody();
        this._startBassline();
        this._startWindAmbience();
    }

    stopMusic() {
        this.musicPlaying = false;
        if (this.musicGain) {
            this.musicGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 2);
        }
        // Stop all scheduled loops
        if (this._percInterval) clearInterval(this._percInterval);
        if (this._melodyInterval) clearInterval(this._melodyInterval);
        if (this._bassInterval) clearInterval(this._bassInterval);
    }

    toggleMusic() {
        if (this.musicPlaying) {
            this.stopMusic();
        } else {
            this.startMusic();
        }
        return this.musicPlaying;
    }

    // Deep desert drone - continuous ominous pad
    _startDrone() {
        // Two detuned oscillators for thick pad sound
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const osc3 = this.ctx.createOscillator();
        const gain1 = this.ctx.createGain();
        const gain2 = this.ctx.createGain();
        const gain3 = this.ctx.createGain();

        // D minor drone
        osc1.type = 'sine';
        osc1.frequency.value = 73.42; // D2
        osc2.type = 'sine';
        osc2.frequency.value = 73.92; // Slightly detuned for beating
        osc3.type = 'sine';
        osc3.frequency.value = 110; // A2 (fifth)

        gain1.gain.value = 0.5;
        gain2.gain.value = 0.35;
        gain3.gain.value = 0.2;

        // Slow LFO for movement
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        lfo.type = 'sine';
        lfo.frequency.value = 0.08; // Very slow wobble
        lfoGain.gain.value = 0.1;
        lfo.connect(lfoGain);
        lfoGain.connect(gain1.gain);
        lfo.start();

        osc1.connect(gain1);
        osc2.connect(gain2);
        osc3.connect(gain3);
        gain1.connect(this.musicGain);
        gain2.connect(this.musicGain);
        gain3.connect(this.musicGain);

        osc1.start();
        osc2.start();
        osc3.start();
    }

    // Rhythmic percussion - tribal desert beat
    _startPercussion() {
        const bpm = 75;
        const beatMs = (60 / bpm) * 1000;
        let beat = 0;

        // Percussion patterns (16-step)
        const kickPattern =   [1,0,0,0, 1,0,0,0, 1,0,0,1, 0,0,1,0];
        const hihatPattern =  [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,1];
        const tomPattern =    [0,0,0,0, 0,0,0,1, 0,0,0,0, 0,1,0,0];
        const shakerPattern = [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1];

        this._percInterval = setInterval(() => {
            if (!this.musicPlaying) return;
            const step = beat % 16;

            // Kick drum
            if (kickPattern[step]) {
                this._musicTone(55, 0.12, 'sine', 0.35);
                this._musicNoise(0.04, 0.15);
            }

            // Hi-hat
            if (hihatPattern[step]) {
                this._musicNoiseFiltered(0.03, 0.12, 8000);
            }

            // Tom
            if (tomPattern[step]) {
                this._musicTone(100, 0.1, 'sine', 0.2);
                this._musicTone(80, 0.15, 'sine', 0.15, 0.03);
            }

            // Shaker (very quiet)
            if (shakerPattern[step]) {
                this._musicNoiseFiltered(0.02, 0.04, 6000);
            }

            beat++;
        }, beatMs / 4); // 16th notes
    }

    // Haunting melody - middle eastern / desert scale
    _startMelody() {
        // D Phrygian scale (desert feel): D Eb F G A Bb C
        const scale = [146.83, 155.56, 174.61, 196.00, 220.00, 233.08, 261.63, 293.66];
        const melodyPatterns = [
            [0, 2, 3, 4, 3, 2, 1, 0],     // Descending run
            [0, 1, 0, -1, 0, 2, 4, 3],     // Ornamental
            [4, 3, 2, 0, 1, 0, -1, 0],     // High descent
            [0, 0, 2, 3, 5, 4, 3, 2],      // Rising
            [-1, -1, -1, -1, -1, -1, -1, -1], // Rest (silence)
        ];

        let patternIdx = 0;
        let noteIdx = 0;
        const bpm = 75;
        const noteMs = (60 / bpm) * 1000; // Quarter note

        this._melodyInterval = setInterval(() => {
            if (!this.musicPlaying) return;

            const pattern = melodyPatterns[patternIdx];
            const degree = pattern[noteIdx];

            if (degree >= 0 && degree < scale.length) {
                const freq = scale[degree];
                // Main note
                this._musicTone(freq, 0.4, 'sine', 0.15);
                // Harmonic shimmer
                this._musicTone(freq * 2, 0.3, 'sine', 0.04, 0.05);
                // Slight vibrato via detuned tone
                this._musicTone(freq * 1.002, 0.35, 'sine', 0.06);
            }

            noteIdx++;
            if (noteIdx >= pattern.length) {
                noteIdx = 0;
                patternIdx = (patternIdx + 1) % melodyPatterns.length;
            }
        }, noteMs);
    }

    // Deep bassline
    _startBassline() {
        const bassNotes = [73.42, 73.42, 82.41, 73.42, 65.41, 73.42, 87.31, 73.42]; // D2 based
        let noteIdx = 0;
        const bpm = 75;
        const noteMs = (60 / bpm) * 1000 * 2; // Half notes

        this._bassInterval = setInterval(() => {
            if (!this.musicPlaying) return;

            const freq = bassNotes[noteIdx % bassNotes.length];
            this._musicTone(freq, 0.8, 'sawtooth', 0.08);
            this._musicTone(freq, 0.9, 'sine', 0.12);

            noteIdx++;
        }, noteMs);
    }

    // Desert wind ambience
    _startWindAmbience() {
        // Filtered noise for wind
        const bufferSize = this.ctx.sampleRate * 4;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        // Brown noise (deeper, wind-like)
        let last = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            last = (last + 0.02 * white) / 1.02;
            data[i] = last * 3.5;
        }

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 400;
        filter.Q.value = 0.5;

        // LFO on filter for gusting wind effect
        const windLfo = this.ctx.createOscillator();
        const windLfoGain = this.ctx.createGain();
        windLfo.type = 'sine';
        windLfo.frequency.value = 0.15; // Slow gusting
        windLfoGain.gain.value = 200;
        windLfo.connect(windLfoGain);
        windLfoGain.connect(filter.frequency);
        windLfo.start();

        const windGain = this.ctx.createGain();
        windGain.gain.value = 0.3;

        source.connect(filter);
        filter.connect(windGain);
        windGain.connect(this.musicGain);
        source.start();
    }

    // Helper: play a tone through the music bus
    _musicTone(freq, duration, type, volume, delay = 0) {
        if (!this.musicGain) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(volume, this.ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + delay + duration);
        osc.connect(gain);
        gain.connect(this.musicGain);
        osc.start(this.ctx.currentTime + delay);
        osc.stop(this.ctx.currentTime + delay + duration + 0.01);
    }

    // Helper: noise through music bus
    _musicNoise(duration, volume) {
        if (!this.musicGain) return;
        const bufferSize = Math.floor(this.ctx.sampleRate * duration);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(volume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        source.connect(gain);
        gain.connect(this.musicGain);
        source.start();
    }

    // Helper: filtered noise (hi-hats, shakers)
    _musicNoiseFiltered(duration, volume, filterFreq) {
        if (!this.musicGain) return;
        const bufferSize = Math.floor(this.ctx.sampleRate * duration);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = filterFreq;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(volume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.musicGain);
        source.start();
    }

    speak(text, priority = false) {
        if (!this.voiceReady || !this.enabled) return;

        if (priority) {
            // Priority messages: clear queue, cancel current speech, speak immediately
            this.speechQueue = [];
            if (speechSynthesis.speaking) {
                speechSynthesis.cancel();
            }
            this._isSpeaking = false;
            this._doSpeak(text);
            return;
        }

        // Non-priority: queue it up, don't interrupt
        if (this._isSpeaking || speechSynthesis.speaking) {
            // Add to queue if not too long (max 3 queued messages)
            if (this.speechQueue.length < 3) {
                // Don't add duplicate of what's already queued
                if (!this.speechQueue.includes(text)) {
                    this.speechQueue.push(text);
                }
            }
            return;
        }

        this._doSpeak(text);
    }

    _doSpeak(text) {
        this._isSpeaking = true;
        const utter = new SpeechSynthesisUtterance(text);
        if (this.voice) utter.voice = this.voice;
        utter.rate = 0.95;   // Natural pace
        utter.pitch = 1.1;   // Slightly higher for female tone
        utter.volume = 0.85;
        utter.onend = () => {
            this._isSpeaking = false;
            this.lastSpeech = Date.now();
            if (this.speechQueue.length > 0) {
                const next = this.speechQueue.shift();
                // Brief pause between queued messages
                setTimeout(() => {
                    if (!this._isSpeaking) {
                        this._doSpeak(next);
                    }
                }, 400);
            }
        };
        utter.onerror = () => {
            this._isSpeaking = false;
            this.lastSpeech = Date.now();
        };
        this.lastSpeech = Date.now();
        speechSynthesis.speak(utter);
    }

    // Throttle rapid-fire sounds (min ms between same sound)
    _throttle(sound, minInterval) {
        const now = Date.now();
        if (this.lastSoundTime[sound] && now - this.lastSoundTime[sound] < minInterval) {
            return true; // throttled
        }
        this.lastSoundTime[sound] = now;
        return false;
    }

    _ensureRunning() {
        if (!this.ctx) return false;
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        return this.ctx.state === 'running';
    }

    play(sound) {
        if (!this.enabled || !this.ctx) return;
        this._ensureRunning();

        switch (sound) {
            case 'click':
                this.playTone(800, 0.05, 'square', 0.1);
                break;

            case 'place':
                this.playTone(200, 0.15, 'square', 0.2);
                this.playTone(300, 0.15, 'square', 0.15, 0.08);
                break;

            // --- WEAPON SOUNDS ---

            case 'shoot':
                // Generic fallback
                if (this._throttle('shoot', 80)) break;
                this.playNoise(0.06, 0.25);
                this.playTone(180, 0.06, 'sawtooth', 0.15);
                break;

            case 'shoot_rifle':
                // Infantry rifle - sharp crack
                if (this._throttle('shoot_rifle', 100)) break;
                this.playNoise(0.03, 0.35);
                this.playTone(1200, 0.02, 'square', 0.2);
                this.playTone(600, 0.04, 'sawtooth', 0.1, 0.02);
                break;

            case 'shoot_rocket':
                // Rocket launcher - whoosh + hiss
                if (this._throttle('shoot_rocket', 200)) break;
                this.playNoise(0.15, 0.2);
                this.playTone(200, 0.3, 'sawtooth', 0.15);
                this.playToneRamp(800, 200, 0.3, 'sine', 0.1);
                break;

            case 'shoot_cannon':
                // Tank cannon - deep boom
                if (this._throttle('shoot_cannon', 150)) break;
                this.playNoise(0.1, 0.45);
                this.playTone(80, 0.12, 'sawtooth', 0.3);
                this.playTone(60, 0.15, 'square', 0.2, 0.03);
                break;

            case 'shoot_sniper':
                // Sniper rifle - sharp high crack with echo
                if (this._throttle('shoot_sniper', 300)) break;
                this.playNoise(0.06, 0.25);
                this.playTone(2200, 0.015, 'square', 0.3);
                this.playTone(800, 0.04, 'sawtooth', 0.15, 0.02);
                // Echo/reverb tail
                this.playNoise(0.02, 0.4, 0.1);
                this.playTone(600, 0.03, 'sine', 0.06, 0.15);
                break;

            case 'shoot_machinegun':
                // Light vehicle MG - rapid rattle
                if (this._throttle('shoot_machinegun', 60)) break;
                this.playNoise(0.025, 0.3);
                this.playTone(900, 0.02, 'square', 0.15);
                this.playTone(700, 0.02, 'square', 0.1, 0.02);
                break;

            case 'shoot_siege':
                // Siege tank - massive blast
                if (this._throttle('shoot_siege', 250)) break;
                this.playNoise(0.2, 0.5);
                this.playTone(50, 0.2, 'sawtooth', 0.4);
                this.playTone(35, 0.25, 'square', 0.25, 0.05);
                this.playTone(100, 0.1, 'sawtooth', 0.15, 0.1);
                break;

            case 'shoot_cannon':
                // Devastator heavy autocannon — deep rapid thump
                if (this._throttle('shoot_cannon', 150)) break;
                this.playNoise(0.12, 0.45);
                this.playTone(70, 0.15, 'sawtooth', 0.35);
                this.playTone(45, 0.2, 'square', 0.25, 0.04);
                this.playTone(150, 0.06, 'sawtooth', 0.15, 0.08);
                break;

            case 'shoot_turret':
                // Turret - heavy repeating fire
                if (this._throttle('shoot_turret', 120)) break;
                this.playNoise(0.08, 0.35);
                this.playTone(250, 0.08, 'sawtooth', 0.25);
                this.playTone(120, 0.1, 'square', 0.15, 0.04);
                break;

            // --- IMPACT / DAMAGE SOUNDS ---

            case 'hit_small':
                // Bullet impact - ping/thud
                if (this._throttle('hit_small', 60)) break;
                this.playNoise(0.03, 0.15);
                this.playTone(400 + Math.random() * 200, 0.03, 'square', 0.1);
                break;

            case 'hit_explosion':
                // Explosive impact - boom
                if (this._throttle('hit_explosion', 100)) break;
                this.playNoise(0.15, 0.4);
                this.playTone(80, 0.15, 'sawtooth', 0.3);
                this.playTone(50, 0.2, 'sine', 0.2, 0.05);
                break;

            // --- DESTRUCTION SOUNDS ---

            case 'explosion':
                // Unit/building destroyed - big explosion
                this.playNoise(0.4, 0.6);
                this.playTone(50, 0.35, 'sawtooth', 0.45);
                this.playTone(30, 0.5, 'sine', 0.3, 0.1);
                this.playTone(80, 0.2, 'square', 0.2, 0.15);
                break;

            case 'explosion_big':
                // Building destroyed - massive explosion
                this.playNoise(0.6, 0.7);
                this.playTone(40, 0.5, 'sawtooth', 0.5);
                this.playTone(25, 0.7, 'sine', 0.35, 0.1);
                this.playTone(60, 0.3, 'square', 0.25, 0.2);
                this.playTone(100, 0.15, 'sawtooth', 0.15, 0.35);
                break;

            case 'unit_killed':
                // Infantry death - short scream + thud
                this.playTone(500, 0.08, 'sawtooth', 0.2);
                this.playToneRamp(500, 200, 0.15, 'sawtooth', 0.15);
                this.playNoise(0.1, 0.2);
                break;

            case 'vehicle_destroyed':
                // Vehicle exploding - crunch + fire
                this.playNoise(0.5, 0.55);
                this.playTone(60, 0.3, 'sawtooth', 0.4);
                this.playTone(45, 0.4, 'sine', 0.3, 0.1);
                // Metal crunch
                this.playTone(300, 0.05, 'square', 0.2, 0.05);
                this.playTone(200, 0.08, 'square', 0.15, 0.1);
                // Crackling fire
                this.playNoise(0.8, 0.15, 0.3);
                break;

            case 'building_destroyed':
                // Building collapse - rumble + debris
                this.playNoise(0.8, 0.7);
                this.playTone(30, 0.6, 'sawtooth', 0.5);
                this.playTone(20, 0.8, 'sine', 0.35, 0.15);
                this.playTone(50, 0.4, 'square', 0.3, 0.3);
                // Debris
                this.playTone(400, 0.05, 'square', 0.15, 0.4);
                this.playTone(250, 0.08, 'square', 0.1, 0.5);
                break;

            // --- C4 SOUNDS ---

            case 'c4_plant':
                // Mechanical click/attach sound
                this.playTone(200, 0.05, 'square', 0.3);
                this.playTone(150, 0.08, 'square', 0.2, 0.06);
                this.playNoise(0.1, 0.15, 0.1);
                // Arming beep
                this.playTone(1200, 0.08, 'sine', 0.25, 0.2);
                this.playTone(1200, 0.08, 'sine', 0.2, 0.4);
                break;

            case 'c4_beep':
                // Warning beep — short high-pitched
                if (!this._throttle('c4_beep', 600)) break;
                this.playTone(1400, 0.06, 'sine', 0.2);
                break;

            case 'c4_explode':
                // Massive C4 detonation — deeper and longer than normal explosion
                this.playNoise(0.8, 0.8);
                this.playTone(35, 0.7, 'sawtooth', 0.6);
                this.playTone(20, 1.0, 'sine', 0.4, 0.1);
                this.playTone(55, 0.5, 'square', 0.35, 0.15);
                this.playTone(80, 0.3, 'sawtooth', 0.2, 0.3);
                // Secondary explosion
                this.playNoise(0.5, 0.5, 0.4);
                this.playTone(40, 0.4, 'sawtooth', 0.3, 0.5);
                break;

            // --- UI / OTHER ---

            case 'unitReady':
                this.playTone(440, 0.1, 'square', 0.15);
                this.playTone(550, 0.1, 'square', 0.15, 0.1);
                this.playTone(660, 0.15, 'square', 0.15, 0.2);
                break;

            case 'buildComplete':
                this.playTone(330, 0.1, 'sine', 0.2);
                this.playTone(440, 0.1, 'sine', 0.2, 0.1);
                this.playTone(550, 0.15, 'sine', 0.2, 0.2);
                this.playTone(660, 0.2, 'sine', 0.2, 0.3);
                break;

            case 'cash':
                this.playTone(1000, 0.05, 'sine', 0.1);
                this.playTone(1200, 0.05, 'sine', 0.1, 0.05);
                break;

            case 'select':
                this.playTone(600, 0.05, 'sine', 0.08);
                break;

            case 'move':
                this.playTone(400, 0.05, 'sine', 0.08);
                this.playTone(500, 0.05, 'sine', 0.08, 0.05);
                break;

            case 'worm':
                this.playTone(50, 0.8, 'sawtooth', 0.4);
                this.playTone(35, 1.0, 'sine', 0.3, 0.2);
                break;

            case 'repair':
                if (this._throttle('repair', 500)) break;
                this.playTone(800, 0.05, 'square', 0.08);
                this.playTone(1000, 0.05, 'square', 0.06, 0.06);
                this.playTone(800, 0.05, 'square', 0.08, 0.12);
                break;
        }
    }

    playTone(freq, duration, type, volume, delay = 0) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(volume, this.ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + delay + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(this.ctx.currentTime + delay);
        osc.stop(this.ctx.currentTime + delay + duration);
    }

    // Frequency sweep (ramp from startFreq to endFreq)
    playToneRamp(startFreq, endFreq, duration, type, volume, delay = 0) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(startFreq, this.ctx.currentTime + delay);
        osc.frequency.linearRampToValueAtTime(endFreq, this.ctx.currentTime + delay + duration);
        gain.gain.setValueAtTime(volume, this.ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + delay + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(this.ctx.currentTime + delay);
        osc.stop(this.ctx.currentTime + delay + duration);
    }

    playNoise(duration, volume, delay = 0) {
        const bufferSize = Math.floor(this.ctx.sampleRate * duration);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(volume, this.ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + delay + duration);
        source.connect(gain);
        gain.connect(this.ctx.destination);
        source.start(this.ctx.currentTime + delay);
    }
}
