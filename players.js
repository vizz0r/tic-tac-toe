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
                faceCenterY -= squareSize * 0.1; // Adjust face positioning slightly

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

    // Sticky title with drop shadow on scroll.
    window.addEventListener('scroll', function() {
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

// Determine if the device is mobile.
const isMobileDevice = /Mobi|Android|iPhone/i.test(navigator.userAgent);
console.log("isMobileDevice:", isMobileDevice);

// Tab switching for new player form (mobile only)
if (isMobileDevice) {
  const tabStorage = document.getElementById('tabStorage');
  const tabCamera = document.getElementById('tabCamera');
  const tabContentStorage = document.getElementById('tabContentStorage');
  const tabContentCamera = document.getElementById('tabContentCamera');
  if (tabStorage && tabCamera && tabContentStorage && tabContentCamera) {
    console.log("Mobile device detected: Setting up tabs for new player form.");
    // Set default active tab: Storage
    tabStorage.classList.add('active');
    tabContentStorage.style.display = 'block';
    tabCamera.classList.remove('active');
    tabContentCamera.style.display = 'none';
    
    tabStorage.addEventListener('click', () => {
      console.log("Mobile: Storage tab clicked.");
      tabStorage.classList.add('active');
      tabCamera.classList.remove('active');
      tabContentStorage.style.display = 'block';
      tabContentCamera.style.display = 'none';
    });
    
    tabCamera.addEventListener('click', () => {
      console.log("Mobile: Camera tab clicked.");
      tabCamera.classList.add('active');
      tabStorage.classList.remove('active');
      tabContentCamera.style.display = 'block';
      tabContentStorage.style.display = 'none';
    });
  } else {
    console.log("Mobile: Tab elements missing in HTML.");
  }
} else {
  console.log("Desktop device detected: Hiding tab controls, defaulting to storage mode.");
  // Optionally hide tab controls on desktop.
  const tabControls = document.getElementById('tabControls');
  if (tabControls) {
    tabControls.style.display = 'none';
  }
  // Also, ensure that the storage mode is visible by default:
  const tabContentStorage = document.getElementById('tabContentStorage');
  if (tabContentStorage) {
    tabContentStorage.style.display = 'block';
  }
}


    // Create the message container below the players grid if it doesn't exist.
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
    // Helper function to display messages.
    function displayMessage(text) {
        messageContainer.style.display = "block";
        messageContainer.innerHTML = `<span class="warning-icon">⚠️</span> ${text}`;
        setTimeout(() => {
            messageContainer.innerHTML = "";
            messageContainer.style.display = "none";
        }, 5000);
    }

    // Remove any separate new player toggle markup if present.
    // (We're using the Add New Player card in the grid instead.)

    // Retrieve players grid and new player section elements.
    const uploadedPlayersContainer = document.getElementById('uploaded-players');
    // New player form elements (inside newPlayerContainer)
    const newPlayerContainer = document.getElementById('newPlayerContainer');
    // For the new player form, we assume the following IDs exist in the HTML:
    // - Tab controls: tabStorage, tabCamera (desktop only)
    // - Tab contents: tabContentStorage, tabContentCamera
    // - File input elements: fileLabel (inside #browse) and fileNameDisplay
    const browseButton = document.getElementById('browseButton');
    const playerUpload = document.getElementById('playerUpload'); // Hidden file input inside newPlayerContainer
    const playerNameInput = document.getElementById('playerName');
    const uploadPlayerBtn = document.getElementById('uploadPlayerBtn'); // Now labeled "Add Player"
    //const takePhotoBtn = document.getElementById('takePhotoBtn'); // Mobile camera capture
    const startGameBtn = document.getElementById('startGameBtn');

    // Attach custom file input event listener for the "Browse" button.
    if (browseButton && playerUpload) {
        browseButton.addEventListener('click', () => {
            console.log("Browse button clicked.");
            playerUpload.click();
        });
    }

    if (playerUpload) {
        playerUpload.setAttribute("accept", "image/*");
    }
// Function to update the UI after an image is selected
function updateUIAfterImageSelection(imageSrc) {
    // Show name input and upload button
    playerNameInput.style.display = "block";
    uploadPlayerBtn.style.display = "block";

    // Show a preview of the image
    let imagePreview = document.getElementById("imagePreview");
    if (!imagePreview) {
        imagePreview = document.createElement("img");
        imagePreview.id = "imagePreview";
        imagePreview.style.width = "100px";
        imagePreview.style.marginTop = "10px";
        playerNameInput.parentNode.insertBefore(imagePreview, playerNameInput);
    }
    imagePreview.src = imageSrc;
}

// Modify the file input event listener
playerUpload.addEventListener('change', () => {
    const file = playerUpload.files[0];
    if (file) {
        const imageSrc = URL.createObjectURL(file);
        updateUIAfterImageSelection(imageSrc);

        // Update text confirmation
        fileNameDisplay.textContent = file.name;
        fileNameDisplay.style.display = "inline-block";
        fileLabel.style.display = "none";
    }
});

    // Detect mobile device and camera.
    //const hasCamera = navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    //takePhotoBtn.style.display = (isMobileDevice && hasCamera) ? "inline-block" : "none";

    // Retrieve stored players.
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

    // Event delegation for players grid.
    uploadedPlayersContainer.addEventListener('click', (event) => {
        if (event.target.closest('.delete-player-btn')) {
            deletePlayer(event);
            return;
        }
        const playerDiv = event.target.closest('.player-selection');
        if (playerDiv) {
            // If this is the "Add New Player" card, show the new player form (if not already visible).
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

// Modify the Take Photo button behavior
const cameraTab = document.getElementById("tabCamera");
const storageTab = document.getElementById("tabStorage");
const tabContentCamera = document.getElementById("tabContentCamera");
const tabContentStorage = document.getElementById("tabContentStorage");

// Ensure Take Photo tab immediately triggers the camera
cameraTab.addEventListener("click", () => {
    cameraTab.classList.add("active");
    storageTab.classList.remove("active");
    tabContentCamera.style.display = "block";
    tabContentStorage.style.display = "none";

    console.log("📷 Automatically opening the camera...");

    // Auto-trigger the camera
    const captureInput = document.createElement("input");
    captureInput.type = "file";
    captureInput.accept = "image/*";
    captureInput.setAttribute("capture", "environment");
    captureInput.style.display = "none";
    document.body.appendChild(captureInput);

    captureInput.addEventListener("change", () => {
        const file = captureInput.files[0];
        if (file) {
            const imageSrc = URL.createObjectURL(file);
            updateUIAfterImageSelection(imageSrc);
            window.capturedFile = file;
        }
        document.body.removeChild(captureInput);
    });

    captureInput.click();
});



    // Handle New Player Upload (Add Player) with separate validation.
uploadPlayerBtn.addEventListener('click', async () => {
    uploadPlayerBtn.textContent = "Uploading Player...";
    uploadPlayerBtn.disabled = true;
    
    let file;
    // Determine which tab is active (desktop only); on mobile, default to storage.
    if (!isMobileDevice) {
        const tabStorage = document.getElementById('tabStorage');
        const tabCamera = document.getElementById('tabCamera');
        if (tabStorage && tabStorage.classList.contains('active')) {
            file = playerUpload.files[0] || window.selectedFile;
            console.log("Desktop: Storage tab active. File:", file);
        } else if (tabCamera && tabCamera.classList.contains('active')) {
            file = window.capturedFile;
            console.log("Desktop: Camera tab active. File:", file);
        } else {
            file = playerUpload.files[0] || window.selectedFile || window.capturedFile;
            console.log("Desktop: No active tab; using fallback file:", file);
        }
    } else {
        // On mobile, use storage method.
        file = playerUpload.files[0] || window.selectedFile || window.capturedFile;
        console.log("Mobile: Using storage file:", file);
    }
    
    const playerName = playerNameInput.value.trim();
    console.log("Player name entered:", playerName);
    
    // Validate file input.
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
    
    // Validate player name input.
    if (!playerName) {
        displayMessage("Please enter a player name.");
        console.log("⚠️ Upload Failed - Missing name.");
        uploadPlayerBtn.textContent = "Upload Player";
        uploadPlayerBtn.disabled = false;
        return;
    }
    
    // Check for duplicate names.
    if (players.some(player => player.name.toLowerCase() === playerName.toLowerCase())) {
        displayMessage(`A player named "${playerName}" already exists.`);
        console.log(`❌ Duplicate name detected: ${playerName}`);
        uploadPlayerBtn.textContent = "Upload Player";
        uploadPlayerBtn.disabled = false;
        return;
    }
    
    try {
        console.log("✅ Name is unique. Proceeding with image processing...");
        console.log("📸 Processing image for:", playerName);
        console.log("🛠 File Details:", file);
        console.log("🎨 Removing Background...");
        const processedBlob = await removeBackground(file);
        console.log("✅ Background Removed! Blob:", processedBlob);
        console.log("🔵 Applying Round Mask...");
        const finalImage = await cropFaceToSquare(processedBlob);
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
        // Reset the file input display: show the label and hide the file name display.
        const fileNameDisplay = document.getElementById('fileNameDisplay');
        const fileLabel = document.getElementById('fileLabel');
        if (fileNameDisplay && fileLabel) {
            fileNameDisplay.textContent = "";
            fileNameDisplay.style.display = "none";
            fileLabel.style.display = "inline";
        }
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

    // Render players (grid cards). Each card is clickable, and a "Selected" tag appears if selected.
function renderPlayers() {
    console.log("🔄 Rendering Players...");
    uploadedPlayersContainer.innerHTML = "";
    
    // Load players from localStorage
    let storedPlayers = JSON.parse(localStorage.getItem('players')) || [];
    
    players.forEach((p, index) => {
        // Check if the player is a new player (not default)
        let isNewPlayer = storedPlayers.some(sp => sp.name === p.name);

        const isSelected = selectedPlayers.has(p.name);
        uploadedPlayersContainer.innerHTML += `
            <div class="player-selection ${isSelected ? 'selected' : ''} ${isNewPlayer ? 'new-player' : ''}" data-player-name="${p.name}">
                ${index >= 2 ? `<button class="delete-player-btn" data-index="${index}">🗑</button>` : ""}
                <span class="player-name">${p.name}</span>
                <img src="${p.image}" onerror="this.src='images/default-avatar.png'" alt="${p.name}" class="player-img">
                ${isSelected ? `<div class="selected-tag">Selected</div>` : ''}
            </div>
        `;
        console.log(`✅ Player Rendered: ${p.name} (Selected: ${isSelected}, New Player: ${isNewPlayer})`);
    });

    // Append the "Add New Player" card (which has no delete button)
    uploadedPlayersContainer.innerHTML += `
        <div class="player-selection add-new" data-action="add-new">
            <span class="plus-icon">+</span>
            <span class="player-name">Add New Player</span>
        </div>
    `;
    updateSelectionTitle();
}


    // Toggle selection based on player name.
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

    // Update the selection title based on the number of selected players.
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

    function deletePlayer(event) {
        const playerIndex = parseInt(event.target.getAttribute("data-index"));
        console.log(`🗑️ Deleting Player at Index: ${playerIndex}`);
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
    }

    startGameBtn.addEventListener('click', () => {
        if (selectedPlayers.size !== 2) {
            displayMessage("Please select exactly two players.");
            return;
        }
        persistSelectedPlayers();
        window.location.href = "index.html";
    });

    // Initial render of players.
    renderPlayers();
});
