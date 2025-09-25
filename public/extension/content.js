console.log('Meet Audio Capture content script loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getMeetingInfo') {
        const meetingCode = window.location.pathname.split('/')[1];
        sendResponse({ meetingCode: meetingCode });
    }
    return true;
});

window.addEventListener('beforeunload', () => {
    chrome.runtime.sendMessage({ action: 'pageUnloaded', url: window.location.href });
});