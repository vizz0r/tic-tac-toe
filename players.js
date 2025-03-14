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
        playerUpload.setAttribute("accept", "image/*"); // Ensures only image files are accepted
        playerUpload.setAttribute("capture", "environment"); // Forces rear camera on mobile devices
    }

    // Check if mobile (device with camera access)
    const isMobileDevice = /Mobi|Android|iPhone/i.test(navigator.userAgent);
    const hasCamera = navigator.mediaDevices && navigator.mediaDevices.getUserMedia;

    // If mobile device and camera access is available, show the Take Photo button
    if (isMobileDevice && hasCamera) {
        takePhotoBtn.style.display = "inline-block"; // Show Take Photo button
    } else {
        takePhotoBtn.style.display = "none"; // Hide Take Photo button for desktop
    }

    let players = JSON.parse(localStorage.getItem('players')) || [
        { name: 'Alex', image: 'images/playerX.png' },
        { name: 'Martin', image: 'images/playerO.png' }
    ];

    // ✅ Restore last used selected players from localStorage
    let storedSelectedPlayers = JSON.parse(localStorage.getItem('selectedPlayers'));
    let selectedPlayers = new Set();

    if (storedSelectedPlayers) {
        if (storedSelectedPlayers.player1) selectedPlayers.add(storedSelectedPlayers.player1);
        if (storedSelectedPlayers.player2) selectedPlayers.add(storedSelectedPlayers.player2);
    }

    // ✅ If only one player is selected and more exist, retain it instead of clearing
    if (selectedPlayers.size === 1 && players.length > 2) {
        console.log("⚠️ Only one player was selected on refresh. Retaining selection.");
    }

    // ✅ If NO players were selected and only Alex & Martin exist, default to them
    if (selectedPlayers.size === 0 && players.length === 2) {
        selectedPlayers.add('Alex');
        selectedPlayers.add('Martin');
    }

    // ✅ Ensure selected players persist in storage
    localStorage.setItem('selectedPlayers', JSON.stringify({
        player1: [...selectedPlayers][0],
        player2: [...selectedPlayers][1]
    }));

    console.log("✅ Players selected after load:", Array.from(selectedPlayers));

    renderPlayers();
    updateCheckboxState();

    // ✅ Handle Take Photo Button (Mobile)
    takePhotoBtn.addEventListener("click", () => {
        playerUpload.click(); // Open file input to trigger camera capture
    });

    // ✅ Handle Image Upload (Either File or Camera)
    playerUpload.addEventListener("change", (event) => {
        const file = event.target.files[0];
        handleImageUpload(file);
    });

    function handleImageUpload(file) {
        const playerName = playerNameInput.value.trim();

        // Don't validate here - validation is handled on upload button click
    }

    // ✅ This should be triggered when the "Upload" button is clicked
    uploadPlayerBtn.addEventListener('click', () => {
        const file = playerUpload.files[0];
        const playerName = playerNameInput.value.trim();

        // ✅ Validate if file and player name are both provided before processing
        if (!file || !playerName) {
            alert("Please take a photo or select an image and enter a name.");
            console.log("⚠️ Upload Failed - Missing Name or Image.");
            return;
        }

        // ✅ Prevent duplicate names
        const nameExists = players.some(player => player.name.toLowerCase() === playerName.toLowerCase());
        if (nameExists) {
            alert(`A player named "${playerName}" already exists. Choose a different name.`);
            console.log(`❌ Duplicate name detected: ${playerName}`);
            return;
        }

        // ✅ Convert Image to Base64 & Store
        const reader = new FileReader();
        reader.onload = function(event) {
            players.push({ name: playerName, image: event.target.result });
            savePlayers();
            renderPlayers();
            console.log(`✅ New Player Added: ${playerName}`);

            // ✅ Clear Inputs
            playerUpload.value = "";
            playerNameInput.value = "";
        };
        reader.readAsDataURL(file);
    });

    function savePlayers() {
        localStorage.setItem('players', JSON.stringify(players));
    }

    function saveSelectedPlayers() {
        localStorage.setItem('selectedPlayers', JSON.stringify(Array.from(selectedPlayers)));
        console.log("💾 Saved selected players:", Array.from(selectedPlayers));
    }

    function renderPlayers() {
        console.log("🔄 Rendering Players...");
        uploadedPlayersContainer.innerHTML = "";

        players.forEach((p, index) => {
            let isChecked = selectedPlayers.has(p.name) ? "checked" : "";

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

        attachEventListeners();
        updateCheckboxState();
    }

    function attachEventListeners() {
        console.log("🔗 Attaching Event Listeners...");

        document.querySelectorAll('.player-checkbox').forEach(checkbox => {
            checkbox.addEventListener('click', handlePlayerSelection);
        });

        document.querySelectorAll('.delete-player-btn').forEach(button => {
            button.addEventListener('click', deletePlayer);
        });
    }

    function handlePlayerSelection(event) {
        let selectedCheckboxes = document.querySelectorAll('input[name="selectedPlayer"]:checked');
        let currentlySelected = selectedCheckboxes.length;

        console.log(`🎯 Player Clicked: ${event.target.value} | Checked: ${event.target.checked}`);
        console.log(`ℹ️ Updated Selected Players Count: ${currentlySelected}`);

        // ❌ Prevent selecting more than 2 players
        if (event.target.checked && currentlySelected > 2) {
            event.target.checked = false;
            alert("You must deselect one player before selecting another.");
            console.log("❌ Too Many Players Selected! Unchecking last selection...");
            return;
        }

        // ❌ Prevent deselecting if only Alex & Martin remain
        if (!event.target.checked && selectedPlayers.size === 2 && players.length === 2) {
            event.preventDefault();
            event.target.checked = true;
            alert("At least two players must remain selected.");
            console.log("⚠️ Cannot deselect - Two players must always be selected.");
            return;
        }

        // ✅ Update `selectedPlayers` set based on checkbox state
        if (event.target.checked) {
            selectedPlayers.add(event.target.value);
        } else {
            selectedPlayers.delete(event.target.value);
        }

        // ✅ Persist selection immediately **without overwriting stored values**
        let updatedSelections = [...selectedPlayers];

        localStorage.setItem('selectedPlayers', JSON.stringify({
            player1: updatedSelections[0] || null,
            player2: updatedSelections[1] || null
        }));

        console.log("💾 Selections saved in storage:", localStorage.getItem('selectedPlayers'));

        // ✅ Update UI state for checkboxes
        updateCheckboxState();
    }

    function updateCheckboxState() {
        let selectedCheckboxes = document.querySelectorAll('input[name="selectedPlayer"]:checked');
        let currentlySelected = selectedCheckboxes.length;

        console.log(`🔄 Updating Checkbox State | Selected Players: ${currentlySelected}`);

        document.querySelectorAll('.player-checkbox').forEach(checkbox => {
            checkbox.disabled = false;
        });
    }

    function deletePlayer(event) {
        const playerIndex = parseInt(event.target.getAttribute("data-index"));
        console.log(`🗑️ Deleting Player at Index: ${playerIndex}`);

        if (playerIndex >= 2) {
            let selectedBeforeDelete = Array.from(document.querySelectorAll('input[name="selectedPlayer"]:checked'))
                .map(cb => cb.value);

            players.splice(playerIndex, 1);
            savePlayers();
            renderPlayers();

            // Restore previously selected players
            document.querySelectorAll('input[name="selectedPlayer"]').forEach(cb => {
                if (selectedBeforeDelete.includes(cb.value)) {
                    cb.checked = true;
                    selectedPlayers.add(cb.value);
                }
            });

            // ✅ If only Alex & Martin remain, ensure they are auto-selected
            if (players.length === 2 && players[0].name === "Alex" && players[1].name === "Martin") {
                console.log("🔄 Only Alex & Martin remain. Auto-selecting them.");
                selectedPlayers.clear();
                selectedPlayers.add('Alex');
                selectedPlayers.add('Martin');

                document.querySelectorAll('input[name="selectedPlayer"]').forEach(cb => {
                    cb.checked = selectedPlayers.has(cb.value);
                });
            }

            saveSelectedPlayers();
            updateCheckboxState();
        }
    }

    startGameBtn.addEventListener('click', () => {
        let selectedPlayersArr = [];
        document.querySelectorAll('input[name="selectedPlayer"]:checked').forEach(checkbox => {
            selectedPlayersArr.push(checkbox.value);
        });

        console.log(`🎮 Attempting to Start Game | Selected Players: ${selectedPlayersArr}`);

        if (selectedPlayersArr.length !== 2) {
            alert("Please select exactly two players.");
            return;
        }

        localStorage.setItem('selectedPlayers', JSON.stringify({ player1: selectedPlayersArr[0], player2: selectedPlayersArr[1] }));
        window.location.href = "index.html";
    });

    renderPlayers();
    updateCheckboxState();
});
