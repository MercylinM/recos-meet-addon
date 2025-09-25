document.addEventListener('DOMContentLoaded', function () {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const statusDiv = document.getElementById('status');
    const backendUrlInput = document.getElementById('backendUrl');
    const saveSettingsBtn = document.getElementById('saveSettings');
    const settingsStatusDiv = document.getElementById('settingsStatus');

    chrome.storage.sync.get(['backendUrl'], function (result) {
        if (result.backendUrl) {
            backendUrlInput.value = result.backendUrl;
        }
    });

    saveSettingsBtn.addEventListener('click', function () {
        const backendUrl = backendUrlInput.value.trim();
        chrome.storage.sync.set({ backendUrl: backendUrl }, function () {
            settingsStatusDiv.textContent = 'Settings saved!';
            setTimeout(() => {
                settingsStatusDiv.textContent = '';
            }, 2000);
        });
    });

    function updateStatus(status, type = 'inactive') {
        statusDiv.textContent = status;
        statusDiv.className = `status-${type}`;
    }

    startBtn.addEventListener('click', async function () {
        const backendUrl = backendUrlInput.value.trim();
        if (!backendUrl) {
            updateStatus('Please enter a backend URL', 'error');
            return;
        }

        chrome.storage.sync.set({ backendUrl: backendUrl }, function () {
            chrome.runtime.sendMessage({ action: 'startCapture' }, function (response) {
                if (response && response.success) {
                    updateStatus('Capturing audio...', 'active');
                    startBtn.disabled = true;
                    stopBtn.disabled = false;
                } else {
                    updateStatus('Failed to start capture: ' + (response.error || 'Unknown error'), 'error');
                }
            });
        });
    });

    stopBtn.addEventListener('click', function () {
        chrome.runtime.sendMessage({ action: 'stopCapture' }, function (response) {
            if (response && response.success) {
                updateStatus('Capture stopped', 'inactive');
                startBtn.disabled = false;
                stopBtn.disabled = true;
            } else {
                updateStatus('Failed to stop capture: ' + (response.error || 'Unknown error'), 'error');
            }
        });
    });

    chrome.runtime.sendMessage({ action: 'getStatus' }, function (response) {
        if (response && response.capturing) {
            updateStatus('Capturing audio...', 'active');
            startBtn.disabled = true;
            stopBtn.disabled = false;
        }
    });
});