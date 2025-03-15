document.addEventListener('DOMContentLoaded', () => {
    console.log("📌 Page Loaded - Initializing Players");

    const uploadedPlayersContainer = document.getElementById('uploaded-players');
    const playerUpload = document.getElementById('playerUpload'); // File input for uploading image
    const playerNameInput = document.getElementById('playerName');
    const uploadPlayerBtn = document.getElementById('uploadPlayerBtn');
    const startGameBtn = document.getElementById('startGameBtn');
    const takePhotoBtn = document.getElementById('takePhotoBtn'); // Button for mobile camera

    // Only apply camera capture option if it's a mobile device
    if (playerUpload) {
        playerUpload.setAttribute("accept", "image/*"); // Only image files accepted
        playerUpload.setAttribute("capture", "environment"); // Forces rear camera on mobile
    }

    // Check for mobile device and camera access
    const isMobileDevice = /Mobi|Android|iPhone/i.test(navigator.userAgent);
    const hasCamera = navigator.mediaDevices && navigator.mediaDevices.getUserMedia;

    takePhotoBtn.style.display = (isMobileDevice && hasCamera) ? "inline-block" : "none";

    let players = JSON.parse(localStorage.getItem('players')) || [
        { name: 'Alex', image: 'images/playerX.png' },
        { name: 'Martin', image: 'images/playerO.png' }
    ];

    // Restore last used selected players from localStorage
    let storedSelectedPlayers = JSON.parse(localStorage.getItem('selectedPlayers'));
    let selectedPlayers = new Set();

    if (storedSelectedPlayers) {
        if (storedSelectedPlayers.player1) selectedPlayers.add(storedSelectedPlayers.player1);
        if (storedSelectedPlayers.player2) selectedPlayers.add(storedSelectedPlayers.player2);
    }

    // If only one player is selected and more exist, retain it instead of clearing
    if (selectedPlayers.size === 1 && players.length > 2) {
        console.log("⚠️ Only one player was selected on refresh. Retaining selection.");
    }
    // If no players were selected and only Alex & Martin exist, default to them
    if (selectedPlayers.size === 0 && players.length === 2) {
        selectedPlayers.add('Alex');
        selectedPlayers.add('Martin');
    }

    // Helper function to persist selected players to localStorage
    function persistSelectedPlayers() {
        localStorage.setItem('selectedPlayers', JSON.stringify({
            player1: [...selectedPlayers][0] || null,
            player2: [...selectedPlayers][1] || null
        }));
        console.log("💾 Persisted selected players:", localStorage.getItem('selectedPlayers'));
    }

    // Persist selections once on load
    persistSelectedPlayers();
    console.log("✅ Players selected after load:", Array.from(selectedPlayers));

    // Use event delegation for clicks within the players container.
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
        playerUpload.click();
    });

    // Handle Image Upload (Either File or Camera)
    uploadPlayerBtn.addEventListener('click', async () => {
        const file = playerUpload.files[0];
        const playerName = playerNameInput.value.trim();

        console.log("📌 Upload button clicked. Processing player:", playerName);

        if (!file || !playerName) {
            alert("Please take a photo or select an image and enter a name.");
            console.log("⚠️ Upload Failed - Missing Name or Image.");
            return;
        }

        if (players.some(player => player.name.toLowerCase() === playerName.toLowerCase())) {
            alert(`A player named "${playerName}" already exists.`);
            console.log(`❌ Duplicate name detected: ${playerName}`);
            return;
        }

        try {
            console.log("✅ Name is unique. Proceeding with image processing...");
            console.log("📸 Attempting to process image for:", playerName);
            console.log("🛠 File Details:", file);
            console.log("🛠 Players Before Processing:", players.map(p => p.name));
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

            // Clear Inputs
            playerUpload.value = "";
            playerNameInput.value = "";

        } catch (error) {
            console.error("❌ Image Processing Failed:", error);
        }
    });

    async function removeBackground(file) {
        console.log("🖼 Sending image to Remove.bg API...");
        const removeBgApiKey = "DM2d2GWCiDxUexxSrvbsV5ZA"; // Your API key
        const formData = new FormData();
        formData.append("image_file", file);
        formData.append("size", "auto");

        const response = await fetch("https://api.remove.bg/v1.0/removebg", {
            method: "POST",
            headers: { "X-Api-Key": removeBgApiKey },
            body: formData
        });

        if (!response.ok) {
            throw new Error(`❌ Remove.bg API Error: ${response.statusText}`);
        }
        console.log("✅ Received processed image from Remove.bg.");
        return response.blob();
    }

    async function applyRoundMask(imageBlob) {
        console.log("🎭 Applying round mask to image...");

        return new Promise((resolve) => {
            const img = new Image();
            img.onload = async () => {
                console.log("🖌 Drawing image on canvas...");
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                console.log("🖼 Image drawn on canvas. Proceeding with FaceMesh...");

                try {
                    if (!window.faceMeshModel) {
                        console.log("🤖 Loading FaceMesh model...");
                        window.faceMeshModel = await facemesh.load();
                        console.log("✅ FaceMesh Model Loaded.");
                    }
                    console.log("🔍 Running FaceMesh on canvas. Waiting for response...");

                    const faceDetectionTimeout = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error("⚠ FaceMesh timed out after 10 seconds.")), 10000)
                    );
                    const predictionsPromise = window.faceMeshModel.estimateFaces(canvas);
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
                    faceCenterY -= circleRadius * 0.23; // Move mask up

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
                    <img src="${p.image}" onerror="this.src='images/default-avatar.png'" alt="${p.name}" class="player-img">
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
