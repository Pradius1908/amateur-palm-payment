const video = document.getElementById('webcam');
const canvas = document.getElementById('snapshot');
const payBtn = document.getElementById('pay-btn');
const statusMsg = document.getElementById('status-message');

// Start Webcam
async function startWebcam() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
    } catch (err) {
        console.error("Error accessing webcam: ", err);
        statusMsg.textContent = "Error: Could not access webcam.";
        statusMsg.style.color = "red";
    }
}

async function checkIOTTrigger() {
    try {
        const res = await fetch('/check_trigger');
        const data = await res.json();
        
        if (data.triggered) {
            console.log("IOT Trigger detected! Initiating scan...");
            // Clear the trigger on the server immediately
            await fetch('/clear_trigger', { method: 'POST' });
            // Start the payment capture
            processBiometricPayment();
        }
    } catch (err) {
        console.error("Trigger poll error:", err);
    }
}

async function processBiometricPayment() {
    statusMsg.textContent = "Processing Biometric Payment...";
    statusMsg.style.color = "blue";
    payBtn.disabled = true;

    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob(async (blob) => {
        const formData = new FormData();
        formData.append('image', blob, 'payment.jpg');
        formData.append('amount', '50.0');

        try {
            const response = await fetch('/pay', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.status === "success") {
                statusMsg.innerHTML = `
                    <div style="background-color: #dcfce7; padding: 20px; border-radius: 12px; border: 2px solid #22c55e;">
                        <h3 style="color: #166534; margin: 0 0 10px 0;">🎉 PAYMENT SUCCESSFUL</h3>
                        <p style="color: #15803d; margin: 0;">Verified: <strong>${result.customer}</strong></p>
                        <p style="color: #15803d; margin: 5px 0;">Amount: <strong>50.00rs</strong> credited to Shop Owner</p>
                        <small style="color: #16a34a;">New Balance: ${result.remaining_balance.toFixed(2)}rs</small>
                    </div>
                `;
            } else {
                statusMsg.innerHTML = `
                    <div style="background-color: #fee2e2; padding: 20px; border-radius: 12px; border: 2px solid #ef4444;">
                        <h3 style="color: #991b1b; margin: 0 0 10px 0;">❌ PAYMENT FAILED</h3>
                        <p style="color: #b91c1c; margin: 0;">${result.message}</p>
                        ${result.confidence ? `<small style="color: #dc2626;">Confidence Match: ${result.confidence}</small>` : ''}
                    </div>
                `;
            }
        } catch (err) {
            console.error("Payment error:", err);
            statusMsg.textContent = "Error: Connection to server failed.";
            statusMsg.style.color = "red";
        } finally {
            payBtn.disabled = false;
        }
    }, 'image/jpeg');
}

payBtn.addEventListener('click', processBiometricPayment);

startWebcam();
// Poll for ESP32 trigger every 1 second when on the pay page
setInterval(checkIOTTrigger, 1000);
