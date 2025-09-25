let audioContext = null;
let processor = null;
let socket = null;
let mediaStream = null;
let isCapturing = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

function initAudioProcessing(stream) {
    try {
        audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);

        processor = audioContext.createScriptProcessor(4096, 1, 1);

        processor.onaudioprocess = (event) => {
            if (!socket || socket.readyState !== WebSocket.OPEN) {
                return;
            }

            const inputData = event.inputBuffer.getChannelData(0);
            const downsampledData = downsample(inputData, audioContext.sampleRate, 16000);
            const pcmData = convertFloatTo16BitPCM(downsampledData);

            if (socket.readyState === WebSocket.OPEN) {
                socket.send(pcmData);
            }
        };

        source.connect(processor);
        processor.connect(audioContext.destination);

        return true;
    } catch (error) {
        console.error('Error initializing audio processing:', error);
        return false;
    }
}

function downsample(buffer, inputSampleRate, outputSampleRate) {
    if (inputSampleRate === outputSampleRate) {
        return buffer;
    }

    const sampleRateRatio = inputSampleRate / outputSampleRate;
    const newLength = Math.round(buffer.length / sampleRateRatio);
    const result = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
        const index = Math.round(i * sampleRateRatio);
        result[i] = buffer[index];
    }

    return result;
}

function convertFloatTo16BitPCM(float32Array) {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    let offset = 0;

    for (let i = 0; i < float32Array.length; i++, offset += 2) {
        let s = Math.max(-1, Math.min(1, float32Array[i]));
        s = s < 0 ? s * 0x8000 : s * 0x7FFF;
        view.setInt16(offset, s, true);
    }

    return buffer;
}

function connectWebSocket(url) {
    return new Promise((resolve, reject) => {
        if (socket) {
            socket.close();
        }

        socket = new WebSocket(url);

        socket.onopen = () => {
            console.log('WebSocket connected in offscreen document');
            reconnectAttempts = 0;
            resolve();
        };

        socket.onclose = (event) => {
            console.log('WebSocket disconnected in offscreen document:', event.code, event.reason);

            if (isCapturing && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                console.log(`Attempting to reconnect... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
                setTimeout(() => {
                    if (isCapturing) {
                        connectWebSocket(url).catch(console.error);
                    }
                }, 2000 * reconnectAttempts);
            }
        };

        socket.onerror = (error) => {
            console.error('WebSocket error in offscreen document:', error);
            reject(error);
        };

        setTimeout(() => {
            if (socket.readyState === WebSocket.CONNECTING) {
                socket.close();
                reject(new Error('WebSocket connection timeout'));
            }
        }, 10000);
    });
}

async function startCapture(tabId = null) {
    try {
        if (isCapturing) {
            return { success: false, error: 'Capture already in progress' };
        }

        const getStorage = (keys) =>
            new Promise((resolve) => chrome.storage.sync.get(keys, resolve));

        const result = await getStorage(['backendUrl']);
        const backendUrl = result.backendUrl;

        if (!backendUrl) {
            return { success: false, error: 'Backend URL not configured' };
        }

        await connectWebSocket(backendUrl);

        let streamId;

        if (tabId) {
            streamId = await chrome.tabCapture.getMediaStreamId({
                targetTabId: tabId,
                audio: true,
                video: false
            });
        } else {
            streamId = await chrome.tabCapture.getMediaStreamId({
                audio: true,
                video: false
            });
        }

        if (!streamId) {
            return { success: false, error: 'Failed to get media stream ID' };
        }

        mediaStream = await new Promise((resolve, reject) => {
            chrome.tabCapture.capture({
                audio: true,
                video: false,
                audioConstraints: {
                    mandatory: {
                        chromeMediaSource: 'tab',
                        chromeMediaSourceId: streamId
                    }
                }
            }, (stream) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (!stream) {
                    reject(new Error('Failed to capture tab audio'));
                } else {
                    resolve(stream);
                }
            });
        });

        const audioInitSuccess = initAudioProcessing(mediaStream);
        if (!audioInitSuccess) {
            throw new Error('Failed to initialize audio processing');
        }

        isCapturing = true;
        return { success: true };

    } catch (error) {
        console.error('Error starting capture in offscreen document:', error);

        stopCapture();

        return { success: false, error: error.message };
    }
}

function stopCapture() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }

    if (processor) {
        processor.disconnect();
        processor = null;
    }

    if (audioContext) {
        audioContext.close().catch(console.error);
        audioContext = null;
    }

    if (socket) {
        socket.close();
        socket = null;
    }

    isCapturing = false;
    reconnectAttempts = 0;

    return { success: true };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case 'startCapture':
            startCapture(request.tabId).then(sendResponse);
            return true;

        case 'stopCapture':
            const stopResult = stopCapture();
            sendResponse(stopResult);
            return true;

        case 'getStatus':
            sendResponse({ capturing: isCapturing });
            return true;
    }
});