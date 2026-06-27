const video = document.getElementById('webcam');
const canvas = document.getElementById('snapshot');
const verifyBtn = document.getElementById('verify-btn');
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

verifyBtn.addEventListener('click', async () => {
    statusMsg.textContent = "Identifying palm...";
    statusMsg.style.color = "blue";

    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob(async (blob) => {
        const formData = new FormData();
        formData.append('image', blob, 'test.jpg');

        try {
            const response = await fetch('/verify', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.status === "success") {
                statusMsg.innerHTML = `<span style="color: green;">✔ ${result.message}</span><br><small>Confidence: ${(result.similarity * 100).toFixed(1)}%</small>`;
            } else {
                statusMsg.innerHTML = `<span style="color: red;">✘ ${result.message}</span>`;
            }
        } catch (err) {
            console.error("Verification error:", err);
            statusMsg.textContent = "Error: Network failure.";
            statusMsg.style.color = "red";
        }
    }, 'image/jpeg');
});

startWebcam();
