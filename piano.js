const Piano = {
    audioContext: null,
    pianoSampleBuffer: null,
    // Using a publicly available A4 piano sample
    sampleUrl: 'https://gleitz.github.io/midi-js-soundfonts/MusyngKite/acoustic_grand_piano-mp3/A4.mp3',
    originalFrequency: 440, // Frequency of the A4 sample
    activeSources: {}, // To manage playing piano notes

    init(audioCtx) {
        this.audioContext = audioCtx;
        if (this.audioContext) {
            this.loadSample();
        } else {
            console.error('Piano: AudioContext not provided for initialization.');
        }
    },

    async loadSample() {
        if (!this.audioContext) {
            console.error('Piano: Cannot load sample, AudioContext is not initialized.');
            return;
        }
        if (this.pianoSampleBuffer) {
            console.log('Piano: Sample already loaded.');
            return;
        }

        try {
            console.log(`Piano: Loading sample from ${this.sampleUrl}`);
            const response = await fetch(this.sampleUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            this.pianoSampleBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            console.log('Piano: Sample loaded and decoded successfully.');
        } catch (e) {
            console.error('Piano: Error loading or decoding sample:', e);
            // Fallback or error indication could be handled here
        }
    },

    play(frequency) {
        if (!this.audioContext || !this.pianoSampleBuffer) {
            console.warn('Piano: Sample not loaded or AudioContext not available. Cannot play note.');
            return null; // Indicate that playback failed
        }

        // Stop any existing note at this frequency before playing a new one
        if (this.activeSources[frequency]) {
            try {
                this.activeSources[frequency].source.stop();
            } catch (e) {
                // Ignore errors if source already stopped
            }
            delete this.activeSources[frequency];
        }

        const source = this.audioContext.createBufferSource();
        source.buffer = this.pianoSampleBuffer;

        const gainNode = this.audioContext.createGain();
        // Further increased volume
        const now = this.audioContext.currentTime;
        gainNode.gain.setValueAtTime(1.5, now); // Increased initial volume further
        // Hold at a sustain level, then decay.
        // This is a simplified ADSR-like envelope.
        // Attack (implicit, very fast with setValueAtTime)
        // Decay to sustain level
        gainNode.gain.linearRampToValueAtTime(1.3, now + 0.1); // Increased sustain level further
        // Sustain (this level is held until stop is called or note naturally ends)
        // Release (handled by Piano.stop or natural end of sample + ramp)
        // Set a long ramp to simulate sustain, which will be cut short by Piano.stop
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 5); // Long potential decay (e.g., 5 seconds)

        source.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        // Adjust playback rate to change the pitch
        // playbackRate = desiredFrequency / originalFrequencyOfSample
        source.playbackRate.value = frequency / this.originalFrequency;

        source.start(this.audioContext.currentTime);

        this.activeSources[frequency] = { source, gainNode };

        source.onended = () => {
            // Clean up when the sound finishes
            if (this.activeSources[frequency] && this.activeSources[frequency].source === source) {
                delete this.activeSources[frequency];
            }
        };
        
        return source; // Return the source node
    },

    stop(frequency) {
        if (this.activeSources[frequency]) {
            const { source, gainNode } = this.activeSources[frequency];
            // When stop is called (e.g., on key release), initiate a release phase for the envelope.
            if (gainNode && source) {
                const now = this.audioContext.currentTime;
                try {
                    // Cancel any scheduled changes after the current time
                    gainNode.gain.cancelScheduledValues(now);
                    // Set current value to ensure smooth transition
                    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
                    // Apply a release ramp (e.g., 0.5 seconds to fade out)
                    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
                    // Stop the source after the release ramp is complete
                    source.stop(now + 0.51);
                } catch(e) {
                    // Source might have already stopped or not started, or other minor issues.
                    console.warn(`Piano.stop: Error during stopping process for frequency ${frequency}:`, e);
                    // Ensure cleanup even if there's an error
                    if (source && typeof source.stop === 'function') {
                        try { source.stop(); } catch (stopErr) { /* ignore */ }
                    }
                }
            }
            delete this.activeSources[frequency];
        }
    }
};
