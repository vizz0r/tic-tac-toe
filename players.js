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
            output[index + 3] = src[index + 3];
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
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx.imageSmoothingEnabled = false;
            ctx.filter = "brightness(105%) contrast(105%) saturate(120%)";
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const sharpenedData = applySharpen(imageData);
            ctx.putImageData(sharpenedData, 0, 0);
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
async function removeBackground(file) {
    console.log("🖼 Processing image for remove.bg API...");
    const processedFile = await processImage(file);
    console.log("✅ Image processing complete. File type:", processedFile.type);
    const removeBgApiKey = "XLZeaz7xuaVeVxX8mPnMR7Mw"; // Replace with your API key
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

// Crop image to a square based on FaceMesh detection (zoomed out by 30%)
async function cropFaceToSquare(imageBlob) {
    console.log("📸 Cropping face to square with zoom-out...");
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
                const predictions = await window.faceMeshModel.estimateFaces(canvas);
                console.log(`🔍 FaceMesh detected ${predictions.length} faces.`);

                if (predictions.length === 0) {
                    console.warn("⚠ No face detected. Returning original image.");
                    resolve(canvas.toDataURL("image/png"));
                    return;
                }

                console.log("✅ Face detected. Cropping to square...");
                const keypoints = predictions[0].scaledMesh;
                let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                keypoints.forEach(([x, y]) => {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                });

                // Define the original face bounding box
                const faceWidth = maxX - minX;
                const faceHeight = maxY - minY;
                
                // Expand crop size by 30% for zoom-out effect
                const squareSize = Math.max(faceWidth, faceHeight) * 1.6;

                const faceCenterX = minX + faceWidth / 2;
                let faceCenterY = minY + faceHeight / 2;
                faceCenterY -= squareSize * 0.1; // moves the cropping area upward slightly

                // Define square cropping area (expand the frame)
                const cropX = faceCenterX - squareSize / 2;
                const cropY = faceCenterY - squareSize / 2;

                console.log(`🟦 Cropping square | X: ${cropX}, Y: ${cropY}, Size: ${squareSize}`);

                // Crop to square
                const croppedCanvas = document.createElement("canvas");
                croppedCanvas.width = squareSize;
                croppedCanvas.height = squareSize;
                const croppedCtx = croppedCanvas.getContext("2d");
                croppedCtx.imageSmoothingEnabled = false;
                croppedCtx.drawImage(
                    canvas,
                    cropX, cropY, squareSize, squareSize,
                    0, 0, squareSize, squareSize
                );

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

    // Sticky title with drop shadow on scroll
    window.addEventListener('scroll', () => {
        const selectionTitle = document.getElementById('selection-title');
        if (selectionTitle) {
            const rect = selectionTitle.getBoundingClientRect();
            if (rect.top <= 0) {
                selectionTitle.classList.add('drop-shadow');
            } else {
                selectionTitle.classList.remove('drop-shadow');
            }
        }
    });

    // Detect mobile
    const isMobileDevice = /Mobi|Android|iPhone/i.test(navigator.userAgent);
    console.log("isMobileDevice:", isMobileDevice);

    // ─────────────────────────────────────────────────────────
    // 1) Function to Deselect All Tabs (No Active Tab)
    // ─────────────────────────────────────────────────────────
    function deselectAllTabs() {
        console.log("🔄 Deselecting all tabs (no active mode)...");
        const tabStorage = document.getElementById('tabStorage');
        const tabCamera = document.getElementById('tabCamera');
        const tabContentStorage = document.getElementById('tabContentStorage');
        const tabContentCamera = document.getElementById('tabContentCamera');

        if (!tabStorage || !tabCamera || !tabContentStorage || !tabContentCamera) {
            console.error("🚨 Error: One or more tab elements are missing in deselectAllTabs()");
            return;
        }

        tabStorage.classList.remove("active");
        tabCamera.classList.remove("active");
        tabContentStorage.style.display = "none";
        tabContentCamera.style.display = "none";
    }

    // ─────────────────────────────────────────────────────────
    // 2) Confirmation Message + Photo Preview
    // ─────────────────────────────────────────────────────────
    const newPlayerContainer = document.getElementById('newPlayerContainer');
    const playerNameInput = document.getElementById('playerName');
    const uploadPlayerBtn = document.getElementById('uploadPlayerBtn');
    const playerUpload = document.getElementById('playerUpload'); 
    const browseButton = document.getElementById('browseButton');
    const fileNameDisplay = document.getElementById("fileNameDisplay");
    const fileLabel = document.getElementById("fileLabel");

    /**
     * Displays the preview + confirmation message.
     * @param {string} imageSrc - The image URL to preview.
     * @param {boolean} fromCamera - Whether this image is from the camera or from browse.
     */
function updateUIAfterImageSelection(imageSrc, fromCamera) {
    // Show name input and upload button
    playerNameInput.style.display = "block";
    uploadPlayerBtn.style.display = "block";

    // Remove any existing confirmation or preview container
    const oldConfirm = document.getElementById("photoConfirmMessage");
    if (oldConfirm) oldConfirm.remove();
    const oldPreviewContainer = document.getElementById("previewContainer");
    if (oldPreviewContainer) oldPreviewContainer.remove();

    // Create a new confirmation message
    const confirmMsg = document.createElement("div");
    confirmMsg.id = "photoConfirmMessage";
    confirmMsg.style.marginBottom = "5px";
    confirmMsg.style.fontWeight = "bold";
    confirmMsg.style.color = "#007BFF";
    confirmMsg.textContent = fromCamera
        ? "Photo taken and attached for preview"
        : "File attached for preview";

    // Create a container for the preview + delete button
    const previewContainer = document.createElement("div");
    previewContainer.id = "previewContainer";
    previewContainer.style.display = "flex";
    previewContainer.style.alignItems = "center";
    previewContainer.style.gap = "8px";

    // Create the preview image
    const imagePreview = document.createElement("img");
    imagePreview.id = "imagePreview";
    imagePreview.style.width = "100px";
    imagePreview.style.marginTop = "5px";
    imagePreview.src = imageSrc;

    // Create the delete (cross) button
    const deletePreviewBtn = document.createElement("button");
    deletePreviewBtn.id = "deletePreviewBtn";
    deletePreviewBtn.textContent = "❌";
    deletePreviewBtn.style.cursor = "pointer";
    deletePreviewBtn.style.border = "none";
    deletePreviewBtn.style.background = "transparent";
    deletePreviewBtn.style.fontSize = "18px";

    // When clicked, remove preview & reset form
deletePreviewBtn.addEventListener("click", () => {
    // Remove the entire preview container + message
    previewContainer.remove();
    confirmMsg.remove();

    // Clear file references
    if (playerUpload) {
        playerUpload.value = "";
    }
    window.capturedFile = null;

    // Clear fileNameDisplay if it exists
    if (fileNameDisplay && fileLabel) {
        fileNameDisplay.textContent = "";
        fileNameDisplay.style.display = "none";
        fileLabel.style.display = "inline";
    }

    // Hide name input & upload button
    playerNameInput.value = "";
    playerNameInput.style.display = "none";
    uploadPlayerBtn.style.display = "none";

    // Re-activate the "Browse" tab
    const tabStorage = document.getElementById('tabStorage');
    const tabCamera = document.getElementById('tabCamera');
    const tabContentStorage = document.getElementById('tabContentStorage');
    const tabContentCamera = document.getElementById('tabContentCamera');

    if (tabStorage && tabCamera && tabContentStorage && tabContentCamera) {
        // Force "Browse" tab to be active
        tabStorage.classList.add('active');
        tabCamera.classList.remove('active');
        tabContentStorage.style.display = 'block';
        tabContentCamera.style.display = 'none';
    }

    console.log("New player form displayed. Reset to 'Open Gallery' tab.");
});


    // Assemble everything
    previewContainer.appendChild(imagePreview);
    previewContainer.appendChild(deletePreviewBtn);

    // Insert them above the name input
    newPlayerContainer.insertBefore(confirmMsg, playerNameInput);
    newPlayerContainer.insertBefore(previewContainer, playerNameInput);
}




    // If "Browse" button is clicked, open file picker
    if (browseButton && playerUpload) {
        browseButton.addEventListener('click', () => {
            console.log("Browse button clicked.");
            playerUpload.click();
        });
    }

    // If user picks a file from "Browse"
if (playerUpload) {
    playerUpload.addEventListener('change', () => {
        const file = playerUpload.files[0];
        if (file) {
            console.log("🖼️ File selected from gallery. Attaching preview...");
            const imageSrc = URL.createObjectURL(file);

            // Show "File attached for preview" (not appended to fileNameDisplay)
            updateUIAfterImageSelection(imageSrc, false);

            // Show the file name only
            if (fileNameDisplay && fileLabel) {
                fileNameDisplay.textContent = file.name;  // ❌ Removed "(attached for preview)"
                fileNameDisplay.style.display = "inline-block";
                fileLabel.style.display = "none";
            }
        }
    });
}

    // ─────────────────────────────────────────────────────────
    // 3) Mobile Tab Switching
    // ─────────────────────────────────────────────────────────
    if (isMobileDevice) {
        const tabStorage = document.getElementById('tabStorage');
        const tabCamera = document.getElementById('tabCamera');
        const tabContentStorage = document.getElementById('tabContentStorage');
        const tabContentCamera = document.getElementById('tabContentCamera');

        if (tabStorage && tabCamera && tabContentStorage && tabContentCamera) {
            console.log("Mobile device detected: Setting up tabs for new player form.");

            // Default to 'Browse' tab on load
            console.log("🔄 Defaulting to 'Browse' tab on load.");
            tabStorage.classList.add('active');
            tabCamera.classList.remove('active');
            tabContentStorage.style.display = 'block';
            tabContentCamera.style.display = 'none';

            // "Open Gallery" tab
            tabStorage.addEventListener('click', () => {
                console.log("🖼️ User clicked 'Open Gallery' tab.");
                tabStorage.classList.add('active');
                tabCamera.classList.remove('active');
                tabContentStorage.style.display = 'block';
                tabContentCamera.style.display = 'none';
            });

            // "Take Photo" tab
            tabCamera.addEventListener('click', () => {
                console.log("📷 User selected 'Take Photo' tab. Camera is starting...");
                tabCamera.classList.add('active');
                tabStorage.classList.remove('active');
                tabContentCamera.style.display = 'block';
                tabContentStorage.style.display = 'none';

                const captureInput = document.createElement("input");
                captureInput.type = "file";
                captureInput.accept = "image/*";
                captureInput.setAttribute("capture", "environment");
                captureInput.style.display = "none";
                document.body.appendChild(captureInput);

                let cameraOpen = true;  
                let photoTaken = false; 

                // Detect camera closure w/o photo
                const detectCameraClosure = () => {
                    if (cameraOpen && !photoTaken) {
                        console.log("❌ Camera was closed without taking a photo.");
                        // Deselect all tabs if user closed camera
                        deselectAllTabs();
                    }
                    window.removeEventListener("focus", detectCameraClosure);
                };
                // Mobile: detect camera closure
                window.addEventListener("focus", detectCameraClosure);

captureInput.addEventListener("change", () => {
    const file = captureInput.files[0];
    if (file) {
        console.log("✅ Photo taken. Attaching for preview...");
        const imageSrc = URL.createObjectURL(file);

        // Show "Photo taken and attached for preview"
        updateUIAfterImageSelection(imageSrc, true);

        window.capturedFile = file;
        cameraOpen = false;  
        photoTaken = true;  

        // Clear the fileNameDisplay if it was previously set
        if (fileNameDisplay && fileLabel) {
            fileNameDisplay.textContent = "";
            fileNameDisplay.style.display = "none";
            fileLabel.style.display = "inline";
        }

        // Remove closure detection, then deselect tabs after short delay...
        window.removeEventListener("focus", detectCameraClosure);
        setTimeout(() => {
            console.log("🔄 Deselecting tabs after successful photo.");
            deselectAllTabs();
        }, 500);

    } else {
        console.log("❌ No photo taken. Camera closed. Deselecting tabs.");
        deselectAllTabs();
    }
    document.body.removeChild(captureInput);
});

                captureInput.click();
            });
        } else {
            console.log("Mobile: Tab elements missing in HTML.");
        }

    } else {
        // Desktop
        console.log("Desktop device detected: Hiding tab controls, defaulting to storage mode.");
        const tabControls = document.getElementById('tabControls');
        if (tabControls) {
            tabControls.style.display = 'none';
        }
        const tabContentStorage = document.getElementById('tabContentStorage');
        if (tabContentStorage) {
            tabContentStorage.style.display = 'block';
        }
    }

    // ─────────────────────────────────────────────────────────
    // 4) The Rest of Your Logic
    // ─────────────────────────────────────────────────────────
    let messageContainer = document.getElementById('message-container');
    if (!messageContainer) {
        messageContainer = document.createElement('div');
        messageContainer.id = 'message-container';
        const uploadedPlayersContainer = document.getElementById('uploaded-players');
        uploadedPlayersContainer.parentNode.insertBefore(messageContainer, uploadedPlayersContainer.nextSibling);
    }
    if (messageContainer.innerHTML.trim() === "") {
        messageContainer.style.display = "none";
    }

    function displayMessage(text) {
        messageContainer.style.display = "block";
        messageContainer.innerHTML = `<span class="warning-icon">⚠️</span> ${text}`;
        setTimeout(() => {
            messageContainer.innerHTML = "";
            messageContainer.style.display = "none";
        }, 5000);
    }

    const uploadedPlayersContainer = document.getElementById('uploaded-players');
    const startGameBtn = document.getElementById('startGameBtn');

    let players = JSON.parse(localStorage.getItem('players')) || [
        { name: 'Alex', image: 'images/playerX.png' },
        { name: 'Martin', image: 'images/playerO.png' }
    ];
    let storedSelectedPlayers = JSON.parse(localStorage.getItem('selectedPlayers'));
    let selectedPlayers = new Set();

    if (storedSelectedPlayers) {
        if (storedSelectedPlayers.player1) selectedPlayers.add(storedSelectedPlayers.player1);
        if (storedSelectedPlayers.player2) selectedPlayers.add(storedSelectedPlayers.player2);
    }
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

    uploadedPlayersContainer.addEventListener('click', (event) => {
        if (event.target.closest('.delete-player-btn')) {
            deletePlayer(event);
            return;
        }
        const playerDiv = event.target.closest('.player-selection');
        if (playerDiv) {
            if (playerDiv.classList.contains('add-new')) {
                if (newPlayerContainer && (newPlayerContainer.style.display === "none" || newPlayerContainer.style.display === "")) {
                    newPlayerContainer.style.display = "inline-flex";
                    newPlayerContainer.style.flexDirection = "column";
                    console.log("New player form displayed.");
                }
            } else {
                const playerName = playerDiv.getAttribute('data-player-name');
                handlePlayerSelection(playerName);
            }
        }
    });

    // Upload button logic
uploadPlayerBtn.addEventListener("click", async () => {
    uploadPlayerBtn.textContent = "Uploading Player...";
    uploadPlayerBtn.disabled = true;

    // Unified fallback: either from "playerUpload" (gallery) or "window.capturedFile" (camera).
    let file = playerUpload.files[0] || window.capturedFile;
    console.log("Using fallback file reference:", file);

    // Device-specific message if no file
    if (!file) {
        const errorMessage = isMobileDevice
            ? "No image selected from gallery or camera."
            : "No image selected for upload.";
        displayMessage(errorMessage);
        console.log("⚠️ Upload Failed - No file selected.");
        uploadPlayerBtn.textContent = "Upload Player";
        uploadPlayerBtn.disabled = false;
        return;
    }

    const playerName = playerNameInput.value.trim();
    console.log("Player name entered:", playerName);

    // Validate name
    if (!playerName) {
        displayMessage("Please enter a player name.");
        console.log("⚠️ Upload Failed - Missing name.");
        uploadPlayerBtn.textContent = "Upload Player";
        uploadPlayerBtn.disabled = false;
        return;
    }

    // Check for duplicate names
    if (players.some(p => p.name.toLowerCase() === playerName.toLowerCase())) {
        displayMessage(`A player named "${playerName}" already exists.`);
        console.log(`❌ Duplicate name detected: ${playerName}`);
        uploadPlayerBtn.textContent = "Upload Player";
        uploadPlayerBtn.disabled = false;
        return;
    }

    try {
        console.log("✅ Name is unique. Proceeding with image processing...");
        console.log("🛠 File Details:", file);

        // Process image (sharpen, brightness, etc.)
        const processedBlob = await processImage(file);

        // Remove background
        console.log("🎨 Removing Background...");
        const bgRemovedBlob = await removeBackground(processedBlob);

        // Face cropping
        console.log("🔵 Applying Face Cropping...");
        const finalImage = await cropFaceToSquare(bgRemovedBlob);

        // Add new player
        players.push({ name: playerName, image: finalImage });
        savePlayers();
        renderPlayers();
        console.log(`✅ New Player Added: ${playerName}`);

        // Reset UI
        newPlayerContainer.style.display = "none";
        if (fileNameDisplay && fileLabel) {
            fileNameDisplay.textContent = "";
            fileNameDisplay.style.display = "none";
            fileLabel.style.display = "inline";
        }
        const imagePreview = document.getElementById("imagePreview");
        if (imagePreview) imagePreview.remove();
        const photoConfirm = document.getElementById("photoConfirmMessage");
        if (photoConfirm) photoConfirm.remove();
        playerNameInput.value = "";
        playerNameInput.style.display = "none";
        uploadPlayerBtn.style.display = "none";

        console.log("📂 Player image processed and UI updated.");
    } catch (error) {
        console.error("❌ Image Processing Failed:", error);
    } finally {
        uploadPlayerBtn.textContent = "Upload Player";
        uploadPlayerBtn.disabled = false;
    }
});


    function savePlayers() {
        localStorage.setItem('players', JSON.stringify(players));
    }

    function renderPlayers() {
        console.log("🔄 Rendering Players...");
        uploadedPlayersContainer.innerHTML = "";

        let storedPlayers = JSON.parse(localStorage.getItem('players')) || [];
        players.forEach((p, index) => {
            let isNewPlayer = storedPlayers.some(sp => sp.name === p.name);
            const isSelected = selectedPlayers.has(p.name);

            uploadedPlayersContainer.innerHTML += `
                <div class="player-selection ${isSelected ? 'selected' : ''} ${isNewPlayer ? 'new-player' : ''}" data-player-name="${p.name}">
                    ${index >= 2 ? `<button class="delete-player-btn" data-index="${index}">🗑</button>` : ""}
                    <span class="player-name">${p.name}</span>
                    <img src="${p.image}" onerror="this.src='images/default-avatar.png'" alt="${p.name}" class="player-img">
                    ${isSelected ? `<div class="selected-tag">Selected</div>` : ""}
                </div>
            `;
            console.log(`✅ Player Rendered: ${p.name} (Selected: ${isSelected}, New Player: ${isNewPlayer})`);
        });

        uploadedPlayersContainer.innerHTML += `
            <div class="player-selection add-new" data-action="add-new">
                <span class="plus-icon">+</span>
                <span class="player-name">Add New Player</span>
            </div>
        `;
        updateSelectionTitle();
    }

    function handlePlayerSelection(playerName) {
        if (selectedPlayers.has(playerName)) {
            selectedPlayers.delete(playerName);
            console.log(`🎯 Deselected player: ${playerName}`);
        } else {
            if (selectedPlayers.size >= 2) {
                displayMessage("You must deselect one player before selecting another.");
                console.log("❌ Too Many Players Selected! Cannot select additional player.");
                return;
            }
            selectedPlayers.add(playerName);
            console.log(`🎯 Selected player: ${playerName}`);
        }
        persistSelectedPlayers();
        renderPlayers();
    }

    function updateSelectionTitle() {
        const titleEl = document.getElementById('selection-title');
        if (selectedPlayers.size === 0) {
            titleEl.textContent = "Select 2 Players";
        } else if (selectedPlayers.size === 1) {
            titleEl.textContent = "Select 1 More Player";
        } else if (selectedPlayers.size === 2) {
            titleEl.textContent = "Selected Players";
        }
    }

///////////////////////////////////////
// 1) Replace your deletePlayer(event)
///////////////////////////////////////
function deletePlayer(event) {
    event.stopPropagation(); // Prevent click from bubbling further

    // Identify which player index was clicked
    const playerIndex = parseInt(event.target.getAttribute("data-index"));
    // Retrieve the player's name from your 'players' array
    const playerName = players[playerIndex].name;

    // Show a custom confirmation modal
    createDeleteConfirmationModal(playerName, () => {
        // On Confirm → proceed with your existing delete logic
        console.log(`🗑️ Confirmed deletion of player: ${playerName}`);

        // If this is the original logic:
        if (playerIndex >= 2) {
            const selectedBeforeDelete = Array.from(document.querySelectorAll('.player-selection'))
                .map(div => div.getAttribute('data-player-name'));
            players.splice(playerIndex, 1);
            savePlayers();
            renderPlayers();
            selectedPlayers = new Set([...selectedPlayers].filter(name => selectedBeforeDelete.includes(name)));
            persistSelectedPlayers();
            updateSelectionTitle();
        }
    });
}


function deletePlayer(event) {
    event.stopPropagation(); // Prevent click from bubbling further

    // Identify which player index was clicked
    const playerIndex = parseInt(event.target.getAttribute("data-index"));
    // Retrieve the player's name from your 'players' array
    const playerName = players[playerIndex].name;

    // Show a custom confirmation modal
    createDeleteConfirmationModal(playerName, () => {
        // On Confirm → proceed with your existing delete logic
        console.log(`🗑️ Confirmed deletion of player: ${playerName}`);

        if (playerIndex >= 2) {
            const selectedBeforeDelete = Array.from(document.querySelectorAll('.player-selection'))
                .map(div => div.getAttribute('data-player-name'));

            players.splice(playerIndex, 1);
            savePlayers();
            renderPlayers();

            selectedPlayers = new Set(
                [...selectedPlayers].filter(name => selectedBeforeDelete.includes(name))
            );
            persistSelectedPlayers();
            updateSelectionTitle();
        }
    });
}


function createDeleteConfirmationModal(playerName, onConfirm) {
    // Create a semi-transparent overlay
    const overlay = document.createElement("div");
    overlay.id = "deleteConfirmOverlay";

    // Create the modal container
    const modal = document.createElement("div");
    modal.id = "deleteConfirmModal";

    // Modal text
    const message = document.createElement("p");
    message.textContent = `Are you sure that you want to delete player "${playerName}"?`;

    // Container for buttons
    const btnContainer = document.createElement("div");
    btnContainer.classList.add("btn-container");

    // Confirm button
    const confirmBtn = document.createElement("button");
    confirmBtn.textContent = "Confirm";
    confirmBtn.classList.add("confirm-delete-btn");
    confirmBtn.addEventListener("click", () => {
        document.body.removeChild(overlay); // Close modal
        onConfirm(); // Run your delete logic
    });

    // Cancel button
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.classList.add("cancel-delete-btn");
    cancelBtn.addEventListener("click", () => {
        console.log("❌ Cancelled delete action.");
        document.body.removeChild(overlay); // Just close modal
    });

    // Assemble everything
    btnContainer.appendChild(cancelBtn);
    btnContainer.appendChild(confirmBtn);

    modal.appendChild(message);
    modal.appendChild(btnContainer);
    overlay.appendChild(modal);

    // Add to DOM
    document.body.appendChild(overlay);
}


    startGameBtn.addEventListener('click', () => {
        if (selectedPlayers.size !== 2) {
            displayMessage("Please select exactly two players.");
            return;
        }
        persistSelectedPlayers();
        window.location.href = "index.html";
    });

    // Initial render
    renderPlayers();
});

