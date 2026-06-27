const video = document.getElementById('mobile-video');
const canvas = document.getElementById('capture-canvas');
const select = document.getElementById('camera-select');
const streamBtn = document.getElementById('stream-btn');
const statusBadge = document.getElementById('connection-status');

let currentStream = null;
let socket = null;
let streamInterval = null;
let isStreaming = false;
const FPS = 12; // Adequate frame rate for streaming with low overhead

// Connect WebSocket to backend
function connectWebSocket() {
    return new Promise((resolve) => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            resolve(true);
            return;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/camera`;
        
        console.log(`Connecting camera WebSocket to: ${wsUrl}`);
        socket = new WebSocket(wsUrl);
        socket.binaryType = 'blob';

        socket.onopen = () => {
            console.log("WebSocket connection established.");
            statusBadge.innerHTML = `<span class="status-dot" style="width: 8px; height: 8px; background: currentColor; border-radius: 50%;"></span> Live Stream Connected`;
            statusBadge.className = "status-badge status-connected";
            resolve(true);
        };

        socket.onclose = () => {
            console.log("WebSocket connection closed.");
            statusBadge.innerHTML = `<span class="status-dot" style="width: 8px; height: 8px; background: currentColor; border-radius: 50%;"></span> Disconnected`;
            statusBadge.className = "status-badge status-disconnected";
            stopStreaming();
            resolve(false);
        };

        socket.onerror = (err) => {
            console.error("WebSocket error:", err);
            resolve(false);
        };
    });
}

// Get lists of video inputs
async function getCameraDevices() {
    try {
        if (!navigator.mediaDevices) {
            throw new Error("navigator.mediaDevices is undefined. Secure context (HTTPS or localhost) is required.");
        }
        await navigator.mediaDevices.getUserMedia({ video: true }); // Request permission first
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        select.innerHTML = '';
        
        if (videoDevices.length === 0) {
            select.innerHTML = '<option value="">No cameras detected</option>';
            return;
        }

        videoDevices.forEach((device, index) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            // Name detection or fallback
            let label = device.label || `Camera ${index + 1}`;
            
            // Helpful tagging for front/back
            if (label.toLowerCase().includes('back') || label.toLowerCase().includes('environment')) {
                label += ' (Rear Camera)';
            } else if (label.toLowerCase().includes('front') || label.toLowerCase().includes('user')) {
                label += ' (Front Camera)';
            }
            
            option.text = label;
            select.appendChild(option);
        });

        // Try to pre-select back camera (environment) by default for best quality palm pictures
        const backCamera = videoDevices.find(device => 
            device.label.toLowerCase().includes('back') || 
            device.label.toLowerCase().includes('environment')
        );
        if (backCamera) {
            select.value = backCamera.deviceId;
        }
    } catch (err) {
        console.error("Error listing cameras:", err);
        select.innerHTML = '<option value="">Error detecting cameras</option>';
        alert(`Debug Error: ${err.name || 'Error'}\nMessage: ${err.message || err}\nContext: Secure=${window.isSecureContext}, HTTPS=${window.location.protocol === 'https:'}`);
    }
}

// Start camera stream based on selected device ID
async function startCamera(deviceId = null) {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }

    const constraints = {
        video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: deviceId ? undefined : { ideal: 'environment' }
        }
    };

    if (deviceId) {
        constraints.video.deviceId = { exact: deviceId };
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        currentStream = stream;
        video.srcObject = stream;
        
        // Adjust guide mirrored view: front camera usually is mirrored
        const videoTrack = stream.getVideoTracks()[0];
        const settings = videoTrack.getSettings();
        if (settings.facingMode === 'user' || (select.options[select.selectedIndex] && select.options[select.selectedIndex].text.includes('Front'))) {
            video.style.transform = 'scaleX(-1)';
        } else {
            video.style.transform = 'scaleX(1)';
        }
    } catch (err) {
        console.error("Error accessing camera:", err);
        alert(`Could not access camera.\nError: ${err.name || 'Error'}\nMessage: ${err.message || err}`);
    }
}

// Capture current frame and send it as binary blob
function sendFrame() {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const ctx = canvas.getContext('2d');
    
    // Maintain correct aspect ratio and crop/fit to canvas
    // Ensure size is suitable (e.g. 480 width x 640 height vertical alignment)
    const cw = canvas.width;
    const ch = canvas.height;
    
    // Draw video feed scaled/centered inside canvas
    ctx.drawImage(video, 0, 0, cw, ch);
    
    // Convert to JPEG blob at 0.7 quality to keep payload small and fast over Wi-Fi
    canvas.toBlob((blob) => {
        if (blob && socket && socket.readyState === WebSocket.OPEN) {
            socket.send(blob);
        }
    }, 'image/jpeg', 0.7);
}

// Start WebSocket streaming
async function startStreaming() {
    const isConnected = await connectWebSocket();
    if (!isConnected) {
        alert("Failed to connect to backend server. Make sure the backend is running and reachable.");
        return;
    }

    if (streamInterval) clearInterval(streamInterval);
    
    streamInterval = setInterval(sendFrame, 1000 / FPS);
    isStreaming = true;
    
    streamBtn.textContent = "Stop Live Stream";
    streamBtn.className = "mobile-btn btn-stream-stop";
}

// Stop WebSocket streaming
function stopStreaming() {
    if (streamInterval) {
        clearInterval(streamInterval);
        streamInterval = null;
    }
    isStreaming = false;
    streamBtn.textContent = "Start Live Stream";
    streamBtn.className = "mobile-btn btn-stream-start";
}

// Event Listeners
select.addEventListener('change', async () => {
    const wasStreaming = isStreaming;
    if (wasStreaming) stopStreaming();
    
    await startCamera(select.value);
    
    if (wasStreaming) await startStreaming();
});

streamBtn.addEventListener('click', async () => {
    if (isStreaming) {
        stopStreaming();
        if (socket) socket.close();
    } else {
        await startStreaming();
    }
});

// Init on page load
window.addEventListener('load', async () => {
    await getCameraDevices();
    await startCamera(select.value || null);
});
