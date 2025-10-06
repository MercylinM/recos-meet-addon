/* eslint-disable @typescript-eslint/no-explicit-any */
import { AudioMetrics } from '../types';
import { AUDIO_CONFIG } from './constants';

export class RealTimeAudioCapture {
    private mediaStream: MediaStream | null = null;
    private audioContext: AudioContext | null = null;
    private audioWorklet: AudioWorkletNode | null = null;
    private analyser: AnalyserNode | null = null;
    private gainNode: GainNode | null = null;
    private isCapturing = false;
    private ws: WebSocket | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 1000;
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private metrics: AudioMetrics = {
        bytesTransmitted: 0,
        packetsLost: 0,
        averageLatency: 0,
        connectionTime: 0,
        bytesReceived: 0,
        lastAckTime: 0
    };

    constructor(
        private backendUrl: string,
        private onStatusChange: (status: string) => void,
        private onMetricsUpdate: (metrics: AudioMetrics) => void,
        private onTranscriptReceived: (data: any) => void
    ) { }

    async requestPermissions(): Promise<boolean> {
        try {
            const micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: AUDIO_CONFIG.sampleRate,
                    channelCount: AUDIO_CONFIG.channelCount
                }
            });

            micStream.getTracks().forEach(track => track.stop());
            this.onStatusChange('Audio permissions granted');
            return true;

        } catch (error: any) {
            console.error('[AudioCapture] Permission denied:', error);
            this.onStatusChange(`Permission denied: ${error.name}`);
            return false;
        }
    }

    private async createAudioWorklet(): Promise<AudioWorkletNode> {
        if (!this.audioContext) {
            throw new Error('AudioContext not initialized');
        }

        const workletCode = `
      class AudioProcessor extends AudioWorkletProcessor {
        process(inputs, outputs, parameters) {
          const input = inputs[0];
          
          if (input && input.length > 0) {
            const inputChannel = input[0];
            const bufferSize = inputChannel.length;
            
            const int16Buffer = new Int16Array(bufferSize);
            for (let i = 0; i < bufferSize; i++) {
              const sample = Math.max(-1, Math.min(1, inputChannel[i]));
              int16Buffer[i] = sample * 0x7FFF;
            }
            
            this.port.postMessage({
              buffer: int16Buffer.buffer,
              byteLength: int16Buffer.buffer.byteLength
            }, [int16Buffer.buffer]);
          }
          
          return true;
        }
      }
      
      registerProcessor('audio-processor', AudioProcessor);
    `;

        const blob = new Blob([workletCode], { type: 'application/javascript' });
        const workletUrl = URL.createObjectURL(blob);

        try {
            await this.audioContext.audioWorklet.addModule(workletUrl);
            return new AudioWorkletNode(this.audioContext, 'audio-processor');
        } finally {
            URL.revokeObjectURL(workletUrl);
        }
    }

    private async connectWebSocket(): Promise<boolean> {
        return new Promise((resolve) => {
            try {
                const wsUrl = this.backendUrl.replace(/^http/, 'ws') + '/ws/audio';
                console.log('[AudioCapture] Connecting to:', wsUrl);

                this.ws = new WebSocket(wsUrl);

                const connectTimeout = setTimeout(() => {
                    if (this.ws?.readyState !== WebSocket.OPEN) {
                        this.ws?.close();
                        this.onStatusChange('Audio connection timeout');
                        resolve(false);
                    }
                }, 10000);

                this.ws.onopen = () => {
                    clearTimeout(connectTimeout);
                    this.reconnectAttempts = 0;
                    this.onStatusChange('Audio connection established');
                    console.log('[AudioCapture] WebSocket connected');
                    this.startHeartbeat();
                    resolve(true);
                };

                this.ws.onclose = (event) => {
                    clearTimeout(connectTimeout);
                    console.log(`[AudioCapture] WebSocket closed: ${event.code} - ${event.reason}`);
                    this.onStatusChange('Audio connection lost');
                    this.stopHeartbeat();

                    if (this.isCapturing && this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.attemptReconnection();
                    } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                        this.onStatusChange('Max audio reconnection attempts reached');
                        this.stopCapture();
                    }
                };

                this.ws.onerror = (errorEvent) => {
                    clearTimeout(connectTimeout);
                    console.error('[AudioCapture] WebSocket error:', errorEvent);
                    this.onStatusChange('Audio connection error');

                    if (!window.navigator.onLine) {
                        this.onStatusChange('Network connection lost');
                    }
                    resolve(false);
                };

                this.ws.onmessage = (event) => {
                    try {
                        if (typeof event.data === 'string') {
                            const data = JSON.parse(event.data);

                            if (data.message_type || data.transcript) {
                                this.onTranscriptReceived(data);
                            } else if (data.type === 'audio_ack') {
                                this.metrics.bytesReceived = (this.metrics.bytesReceived || 0) + (data.bytes_received || 0);
                                this.metrics.lastAckTime = data.timestamp;
                                this.metrics.averageLatency = Date.now() - data.timestamp;
                                this.onMetricsUpdate(this.metrics);
                            } else if (data.type === 'pong') {
                                const latency = Date.now() - data.timestamp;
                                this.metrics.averageLatency = (this.metrics.averageLatency + latency) / 2;
                            }
                        }
                    } catch (error) {
                        console.debug('[AudioCapture] Non-JSON message received');
                    }
                };

            } catch (error) {
                console.error('[AudioCapture] WebSocket creation failed:', error);
                this.onStatusChange('Failed to create audio connection');
                resolve(false);
            }
        });
    }

    private startHeartbeat(): void {
        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                try {
                    this.ws.send(JSON.stringify({
                        type: 'ping',
                        timestamp: Date.now()
                    }));
                } catch (error) {
                    console.error('[AudioCapture] Failed to send heartbeat:', error);
                }
            }
        }, 30000);
    }

    private stopHeartbeat(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    private attemptReconnection(): void {
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

        this.onStatusChange(`Reconnecting audio... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        setTimeout(async () => {
            if (this.isCapturing) {
                const connected = await this.connectWebSocket();
                if (!connected && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.attemptReconnection();
                } else if (!connected) {
                    this.onStatusChange('Max audio reconnection attempts reached');
                    await this.stopCapture();
                }
            }
        }, delay);
    }

    async startCapture(): Promise<boolean> {
        try {
            if (this.isCapturing) {
                console.warn('[AudioCapture] Already capturing');
                return true;
            }

            this.audioContext = new AudioContext({
                sampleRate: AUDIO_CONFIG.sampleRate
            });

            const wsConnected = await this.connectWebSocket();
            if (!wsConnected) {
                throw new Error('Failed to connect to audio WebSocket');
            }

            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: AUDIO_CONFIG.sampleRate,
                    channelCount: AUDIO_CONFIG.channelCount
                }
            });

            this.audioWorklet = await this.createAudioWorklet();

            const source = this.audioContext.createMediaStreamSource(this.mediaStream);

            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;

            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.value = 1.0;

            source.connect(this.analyser);
            this.analyser.connect(this.gainNode);
            this.gainNode.connect(this.audioWorklet);
            this.audioWorklet.connect(this.audioContext.destination);

            this.audioWorklet.port.onmessage = (event) => {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    try {
                        this.ws.send(event.data.buffer);
                        this.metrics.bytesTransmitted += event.data.byteLength;
                        this.onMetricsUpdate(this.metrics);
                    } catch (error) {
                        console.error('[AudioCapture] Failed to send audio data:', error);
                    }
                }
            };

            this.isCapturing = true;
            this.metrics.connectionTime = Date.now();
            this.onMetricsUpdate(this.metrics);
            this.onStatusChange('Audio capture started');

            return true;

        } catch (error) {
            console.error('[AudioCapture] Failed to start capture:', error);
            this.onStatusChange(`Start capture failed: ${error}`);

            await this.stopCapture();
            return false;
        }
    }

    async stopCapture(): Promise<void> {
        this.isCapturing = false;

        this.stopHeartbeat();

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        if (this.audioContext) {
            await this.audioContext.close();
            this.audioContext = null;
        }

        this.audioWorklet = null;
        this.analyser = null;
        this.gainNode = null;

        this.reconnectAttempts = 0;
        this.onStatusChange('Audio capture stopped');
    }

    getAudioLevel(): number {
        if (!this.analyser) return 0;

        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        this.analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
        }
        return sum / bufferLength / 255;
    }

    isActive(): boolean {
        return this.isCapturing;
    }

    getMetrics(): AudioMetrics {
        return { ...this.metrics };
    }
}