/* (function() {
    // Create a debug log container fixed at the top with a semitransparent background.
    const debugLog = document.createElement("div");
    debugLog.id = "debugLog";
    debugLog.style.position = "fixed";
    debugLog.style.top = "0";
    debugLog.style.left = "0";
    debugLog.style.width = "100%";
    debugLog.style.maxHeight = "200px";
    debugLog.style.overflowY = "auto";
    debugLog.style.backgroundColor = "rgba(0, 0, 0, 0.5)"; // semitransparent
    debugLog.style.color = "white";
    debugLog.style.fontSize = "12px";
    debugLog.style.zIndex = "10000";
    debugLog.style.padding = "5px";
    debugLog.style.fontFamily = "monospace";
    document.body.appendChild(debugLog);

    // Wrap console.log so every message is also appended to the log container.
    const originalConsoleLog = console.log;
    console.log = function(...args) {
        originalConsoleLog.apply(console, args);
        const message = args.join(" ");
        const messageDiv = document.createElement("div");
        messageDiv.textContent = message;
        debugLog.appendChild(messageDiv);
    };

    // Wrap console.error similarly.
    const originalConsoleError = console.error;
    console.error = function(...args) {
        originalConsoleError.apply(console, args);
        const message = args.join(" ");
        const messageDiv = document.createElement("div");
        messageDiv.style.color = "red";
        messageDiv.textContent = message;
        debugLog.appendChild(messageDiv);
    };
})(); */

//
// Global Helper Functions
//

// Apply a sharpen filter using a 3x3 convolution kernel that sums to 1
function applySharpen(imageData) {
    const width = imageData.width, height = imageData.height;
    const src = imageData.data;
    const output = new Uint8ClampedArray(src.length);

    // Kernel with sum=1, so it doesn't darken/brighten the image overall.
    const kernel = [
         0, -1,  0,
        -1,  5, -1,
         0, -1,  0
    ];
    const kernelSize = 3;
    const half = Math.floor(kernelSize / 2);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let r = 0, g = 0, b = 0;
            for (let ky = -half; ky <= half; ky++) {
                for (let kx = -half; kx <= half; kx++) {
                    const px = x + kx;
                    const py = y + ky;
                    if (px >= 0 && px < width && py >= 0 && py < height) {
                        const offset = (py * width + px) * 4;
                        const weight = kernel[(ky + half) * kernelSize + (kx + half)];
                        r += src[offset]     * weight;
                        g += src[offset + 1] * weight;
                        b += src[offset + 2] * weight;
                    }
                }
            }
            const index = (y * width + x) * 4;
            output[index]     = Math.min(255, Math.max(0, r));
            output[index + 1] = Math.min(255, Math.max(0, g));
            output[index + 2] = Math.min(255, Math.max(0, b));
            output[index + 3] = src[index + 3]; // preserve alpha
        }
    }
    return new ImageData(output, width, height);
}

// Global image processing: brightness(105%), contrast(105%), saturate(120%),
// then apply the sharpen filter. Disables image smoothing, outputs a JPEG blob (1.0).
function processImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            // Create a canvas matching the image dimensions.
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            // Disable image smoothing for sharper output.
            ctx.imageSmoothingEnabled = false;
            // Apply brightness, contrast, and saturation.
            ctx.filter = "brightness(105%) contrast(105%) saturate(120%)";
            // Fill canvas with white (to remove transparency).
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            // Draw the image onto the canvas.
            ctx.drawImage(img, 0, 0);
            // Retrieve image data, apply sharpen filter, then update the canvas.
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const sharpenedData = applySharpen(imageData);
            ctx.putImageData(sharpenedData, 0, 0);
            // Convert the processed canvas to a JPEG blob with highest quality (1.0).
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error("Processing image failed."));
                }
            }, "image/jpeg", 1.0);
        };
        img.onerror = (error) => reject(error);
        img.src = URL.createObjectURL(file);
    });
}

// Remove background using remove.bg API.
// This function processes the image (enhancement) then sends the JPEG blob.
async function removeBackground(file) {
    console.log("🖼 Processing image for remove.bg API...");
    const processedFile = await processImage(file);
    console.log("✅ Image processing complete. File type:", processedFile.type);
    const removeBgApiKey = "DM2d2GWCiDxUexxSrvbsV5ZA"; // Replace with your API key
    const formData = new FormData();
    formData.append("image_file", processedFile);
    formData.append("size", "auto");

    console.log("🖼 Sending processed image to Remove.bg API...");
    const response = await fetch("https://api.remove.bg/v1.0/removebg", {
        method: "POST",
        headers: { "X-Api-Key": removeBgApiKey },
        body: formData
    });

    if (!response.ok) {
        const errorDetails = await response.text();
        throw new Error(`❌ Remove.bg API Error: ${response.statusText}. Details: ${errorDetails}`);
    }
    console.log("✅ Received processed image from Remove.bg.");
    return response.blob();
}

