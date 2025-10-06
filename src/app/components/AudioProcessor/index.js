class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferSize = 4096;
        this.buffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0;
    }

    process(inputs, outputs, parameters) {
        const inputChannel = inputs[0] && inputs[0][0];

        if (!inputChannel) {
            // If there's data in the buffer when input ends, send it
            if (this.bufferIndex > 0) {
                const partialBuffer = this.buffer.slice(0, this.bufferIndex);
                const pcmBuffer = this.convertFloatTo16BitPCM(partialBuffer);
                try {
                    this.port.postMessage({ type: 'audioData', buffer: pcmBuffer }, [pcmBuffer]);
                } catch (error) {
                    console.error('Error posting audio data:', error);
                    this.port.postMessage({ type: 'audioData', buffer: pcmBuffer });
                }
                this.bufferIndex = 0;
            }
            return true;
        }

        // Process audio in chunks
        for (let i = 0; i < inputChannel.length; i++) {
            this.buffer[this.bufferIndex++] = inputChannel[i];

            if (this.bufferIndex === this.bufferSize) {
                // Convert float to 16-bit PCM and send
                const pcmBuffer = this.convertFloatTo16BitPCM(this.buffer);
                try {
                    this.port.postMessage({ type: 'audioData', buffer: pcmBuffer }, [pcmBuffer]);
                } catch (error) {
                    console.error('Error posting audio data:', error);
                    this.port.postMessage({ type: 'audioData', buffer: pcmBuffer });
                }
                this.bufferIndex = 0;
            }
        }

        return true;
    }

    // Helper function to convert float to 16-bit PCM
    convertFloatTo16BitPCM(float32Array) {
        const buffer = new ArrayBuffer(float32Array.length * 2);
        const view = new DataView(buffer);
        let offset = 0;
        for (let i = 0; i < float32Array.length; i++, offset += 2) {
            let s = Math.max(-1, Math.min(1, float32Array[i]));
            s = s < 0 ? s * 0x8000 : s * 0x7FFF;
            view.setInt16(offset, s, true); // little-endian
        }
        return buffer;
    }
}

registerProcessor('audio-processor', AudioProcessor);