const canvas = document.getElementById('stream-canvas');
const ctx = canvas.getContext('2d');
const placeholder = document.getElementById('stream-placeholder');
const cameraStatusBadge = document.getElementById('camera-status');
const qrImg = document.getElementById('qr-img');
const qrText = document.getElementById('qr-text');

// Buttons
const verifyBtn = document.getElementById('verify-btn');
const payBtn = document.getElementById('pay-btn');
const registerBtn = document.getElementById('register-btn');

// Form inputs
const payAmountInput = document.getElementById('pay-amount');
const registerNameInput = document.getElementById('register-name');
const resultBox = document.getElementById('result-box');

let ws = null;
let lastFrameTime = 0;
let watchdogInterval = null;

// Adjust canvas resolution dynamically
canvas.width = 480;
canvas.height = 640;

// Fetch local server info to render QR Code and Link
async function fetchServerInfo() {
    try {
        const res = await fetch('/api/server_info');
        const data = await res.json();
        
        let mobileUrl = data.mobile_url;
        
        // If the current page is accessed over HTTPS (like ngrok), use the secure origin for the QR code
        if (window.location.protocol === 'https:') {
            mobileUrl = `${window.location.origin}/mobile.html`;
        }
        
        qrText.textContent = mobileUrl;
        
        // Generate QR code pointing to mobile stream endpoint
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(mobileUrl)}`;
        qrImg.src = qrApiUrl;
    } catch (err) {
        console.error("Error fetching server info:", err);
        qrText.textContent = "Error loading server info. Open /mobile.html on your phone.";
    }
}

// Establish WebSocket for receiving live camera feed
function connectDashboardWS() {
    if (ws && ws.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/dashboard`;
    
    console.log(`Connecting dashboard stream receiver WebSocket to: ${wsUrl}`);
    ws = new WebSocket(wsUrl);
    ws.binaryType = 'blob';

    ws.onopen = () => {
        console.log("Dashboard WebSocket connected.");
    };

    ws.onmessage = (event) => {
        const blob = event.data;
        if (!(blob instanceof Blob)) return;

        // Mark last frame time for the connection watchdog
        lastFrameTime = Date.now();
        setStreamOnline(true);

        // Draw image frame to canvas
        const img = new Image();
        img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(img.src);
        };
        img.src = URL.createObjectURL(blob);
    };

    ws.onclose = () => {
        console.log("Dashboard WebSocket closed. Reconnecting in 3s...");
        setStreamOnline(false);
        setTimeout(connectDashboardWS, 3000);
    };

    ws.onerror = (err) => {
        console.error("Dashboard WebSocket error:", err);
        setStreamOnline(false);
    };
}

// Check stream health - if no frames received in last 2 seconds, declare offline
function startWatchdog() {
    if (watchdogInterval) clearInterval(watchdogInterval);
    
    watchdogInterval = setInterval(() => {
        if (Date.now() - lastFrameTime > 2000) {
            setStreamOnline(false);
        }
    }, 1000);
}

// Update UI depending on stream connection state
function setStreamOnline(isOnline) {
    if (isOnline) {
        cameraStatusBadge.innerHTML = `<span style="width:6px; height:6px; background:currentColor; border-radius:50%;"></span> Active`;
        cameraStatusBadge.className = "status-pill status-pill-online";
        placeholder.style.display = 'none';
        canvas.style.display = 'block';
        
        // Enable action buttons
        verifyBtn.disabled = false;
        payBtn.disabled = false;
        registerBtn.disabled = false;
    } else {
        cameraStatusBadge.innerHTML = `<span style="width:6px; height:6px; background:currentColor; border-radius:50%;"></span> Offline`;
        cameraStatusBadge.className = "status-pill status-pill-offline";
        placeholder.style.display = 'flex';
        canvas.style.display = 'none';
        
        // Disable action buttons
        verifyBtn.disabled = true;
        payBtn.disabled = true;
        registerBtn.disabled = true;
    }
}

