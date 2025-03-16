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
                faceCenterY -= circleRadius * 0.23;
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
	
	const storageTab = document.getElementById('tabStorage');
	const cameraTab = document.getElementById('tabCamera');
	const tabContentStorage = document.getElementById('tabContentStorage');
	const tabContentCamera = document.getElementById('tabContentCamera');

	if(storageTab && cameraTab && tabContentStorage && tabContentCamera) {
	  storageTab.addEventListener('click', () => {
		storageTab.classList.add('active');
		cameraTab.classList.remove('active');
		tabContentStorage.style.display = 'block';
		tabContentCamera.style.display = 'none';
	  });

	  cameraTab.addEventListener('click', () => {
		cameraTab.classList.add('active');
		storageTab.classList.remove('active');
		tabContentCamera.style.display = 'block';
		tabContentStorage.style.display = 'none';
	  });
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
    // Helper function to display messages (replacing alerts).
    function displayMessage(text) {
        messageContainer.style.display = "block";
        messageContainer.innerHTML = `<span class="warning-icon">⚠️</span> ${text}`;
        setTimeout(() => {
            messageContainer.innerHTML = "";
            messageContainer.style.display = "none";
        }, 5000);
    }

    // NEW PLAYER TOGGLE & CONTAINER SETUP
    const newPlayerToggle = document.getElementById('newPlayerToggle');
    const newPlayerContainer = document.getElementById('newPlayerContainer');
    if (newPlayerToggle && newPlayerContainer) {
        newPlayerToggle.checked = false; // Off by default.
        newPlayerContainer.style.display = "none";
        newPlayerToggle.addEventListener('change', () => {
            if (newPlayerToggle.checked) {
                newPlayerContainer.style.display = "flex";
                newPlayerContainer.style.flexDirection = "column";
            } else {
                newPlayerContainer.style.display = "none";
            }
        });
    }

    // Retrieve players grid and new player section elements.
    const uploadedPlayersContainer = document.getElementById('uploaded-players');
    // New player section elements:
    const browseButton = document.getElementById('browseButton');
    const playerUpload = document.getElementById('playerUpload'); // Hidden file input inside newPlayerContainer
    const playerNameInput = document.getElementById('playerName');
    const uploadPlayerBtn = document.getElementById('uploadPlayerBtn'); // Now labeled "Add Player"
    const takePhotoBtn = document.getElementById('takePhotoBtn'); // Mobile camera capture
    const startGameBtn = document.getElementById('startGameBtn');

    // Attach custom file input event listener for the "Browse" button.
    if (browseButton && playerUpload) {
      browseButton.addEventListener('click', () => {
        playerUpload.click();
      });
    }

    // Set file input to accept image files.
    if (playerUpload) {
        playerUpload.setAttribute("accept", "image/*");
    }
    // When a file is selected, swap the file label with the file name display.
    playerUpload.addEventListener('change', () => {
        // Get the fileNameDisplay element and the file label from within the "browse" container.
        const fileNameDisplay = document.getElementById('fileNameDisplay');
        const fileLabel = document.querySelector('#browse .file-label');
        if (playerUpload.files && playerUpload.files[0]) {
            window.selectedFile = playerUpload.files[0];
            console.log("📁 File selected from storage:", window.selectedFile.name);
            if (fileNameDisplay && fileLabel) {
                fileNameDisplay.textContent = window.selectedFile.name;
                fileNameDisplay.style.display = "inline-block";
                fileLabel.style.display = "none";
            }
        } else {
            if (fileNameDisplay && fileLabel) {
                fileNameDisplay.textContent = "No file attached.";
                fileNameDisplay.style.display = "inline-block";
                fileLabel.style.display = "none";
            }
        }
    });

    // Detect mobile device and camera.
    const isMobileDevice = /Mobi|Android|iPhone/i.test(navigator.userAgent);
    const hasCamera = navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    takePhotoBtn.style.display = (isMobileDevice && hasCamera) ? "inline-block" : "none";

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

    // Event delegation for players grid: clicking a card toggles selection; delete button handles deletion.
	uploadedPlayersContainer.addEventListener('click', (event) => {
		if (event.target.closest('.delete-player-btn')) {
			deletePlayer(event);
			return;
		}
		const playerDiv = event.target.closest('.player-selection');
		if (playerDiv) {
			if (playerDiv.classList.contains('add-new')) {
				const newPlayerContainer = document.getElementById('newPlayerContainer');
				// Only set it to visible if it's currently hidden
				if (newPlayerContainer && (newPlayerContainer.style.display === "none" || newPlayerContainer.style.display === "")) {
					newPlayerContainer.style.display = "inline-flex";
					newPlayerContainer.style.flexDirection = "column";
				}
			} else {
				const playerName = playerDiv.getAttribute('data-player-name');
				handlePlayerSelection(playerName);
			}
		}
	});


    // Mobile: Handle Take Photo Button.
    takePhotoBtn.addEventListener("click", () => {
        const captureInput = document.createElement("input");
        captureInput.type = "file";
        captureInput.accept = "image/*";
        captureInput.setAttribute("capture", "environment");
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

    // Handle New Player Upload (Add Player) with separate validation.
    uploadPlayerBtn.addEventListener('click', async () => {
    uploadPlayerBtn.textContent = "Adding Player...";
    uploadPlayerBtn.disabled = true;
    
    // Determine which tab is active
    let file;
    if (storageTab && storageTab.classList.contains('active')) {
         // Use file selection mode
         const fileFromInput = playerUpload.files[0];
         file = fileFromInput || window.selectedFile;
    } else if (cameraTab && cameraTab.classList.contains('active')) {
         // Use camera capture mode
         file = window.capturedFile;
    }
    
    const playerName = playerNameInput.value.trim();
    // Validate file input.
    if (!file) {
         const errorMessage = isMobileDevice 
              ? "No image selected from gallery or camera." 
              : "No image selected for upload.";
         displayMessage(errorMessage);
         console.log("⚠️ Upload Failed - No file selected.");
         uploadPlayerBtn.textContent = "Add Player";
         uploadPlayerBtn.disabled = false;
         return;
    }
    // Validate player name input.
    if (!playerName) {
         displayMessage("Please enter a player name.");
         console.log("⚠️ Upload Failed - Missing name.");
         uploadPlayerBtn.textContent = "Add Player";
         uploadPlayerBtn.disabled = false;
         return;
    }
    if (players.some(player => player.name.toLowerCase() === playerName.toLowerCase())) {
         displayMessage(`A player named "${playerName}" already exists.`);
         console.log(`❌ Duplicate name detected: ${playerName}`);
         uploadPlayerBtn.textContent = "Add Player";
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
         // Reset the file input display: show the label and hide the file name display.
         const fileNameDisplay = document.getElementById('fileNameDisplay');
         const fileLabel = document.querySelector('#browse .file-label');
         if (fileNameDisplay && fileLabel) {
             fileNameDisplay.textContent = "";
             fileNameDisplay.style.display = "none";
             fileLabel.style.display = "inline";
         }
    } catch (error) {
         console.error("❌ Image Processing Failed:", error);
    } finally {
         uploadPlayerBtn.textContent = "Add Player";
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
    players.forEach((p, index) => {
        const isSelected = selectedPlayers.has(p.name);
        uploadedPlayersContainer.innerHTML += `
            <div class="player-selection ${isSelected ? 'selected' : ''}" data-player-name="${p.name}">
                ${index >= 2 ? `<button class="delete-player-btn" data-index="${index}">🗑</button>` : ""}
                <img src="${p.image}" onerror="this.src='images/default-avatar.png'" alt="${p.name}" class="player-img" style="width:214px;">
                <span class="player-name">${p.name}</span>
                ${isSelected ? `<div class="selected-tag">Selected</div>` : ''}
            </div>
        `;
        console.log(`✅ Player Rendered: ${p.name} (Selected: ${isSelected})`);
    });
    // Append the "Add New Player" card
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
