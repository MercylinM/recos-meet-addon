export const AUDIO_CONFIG = {
    sampleRate: 16000,
    channelCount: 1,
    bufferSize: 4096,
    encoding: 'pcm' as const,
    bitDepth: 16
};

export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://add-on-backend.onrender.com';