// Apply a round mask to the image using FaceMesh.
// Detects the face, applies a circular mask, and crops to a square around the face.
async function applyRoundMask(imageBlob) {
    console.log("🎭 Applying round mask to image...");
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = async () => {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0);
            console.log("🖼 Image drawn on canvas. Proceeding with FaceMesh...");

            try {
                if (!window.faceMeshModel) {
                    console.log("🤖 Loading FaceMesh model...");
                    window.faceMeshModel = await facemesh.load();
                    console.log("✅ FaceMesh Model Loaded.");
                }
                console.log("🔍 Calling estimateFaces on canvas...");
                const faceDetectionTimeout = new Promise((_, reject) =>
                    setTimeout(() => {
                        console.log("⚠ FaceMesh timeout triggered after 10 seconds.");
                        reject(new Error("⚠ FaceMesh timed out after 10 seconds."));
                    }, 10000)
                );
                const predictionsPromise = window.faceMeshModel.estimateFaces(canvas);
                console.log("⏳ Waiting for estimateFaces or timeout...");
                const predictions = await Promise.race([predictionsPromise, faceDetectionTimeout]);
                console.log(`🔍 FaceMesh detected ${predictions.length} faces.`);
                if (predictions.length === 0) {
                    console.warn("⚠ No face detected. Returning original image.");
                    resolve(canvas.toDataURL("image/png"));
                    return;
                }
                console.log("✅ Face detected. Applying mask...");
                const keypoints = predictions[0].scaledMesh;
                let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                keypoints.forEach(([x, y]) => {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                });
                const faceWidth = maxX - minX;
                const faceHeight = maxY - minY;
                const faceCenterX = minX + faceWidth / 2;
                let faceCenterY = minY + faceHeight / 2;
                const circleRadius = Math.max(faceWidth, faceHeight) * 0.6;
                faceCenterY -= circleRadius * 0.23; // Move mask upward slightly
                console.log(`🔵 Mask Position | CenterX: ${faceCenterX}, CenterY: ${faceCenterY}, Radius: ${circleRadius}`);
                ctx.globalCompositeOperation = "destination-in";
                ctx.beginPath();
                ctx.arc(faceCenterX, faceCenterY, circleRadius, 0, Math.PI * 2);
                ctx.closePath();
                ctx.fill();
                ctx.globalCompositeOperation = "source-over";
                console.log("✅ Mask applied successfully! Cropping image to square around mask.");
                const cropSize = circleRadius * 2;
                const cropX = faceCenterX - circleRadius;
                const cropY = faceCenterY - circleRadius;
                const croppedCanvas = document.createElement("canvas");
                croppedCanvas.width = cropSize;
                croppedCanvas.height = cropSize;
                const croppedCtx = croppedCanvas.getContext("2d");
                croppedCtx.imageSmoothingEnabled = false;
                croppedCtx.drawImage(canvas, cropX, cropY, cropSize, cropSize, 0, 0, cropSize, cropSize);
                resolve(croppedCanvas.toDataURL("image/png"));
            } catch (error) {
                console.error("❌ Error during FaceMesh processing:", error);
                resolve(canvas.toDataURL("image/png"));
            }
        };
        img.onerror = (error) => {
            console.error("❌ Error loading image:", error);
        };
        img.src = URL.createObjectURL(imageBlob);
    });
}

//
// Main Application Code
//

