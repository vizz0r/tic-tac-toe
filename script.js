document.addEventListener('DOMContentLoaded', () => {
    const cells = document.querySelectorAll('[data-cell]');
    const restartBtn = document.getElementById('restartBtn');
    const resetScoreBtn = document.getElementById('resetScoreBtn');
    const statusDisplay = document.getElementById('status');
    const currentPlayerImg = document.getElementById('currentPlayerImg');
    const gameBoard = document.getElementById('board');
    const playerXScoreDisplay = document.getElementById('playerXScore');
    const playerOScoreDisplay = document.getElementById('playerOScore');
    const gameTitle = document.getElementById('gameTitle');
    const gameScore = document.getElementById('gameScore');
    const confetti = document.querySelector('.confetti-wrapper');

	let isMuted = JSON.parse(localStorage.getItem('isMuted')) || false;
	const muteBtn = document.getElementById('muteBtn');

	muteBtn.addEventListener('click', () => {
		isMuted = !isMuted;
		localStorage.setItem('isMuted', JSON.stringify(isMuted));
		updateMuteIcon();

		// 🚫 Stop any sound immediately when muting
		if (isMuted && currentSound) {
			currentSound.pause();
			currentSound.currentTime = 0;
			currentSound = null;
		}
	});

	// ✅ Helper to update icon based on state
	function updateMuteIcon() {
		muteBtn.textContent = isMuted ? '🔇' : '🔊';
	}


    let currentPlayer;
    let gameActive = false;
    let gameState = ["", "", "", "", "", "", "", "", ""];

// Load from localStorage or initialize default selection by IDs
let selectedPlayers = JSON.parse(localStorage.getItem('selectedPlayers')) || { 
    player1: 'player1',  // Reference the ID
    player2: 'player2'
};

// ✅ MIGRATION: If the old name-based format is detected, reset to ID-based
if (!selectedPlayers.player1.startsWith('player')) {
    console.warn("🚨 Old selectedPlayers format detected, migrating to ID-based selection.");
    selectedPlayers = { player1: 'player1', player2: 'player2' };
    localStorage.setItem('selectedPlayers', JSON.stringify(selectedPlayers));
}


// Load players from localStorage or default
let players = JSON.parse(localStorage.getItem('players')) || [
    { id: 'player1', name: 'Alex', image: 'images/playerX.png', isDefault: true },
    { id: 'player2', name: 'Martin', image: 'images/playerO.png', isDefault: true }
];

// Find selected player objects
let playerX = players.find(p => p.id === selectedPlayers.player1);
let playerO = players.find(p => p.id === selectedPlayers.player2);

    // NEW LOGIC: Build current match identifier and check if it has changed.
    const currentMatch = `${selectedPlayers.player1}-${selectedPlayers.player2}`;
    const lastMatch = localStorage.getItem("lastMatch");
if (lastMatch !== currentMatch) {
    localStorage.setItem(`score_${playerX.id}`, 0);
    localStorage.setItem(`score_${playerO.id}`, 0);
    localStorage.setItem("lastMatch", currentMatch);
    console.log("New match combination detected. Scores reset.");
}


    // ✅ Fetch correct scores from localStorage using player names
let playerXScore = parseInt(localStorage.getItem(`score_${playerX.id}`)) || 0;
let playerOScore = parseInt(localStorage.getItem(`score_${playerO.id}`)) || 0;


    console.log("Loaded Scores from localStorage:", playerXScore, playerOScore);

    // ✅ Update UI with correct scores after a brief delay
    setTimeout(() => {
		document.getElementById("playerXName").innerHTML = `${playerXName} (<span id="playerXScore">${playerXScore}</span>)`;
		document.getElementById("playerOName").innerHTML = `${playerOName} (<span id="playerOScore">${playerOScore}</span>)`;
    }, 100);
	
	updateScoreTitle();


// ✅ Patch any missing isDefault
players = players.map(p => {
    if (p.name === 'Alex' || p.name === 'Martin') {
        return { ...p, isDefault: true };
    }
    return { ...p, isDefault: p.isDefault ?? false };
});



// ✅ SAFETY CHECK - Add your warning here
if (!playerX) console.warn(`Player X "${selectedPlayers.player1}" not found!`);
if (!playerO) console.warn(`Player O "${selectedPlayers.player2}" not found!`);



    // ✅ Use these players in the game logic
    const playerXName = playerX.name;
    const playerOName = playerO.name;
    const playerXSrc = playerX.image;
    const playerOSrc = playerO.image;
	console.log("Player X:", playerX);
	console.log("Player O:", playerO);
	
	function updateScoreTitle() {
    const scoreTitle = document.getElementById('score-title');
		if (scoreTitle) {
			scoreTitle.textContent = `${playerXName} (${playerXScore}) v ${playerOName} (${playerOScore})`;
		}
	}


    // ✅ Function to update the Reset Score button visibility
    function updateResetScoreButton() {
        if (playerXScore > 0 || playerOScore > 0) {
            resetScoreBtn.classList.add("show");
        } else {
            resetScoreBtn.classList.remove("show");
        }
    }

    // ✅ Function to swap titles (Game Title ↔ Score Title)
    function swapTitles(showScore = false) {
        if (showScore) {
            gameTitle.style.display = "block";
            gameScore.style.display = "block";
        } else {
            gameTitle.style.display = "block";
            gameScore.style.display = "block";
        }
    }

    // ✅ Update score display on page load
    playerXScoreDisplay.textContent = playerXScore;
    playerOScoreDisplay.textContent = playerOScore;
    updateResetScoreButton();
    swapTitles(false); // Show game title first

    const winningConditions = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ];

    // ✅ Play sound helper: stops any currently playing sound before playing a new one.
    let currentSound = null;
	function playSound(soundFile) {
		if (isMuted) return;  // Respect mute state from storage
		if (currentSound) {
			currentSound.pause();
			currentSound.currentTime = 0;
		}
		currentSound = new Audio(soundFile);
		currentSound.play();
	}



    function handleCellClick(clickedCellEvent) {
        if (!gameActive) return;
        const clickedCell = clickedCellEvent.target;
        const clickedCellIndex = Array.from(cells).indexOf(clickedCell);
        if (gameState[clickedCellIndex] !== "") return;
        updateCell(clickedCell, clickedCellIndex);

        // ✅ Run checkResult() first to detect a win or draw
        let roundWon = checkResult();
        let gameIsDraw = !gameState.includes("") && !roundWon;
        if (!roundWon && !gameIsDraw) {
            playSound('sounds/move.mp3'); // Play move sound if no win or draw happened
        }
    }

function updateCell(cell, index) {
    gameState[index] = currentPlayer;

    // Create player image
const img = document.createElement("img");
img.src = currentPlayer === "X" ? playerXSrc : playerOSrc;
img.alt = currentPlayer === "X" ? playerXName : playerOName;
img.onerror = () => img.src = 'images/default-avatar.png';  // ✅ fallback if broken


    // ✅ Define the default players
    const defaultPlayers = ["Alex", "Martin"];

    // ✅ Check if the current player is NOT a default player
let isNewPlayer = currentPlayer === "X" ? !playerX?.isDefault : !playerO?.isDefault;

    // ✅ Apply "new-player" class ONLY to newly added players
if (isNewPlayer) {
    img.classList.add("new-player");
}

    // Append the image inside the cell
    cell.appendChild(img);

    // Apply highlight color based on player
    cell.classList.add(currentPlayer === "X" ? "blue-bg" : "orange-bg");
}


    function changePlayer() {
        currentPlayer = currentPlayer === "X" ? "O" : "X";
        let currentPlayerImg = document.getElementById("currentPlayerImg");
        // ✅ Apply the flip animation
        currentPlayerImg.classList.add("flip");
        setTimeout(() => {
            currentPlayerImg.src = currentPlayer === "X" ? playerXSrc : playerOSrc;
            currentPlayerImg.alt = currentPlayer === "X" ? playerXName : playerOName;
            currentPlayerImg.classList.remove("blue-border", "orange-border");
            currentPlayerImg.classList.add(currentPlayer === "X" ? "blue-border" : "orange-border");
            statusDisplay.textContent = `${currentPlayer === "X" ? playerXName : playerOName}'s turn`;
            statusDisplay.classList.remove("status-blue", "status-orange");
            statusDisplay.classList.add(currentPlayer === "X" ? "status-blue" : "status-orange");
            setTimeout(() => {
                currentPlayerImg.classList.remove("flip");
            }, 30);
        }, 100);
    }

    function checkResult() {
        let roundWon = false;
        let winningCells = [];
        for (let condition of winningConditions) {
            const [a, b, c] = condition;
            if (gameState[a] && gameState[a] === gameState[b] && gameState[a] === gameState[c]) {
                roundWon = true;
                winningCells = [cells[a], cells[b], cells[c]];
                break;
            }
        }

        if (roundWon) {
            let winnerName = currentPlayer === "X" ? playerXName : playerOName;
            statusDisplay.textContent = `${winnerName} is the winner !!!`;
            statusDisplay.classList.add('bolder');
            if (confetti) {
                confetti.style.display = "block";
            }
            gameActive = false;
            // Retrieve both scores BEFORE updating to prevent overwriting issues
			let storedXScore = parseInt(localStorage.getItem(`score_${playerX.id}`)) || 0;
			let storedOScore = parseInt(localStorage.getItem(`score_${playerO.id}`)) || 0;
            console.log(`Before update - X: ${storedXScore}, O: ${storedOScore}`);
			if (currentPlayer === "X") {
				storedXScore++;
				localStorage.setItem(`score_${playerX.id}`, storedXScore);
			} else {
				storedOScore++;
				localStorage.setItem(`score_${playerO.id}`, storedOScore);
			}

            document.getElementById("playerXScore").textContent = storedXScore;
            document.getElementById("playerOScore").textContent = storedOScore;
            console.log(`After update - X: ${storedXScore}, O: ${storedOScore}`);
			
			updateScoreTitle();
			
            winningCells.forEach(cell => cell.classList.add("winning-cell"));
            cells.forEach(cell => {
                if (!winningCells.includes(cell)) {
                    cell.classList.add("disabled");
                }
            });
            document.getElementById("currentPlayerContainer").innerHTML = `
                <img id="currentPlayerImg" src="${currentPlayer === "X" ? playerXSrc : playerOSrc}" 
                alt="${winnerName}" class="draw-img winner-rotate">
            `;
            swapTitles(true);
            restartBtn.classList.add('show');
            resetScoreBtn.classList.add('show');
            playSound('sounds/win.mp3');
            return true;
        }

        if (!gameState.includes("")) {
            statusDisplay.textContent = "It's a draw! 😕🤪😴";
            statusDisplay.classList.add('draw');
            gameActive = false;
            cells.forEach(cell => cell.classList.add("disabled"));
            document.getElementById("currentPlayerContainer").innerHTML = `
                <div class="draw-container">
                    <img src="${playerXSrc}" alt="${playerXName}" class="draw-img">
                    <img src="${playerOSrc}" alt="${playerOName}" class="draw-img">
                </div>
            `;
            swapTitles(true);
            restartBtn.classList.add('show');
            playSound('sounds/draw.mp3');
            return true;
        }

        changePlayer();
        return false;
    }

    let hasGameStarted = false;
    function restartGame(userTriggered = false) {
        gameActive = true;
        gameState.fill("");
        cells.forEach(cell => {
            cell.innerHTML = "";
            cell.classList.remove("blue-bg", "orange-bg", "winning-cell", "disabled");
        });
        // ✅ Randomly pick who starts
        currentPlayer = Math.random() < 0.5 ? "X" : "O";
        let startingPlayerName = currentPlayer === "X" ? playerXName : playerOName;
        statusDisplay.textContent = `${startingPlayerName} starts first`;
        document.getElementById("currentPlayerContainer").innerHTML = `
            <img id="currentPlayerImg" src="${currentPlayer === "X" ? playerXSrc : playerOSrc}" 
            alt="${startingPlayerName}" class="${currentPlayer === "X" ? "blue-border" : "orange-border"}">
        `;
        statusDisplay.classList.remove("status-blue", "status-orange");
        statusDisplay.classList.add(currentPlayer === "X" ? "status-blue" : "status-orange");
        cells.forEach(cell => cell.classList.remove("disabled"));
        restartBtn.classList.remove('show');
        statusDisplay.classList.remove('draw', 'bolder');
        confetti.style.display = "none";
        swapTitles(false);
        if (userTriggered && hasGameStarted) {
            playSound('sounds/restart.mp3');
        }
        hasGameStarted = true;
    }

    // ✅ Reset score when "Reset Score" button is clicked
    function resetScore() {
        // Clear scores in localStorage
		localStorage.removeItem(`score_${playerX.id}`);
		localStorage.removeItem(`score_${playerO.id}`);
        // Reset scores in memory
        playerXScore = 0;
        playerOScore = 0;
        // Update localStorage and UI
		localStorage.setItem(`score_${playerX.id}`, 0);
		localStorage.setItem(`score_${playerO.id}`, 0);
        document.getElementById("playerXScore").textContent = "0";
        document.getElementById("playerOScore").textContent = "0";
        console.log("Scores reset successfully.");
        updateResetScoreButton();
        restartGame(true);
		updateScoreTitle();
    }

    restartBtn.addEventListener('click', () => restartGame(true));
    resetScoreBtn.addEventListener('click', resetScore);
    cells.forEach(cell => cell.addEventListener('click', handleCellClick));

    // ✅ Initialize the icon when the page loads
    updateMuteIcon();

    // Start the game (initial load, no sound)
    restartGame(false);
});

// Confetti Generation (outside DOMContentLoaded)
const confettiWrapper = document.querySelector('.confetti-wrapper');
// ✅ Adjust number of confetti (reduce density)
const CONFETTI_COUNT = 15; // Reduced number
for (let i = 0; i < CONFETTI_COUNT; i++) {
  const confetti = document.createElement('div');
  confetti.classList.add('confetti-piece');
  // ✅ Reduce confetti size
  confetti.style.setProperty('--confetti-size', `${Math.random() * 5 + 5}px`); // 5px to 10px
  // ✅ Slower fall speed
  confetti.style.setProperty('--fall-duration', `${Math.random() * 4 + 4}s`); // 4s to 8s
  // ✅ Spread confetti randomly
  confetti.style.left = `${Math.random() * 100}%`;
  // ✅ Assign random color
  confetti.style.setProperty('--confetti-color', getRandomColor());
  confettiWrapper.appendChild(confetti);
}

function getRandomColor() {
  const colors = ['#ff6347', '#ffa500', '#32cd32', '#1e90ff', '#ff69b4'];
  return colors[Math.floor(Math.random() * colors.length)];
}
