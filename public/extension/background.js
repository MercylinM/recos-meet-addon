let isCapturing = false;
let currentTabId = null;
let mediaStream = null;
let audioContext = null;
let processor = null;
let socket = null;

function initAudioProcessing(stream) {
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);

    processor = audioContext.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);

        const downsampledData = downsample(inputData, audioContext.sampleRate, 16000);

        const pcmData = convertFloatTo16BitPCM(downsampledData);

        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(pcmData);
        }
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
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
    if (socket) {
        socket.close();
    }

    socket = new WebSocket(url);

    socket.onopen = () => {
        console.log('WebSocket connected');
    };

    socket.onclose = () => {
        console.log('WebSocket disconnected');
        socket = null;

        if (isCapturing) {
            setTimeout(() => {
                if (isCapturing) {
                    chrome.storage.sync.get(['backendUrl'], function (result) {
                        if (result.backendUrl) {
                            connectWebSocket(result.backendUrl);
                        }
                    });
                }
            }, 5000);
        }
    };

    socket.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

async function startCapture() {
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];

        if (!tab || !tab.url.includes('meet.google.com')) {
            return { success: false, error: 'Not a Google Meet tab' };
        }

        currentTabId = tab.id;

        const result = await chrome.storage.sync.get(['backendUrl']);
        const backendUrl = result.backendUrl;

        if (!backendUrl) {
            return { success: false, error: 'Backend URL not configured' };
        }

        connectWebSocket(backendUrl);

        const streamId = await new Promise((resolve) => {
            chrome.desktopCapture.chooseDesktopMedia(
                ['tab', 'audio'],
                tab,
                (streamId, options) => {
                    resolve(streamId);
                }
            );
        });

        if (!streamId) {
            return { success: false, error: 'User cancelled or no stream available' };
        }

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: streamId
                }
            },
            video: false
        });

        mediaStream = stream;

        initAudioProcessing(stream);
        isCapturing = true;

        return { success: true };
    } catch (error) {
        console.error('Error starting capture:', error);
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
        audioContext.close();
        audioContext = null;
    }

    if (socket) {
        socket.close();
        socket = null;
    }

    isCapturing = false;
    currentTabId = null;

    return { success: true };
}

async function getStatus() {
    return { capturing: isCapturing };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case 'startCapture':
            startCapture().then(sendResponse);
            return true; 

        case 'stopCapture':
            const stopResult = stopCapture();
            sendResponse(stopResult);
            break;

        case 'getStatus':
            getStatus().then(sendResponse);
            return true;

        case 'pageUnloaded':
            if (currentTabId && request.url.includes('meet.google.com')) {
                stopCapture();
            }
            sendResponse({ success: true });
            break;
    }
});

chrome.runtime.onSuspend.addListener(() => {
    stopCapture();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (currentTabId === tabId && changeInfo.status === 'complete') {
        if (!tab.url.includes('meet.google.com')) {
            stopCapture();
        }
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    if (currentTabId === tabId) {
        // Tab was closed
        stopCapture();
    }
});