document.addEventListener('DOMContentLoaded', () => {
    console.log("📌 Page Loaded - Initializing Players");

    const uploadedPlayersContainer = document.getElementById('uploaded-players');
    const playerUpload = document.getElementById('playerUpload'); // File input for selecting an image from storage
    const playerNameInput = document.getElementById('playerName');
    const uploadPlayerBtn = document.getElementById('uploadPlayerBtn');
    const startGameBtn = document.getElementById('startGameBtn');
    const takePhotoBtn = document.getElementById('takePhotoBtn'); // Button for mobile camera capture

    // For file selection, allow only image files (do not set capture so that on mobile it opens the gallery).
    if (playerUpload) {
        playerUpload.setAttribute("accept", "image/*");
    }

    // Listen for changes on the Choose File input to store the selected file.
    playerUpload.addEventListener('change', () => {
        if (playerUpload.files && playerUpload.files[0]) {
            window.selectedFile = playerUpload.files[0];
            console.log("📁 File selected from storage:", window.selectedFile.name);
        }
    });

    // Check for mobile device and camera access.
    const isMobileDevice = /Mobi|Android|iPhone/i.test(navigator.userAgent);
    const hasCamera = navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    takePhotoBtn.style.display = (isMobileDevice && hasCamera) ? "inline-block" : "none";

    let players = JSON.parse(localStorage.getItem('players')) || [
        { name: 'Alex', image: 'images/playerX.png' },
        { name: 'Martin', image: 'images/playerO.png' }
    ];

    // Restore last used selected players from localStorage.
    let storedSelectedPlayers = JSON.parse(localStorage.getItem('selectedPlayers'));
    let selectedPlayers = new Set();
    if (storedSelectedPlayers) {
        if (storedSelectedPlayers.player1) selectedPlayers.add(storedSelectedPlayers.player1);
        if (storedSelectedPlayers.player2) selectedPlayers.add(storedSelectedPlayers.player2);
    }
    // Default to Alex and Martin if none are selected.
    if (selectedPlayers.size === 0 && players.length === 2) {
        selectedPlayers.add('Alex');
        selectedPlayers.add('Martin');
    }

    function persistSelectedPlayers() {
        localStorage.setItem('selectedPlayers', JSON.stringify({
            player1: [...selectedPlayers][0] || null,
            player2: [...selectedPlayers][1] || null
        }));
        console.log("💾 Persisted selected players:", localStorage.getItem('selectedPlayers'));
    }
    persistSelectedPlayers();
    console.log("✅ Players selected after load:", Array.from(selectedPlayers));

    // Event delegation for clicks within the players container.
    uploadedPlayersContainer.addEventListener('click', (event) => {
        if (event.target.classList.contains('player-checkbox')) {
            handlePlayerSelection(event);
        }
        if (event.target.classList.contains('delete-player-btn')) {
            deletePlayer(event);
        }
    });

    // Handle Take Photo Button (Mobile)
    takePhotoBtn.addEventListener("click", () => {
        // Create a temporary file input for capturing photo.
        const captureInput = document.createElement("input");
        captureInput.type = "file";
        captureInput.accept = "image/*";
        captureInput.setAttribute("capture", "environment"); // Forces rear camera.
        captureInput.style.display = "none";
        document.body.appendChild(captureInput);
        captureInput.addEventListener("change", () => {
            const file = captureInput.files[0];
            if (file) {
                window.capturedFile = file;
                console.log("📸 Photo captured from camera.");
                let captureStatus = document.getElementById("captureStatus");
                if (!captureStatus) {
                    captureStatus = document.createElement("span");
                    captureStatus.id = "captureStatus";
                    captureStatus.style.marginLeft = "10px";
                    takePhotoBtn.parentNode.insertBefore(captureStatus, takePhotoBtn.nextSibling);
                }
                captureStatus.textContent = "Photo captured";
            }
            document.body.removeChild(captureInput);
        });
        captureInput.click();
    });

    // Handle Image Upload (Either file selected from storage or captured via camera)
    uploadPlayerBtn.addEventListener('click', async () => {
        uploadPlayerBtn.textContent = "Uploading...";
        uploadPlayerBtn.disabled = true;
        
        // Try to get file from the file input; otherwise, from stored globals.
        const fileFromInput = playerUpload.files[0];
        const file = fileFromInput || window.selectedFile || window.capturedFile;
        const playerName = playerNameInput.value.trim();
        console.log("📌 Upload button clicked. Processing player:", playerName);
        
        if (!file) {
            alert("No file selected from storage or camera.");
            console.log("⚠️ Upload Failed - No file selected.");
            uploadPlayerBtn.textContent = "Upload";
            uploadPlayerBtn.disabled = false;
            return;
        }
        if (!playerName) {
            alert("Please enter a player name.");
            console.log("⚠️ Upload Failed - Missing name.");
            uploadPlayerBtn.textContent = "Upload";
            uploadPlayerBtn.disabled = false;
            return;
        }
        if (players.some(player => player.name.toLowerCase() === playerName.toLowerCase())) {
            alert(`A player named "${playerName}" already exists.`);
            console.log(`❌ Duplicate name detected: ${playerName}`);
            uploadPlayerBtn.textContent = "Upload";
            uploadPlayerBtn.disabled = false;
            return;
        }
        try {
            console.log("✅ Name is unique. Proceeding with image processing...");
            console.log("📸 Attempting to process image for:", playerName);
            console.log("🛠 File Details:", file);
            console.log("🎨 Removing Background...");
            const processedBlob = await removeBackground(file);
            console.log("✅ Background Removed! Blob:", processedBlob);
            console.log("🔵 Applying Round Mask...");
            const finalImage = await applyRoundMask(processedBlob);
            console.log("✅ Round Mask Applied! Base64 Image (first 50 chars):", finalImage.substring(0, 50), "...");
            players.push({ name: playerName, image: finalImage });
            console.log(`✅ New Player Added: ${playerName}`);
            console.log("🛠 Players After Processing:", players.map(p => p.name));
            savePlayers();
            renderPlayers();
            console.log("📂 Image saved to localStorage.");
            // Clear inputs and reset stored files.
            playerUpload.value = "";
            playerNameInput.value = "";
            window.selectedFile = null;
            window.capturedFile = null;
            let captureStatus = document.getElementById("captureStatus");
            if (captureStatus) {
                captureStatus.textContent = "";
            }
        } catch (error) {
            console.error("❌ Image Processing Failed:", error);
        } finally {
            uploadPlayerBtn.textContent = "Upload";
            uploadPlayerBtn.disabled = false;
        }
    });

    function savePlayers() {
        localStorage.setItem('players', JSON.stringify(players));
    }

    function renderPlayers() {
        console.log("🔄 Rendering Players...");
        uploadedPlayersContainer.innerHTML = "";
        players.forEach((p, index) => {
            const isChecked = selectedPlayers.has(p.name) ? "checked" : "";
            uploadedPlayersContainer.innerHTML += `
                <div class="player-selection">
                    <input type="checkbox" name="selectedPlayer" value="${p.name}" class="player-checkbox" ${isChecked}>
                    <img src="${p.image}" onerror="this.src='images/default-avatar.png'" alt="${p.name}" class="player-img" style="width:214px;">
                    <span>${p.name}</span>
                    ${index >= 2 ? `<button class="delete-player-btn" data-index="${index}">❌</button>` : ""}
                </div>
            `;
            console.log(`✅ Player Rendered: ${p.name} (Checked: ${isChecked})`);
        });
        updateCheckboxState();
    }

    function handlePlayerSelection(event) {
        const selectedCheckboxes = document.querySelectorAll('input[name="selectedPlayer"]:checked');
        const currentlySelected = selectedCheckboxes.length;
        console.log(`🎯 Player Clicked: ${event.target.value} | Checked: ${event.target.checked}`);
        console.log(`ℹ️ Updated Selected Players Count: ${currentlySelected}`);
        if (event.target.checked && currentlySelected > 2) {
            event.target.checked = false;
            alert("You must deselect one player before selecting another.");
            console.log("❌ Too Many Players Selected! Unchecking last selection...");
            return;
        }
        if (!event.target.checked && selectedPlayers.size === 2 && players.length === 2) {
            event.preventDefault();
            event.target.checked = true;
            alert("At least two players must remain selected.");
            console.log("⚠️ Cannot deselect - Two players must always be selected.");
            return;
        }
        event.target.checked
            ? selectedPlayers.add(event.target.value)
            : selectedPlayers.delete(event.target.value);
        persistSelectedPlayers();
        updateCheckboxState();
    }

    function updateCheckboxState() {
        const selectedCheckboxes = document.querySelectorAll('input[name="selectedPlayer"]:checked');
        console.log(`🔄 Updating Checkbox State | Selected Players: ${selectedCheckboxes.length}`);
        document.querySelectorAll('.player-checkbox').forEach(checkbox => {
            checkbox.disabled = false;
        });
    }

    function deletePlayer(event) {
        const playerIndex = parseInt(event.target.getAttribute("data-index"));
        console.log(`🗑️ Deleting Player at Index: ${playerIndex}`);
        if (playerIndex >= 2) {
            const selectedBeforeDelete = Array.from(document.querySelectorAll('input[name="selectedPlayer"]:checked'))
                .map(cb => cb.value);
            players.splice(playerIndex, 1);
            savePlayers();
            renderPlayers();
            document.querySelectorAll('input[name="selectedPlayer"]').forEach(cb => {
                if (selectedBeforeDelete.includes(cb.value)) {
                    cb.checked = true;
                    selectedPlayers.add(cb.value);
                }
            });
            if (players.length === 2 && players[0].name === "Alex" && players[1].name === "Martin") {
                console.log("🔄 Only Alex & Martin remain. Auto-selecting them.");
                selectedPlayers.clear();
                selectedPlayers.add('Alex');
                selectedPlayers.add('Martin');
                document.querySelectorAll('input[name="selectedPlayer"]').forEach(cb => {
                    cb.checked = selectedPlayers.has(cb.value);
                });
            }
            persistSelectedPlayers();
            updateCheckboxState();
        }
    }

    startGameBtn.addEventListener('click', () => {
        if (selectedPlayers.size !== 2) {
            alert("Please select exactly two players.");
            return;
        }
        persistSelectedPlayers();
        window.location.href = "index.html";
    });

    // Initial render on page load.
    renderPlayers();
});