// Handle ML execution on the backend's latest frame
async function processAuthentication(mode) {
    resultBox.style.display = 'block';
    resultBox.style.background = '#1f2937';
    resultBox.style.border = '1px solid #374151';
    resultBox.style.color = '#e2e8f0';
    resultBox.innerHTML = `
        <div style="display:flex; align-items:center; gap:0.5rem; justify-content:center;">
            <div class="placeholder-spinner" style="width:20px; height:20px; border-width:2px; margin:0;"></div>
            <span>Executing Palm Matcher Model...</span>
        </div>
    `;

    // Disable buttons during process
    verifyBtn.disabled = true;
    payBtn.disabled = true;
    registerBtn.disabled = true;

    const formData = new FormData();
    formData.append('mode', mode);

    if (mode === 'pay') {
        const amount = parseFloat(payAmountInput.value) || 50.0;
        formData.append('amount', amount);
    } else if (mode === 'register') {
        const name = registerNameInput.value.trim();
        if (!name) {
            showResult(false, "Failed: Customer Name cannot be empty.");
            enableButtonsIfOnline();
            return;
        }
        formData.append('name', name);
    }

    try {
        const res = await fetch('/process_latest_frame', {
            method: 'POST',
            body: formData
        });
        const result = await res.json();

        if (result.status === 'success') {
            let html = `
                <div style="border-left: 4px solid #10b981; padding-left: 0.8rem;">
                    <h4 style="color:#10b981; margin:0 0 5px 0; font-weight:800; font-size:1.1rem;">🎉 SUCCESSFUL</h4>
                    <p style="margin: 0; font-size: 0.95rem;">${result.message}</p>
            `;
            if (result.customer) {
                html += `<small style="display:block; margin-top:5px; color:#94a3b8;">Verified customer: <strong>${result.customer}</strong> (${result.confidence})</small>`;
            }
            if (result.remaining_balance !== undefined) {
                html += `<small style="display:block; color:#94a3b8;">Updated Balance: <strong>${result.remaining_balance.toFixed(2)}rs</strong></small>`;
            }
            html += `</div>`;
            resultBox.innerHTML = html;
            resultBox.style.background = 'rgba(16, 185, 129, 0.1)';
            resultBox.style.border = '1px solid rgba(16, 185, 129, 0.3)';
            resultBox.style.color = '#a7f3d0';

            // Clear registration field
            if (mode === 'register') {
                registerNameInput.value = '';
            }
            
            // Refresh database data immediately
            fetchData();
        } else {
            showResult(false, result.message, result.confidence);
        }
    } catch (err) {
        console.error("Authentication execution failed:", err);
        showResult(false, "Connection error: Server failed to process biometric frame.");
    } finally {
        enableButtonsIfOnline();
    }
}

function showResult(success, message, confidence = null) {
    if (success) {
        // Handled in processAuthentication for detailed custom success layout
    } else {
        resultBox.style.display = 'block';
        resultBox.innerHTML = `
            <div style="border-left: 4px solid #ef4444; padding-left: 0.8rem;">
                <h4 style="color:#f87171; margin:0 0 5px 0; font-weight:800; font-size:1.1rem;">❌ PROCESS FAILED</h4>
                <p style="margin: 0; font-size: 0.95rem;">${message}</p>
                ${confidence ? `<small style="display:block; margin-top:5px; color:#fca5a5;">Confidence Match: ${confidence}</small>` : ''}
            </div>
        `;
        resultBox.style.background = 'rgba(239, 68, 68, 0.1)';
        resultBox.style.border = '1px solid rgba(239, 68, 68, 0.3)';
        resultBox.style.color = '#fca5a5';
    }
}

function enableButtonsIfOnline() {
    const isOnline = (Date.now() - lastFrameTime <= 2000);
    verifyBtn.disabled = !isOnline;
    payBtn.disabled = !isOnline;
    registerBtn.disabled = !isOnline;
}

// Dashboard statistics polling
async function fetchData() {
    try {
        const [usersRes, txRes] = await Promise.all([
            fetch('/users'),
            fetch('/transactions')
        ]);

        const users = await usersRes.json();
        const txs = await txRes.json();

        updateUsersTable(users);
        updateTransactionsTable(txs);
        updateStats(users, txs);
    } catch (err) {
        console.error('Error polling data:', err);
    }
}

function updateUsersTable(users) {
    const tbody = document.querySelector('#users-table tbody');
    tbody.innerHTML = '';
    
    // Filter out ShopOwner if shown or keep it styled
    users.forEach(u => {
        if (u.name === "ShopOwner") return; // Keep shopowner hidden from customer table
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${u.id}</td>
            <td><strong>${u.name}</strong></td>
            <td style="color:#38bdf8; font-weight:600;">${u.balance.toFixed(2)}rs</td>
        `;
        tbody.appendChild(tr);
    });
}

function updateTransactionsTable(txs) {
    const tbody = document.querySelector('#tx-table tbody');
    tbody.innerHTML = '';
    txs.forEach(t => {
        const tr = document.createElement('tr');
        const date = new Date(t.timestamp).toLocaleTimeString();
        tr.innerHTML = `
            <td><strong>${t.user}</strong></td>
            <td style="color:#10b981; font-weight:600;">$${t.amount.toFixed(2)}</td>
            <td style="color:#64748b;">${date}</td>
        `;
        tbody.appendChild(tr);
    });
}

function updateStats(users, txs) {
    // Exclude ShopOwner from total customers
    const clientCount = users.filter(u => u.name !== "ShopOwner").length;
    document.getElementById('total-users').textContent = clientCount;
    document.getElementById('total-tx').textContent = txs.length;
}

// Set click handlers
verifyBtn.addEventListener('click', () => processAuthentication('verify'));
payBtn.addEventListener('click', () => processAuthentication('pay'));
registerBtn.addEventListener('click', () => processAuthentication('register'));

// Initialize dashboard elements
window.addEventListener('load', () => {
    fetchServerInfo();
    connectDashboardWS();
    startWatchdog();
    fetchData();
    setInterval(fetchData, 3000);
});
