const video = document.getElementById('webcam');
const canvas = document.getElementById('snapshot');
const captureBtn = document.getElementById('capture-btn');
const nameInput = document.getElementById('user-name');
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

captureBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    if (!name) {
        alert("Please enter a name.");
        return;
    }

    statusMsg.textContent = "Processing...";
    statusMsg.style.color = "blue";

    // Capture frame
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Convert to blob
    canvas.toBlob(async (blob) => {
        const formData = new FormData();
        formData.append('name', name);
        formData.append('image', blob, 'palm.jpg');

        try {
            const response = await fetch('/register', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (response.ok) {
                statusMsg.textContent = result.message || "Registration Successful!";
                statusMsg.style.color = "green";
                nameInput.value = "";
            } else {
                statusMsg.textContent = "Error: " + (result.detail || "Registration failed.");
                statusMsg.style.color = "red";
            }
        } catch (err) {
            console.error("Upload error:", err);
            statusMsg.textContent = "Error: Network failure.";
            statusMsg.style.color = "red";
        }
    }, 'image/jpeg');
});

startWebcam();
