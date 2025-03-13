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
	const moveSound = new Audio('sounds/move.mp3');
	const winSound = new Audio('sounds/win.mp3');
	const drawSound = new Audio('sounds/draw.mp3');
	const restartSound = new Audio('sounds/restart.mp3');
	
    let currentPlayer;
    let gameActive = false;
    let gameState = ["", "", "", "", "", "", "", "", ""];

    // Player Names
    const playerXName = "Alex";
    const playerOName = "Martin";

    // Image sources
    const playerXSrc = "images/playerX.png"; // Replace with actual player X image
    const playerOSrc = "images/playerO.png"; // Replace with actual player O image

    // ✅ Load scores from localStorage or initialize to 0
    let playerXScore = localStorage.getItem("playerXScore") ? parseInt(localStorage.getItem("playerXScore")) : 0;
    let playerOScore = localStorage.getItem("playerOScore") ? parseInt(localStorage.getItem("playerOScore")) : 0;

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
            gameTitle.style.display = "none";
            gameScore.style.display = "block";
        } else {
            gameTitle.style.display = "block";
            gameScore.style.display = "none";
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

	
	
	// ✅ Store a reference to the currently playing sound
	let currentSound = null;
	
	function playSound(soundFile) {
		// ✅ Stop any currently playing sound before playing a new one
		if (currentSound) {
			currentSound.pause();
			currentSound.currentTime = 0; // Reset to the beginning
		}

		// ✅ Play new sound
		currentSound = new Audio(soundFile);
		currentSound.play();
	}


	function handleCellClick(clickedCellEvent) {
		if (!gameActive) return;

		const clickedCell = clickedCellEvent.target;
		const clickedCellIndex = Array.from(cells).indexOf(clickedCell);

		if (gameState[clickedCellIndex] !== "") return;

		updateCell(clickedCell, clickedCellIndex);

		// ✅ Run `checkResult()` FIRST to detect a win or draw
		let roundWon = checkResult();
		let gameIsDraw = !gameState.includes("") && !roundWon;

		if (!roundWon && !gameIsDraw) {
			playSound('sounds/move.mp3'); // ✅ Only play move sound if no win or draw happened
		}
	}


    function updateCell(cell, index) {
        gameState[index] = currentPlayer;

        // Add player image inside the cell
        const img = document.createElement("img");
        img.src = currentPlayer === "X" ? playerXSrc : playerOSrc;
        img.alt = currentPlayer === "X" ? playerXName : playerOName;
        cell.appendChild(img);

        // Apply highlight color based on player
        cell.classList.add(currentPlayer === "X" ? "blue-bg" : "orange-bg");
    }

	function changePlayer() {
		currentPlayer = currentPlayer === "X" ? "O" : "X";

		let currentPlayerImg = document.getElementById("currentPlayerImg");

		// ✅ Apply the flip animation
		currentPlayerImg.classList.add("flip");

		// ✅ Wait for the first half of the animation before changing the image
		setTimeout(() => {
			currentPlayerImg.src = currentPlayer === "X" ? playerXSrc : playerOSrc;
			currentPlayerImg.alt = currentPlayer === "X" ? playerXName : playerOName;

			// ✅ Update border colors
			currentPlayerImg.classList.remove("blue-border", "orange-border");
			currentPlayerImg.classList.add(currentPlayer === "X" ? "blue-border" : "orange-border");

			// ✅ Update the status message after switching players
			statusDisplay.textContent = `${currentPlayer === "X" ? playerXName : playerOName}'s turn`;

			// ✅ Ensure the correct status color matches the current player
			statusDisplay.classList.remove("status-blue", "status-orange");
			statusDisplay.classList.add(currentPlayer === "X" ? "status-blue" : "status-orange");

			// ✅ Finish the flip animation
			setTimeout(() => {
				currentPlayerImg.classList.remove("flip");
			}, 30);
		}, 100); // Half of 0.5s animation time
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
        
        // ✅ Show confetti
        if (confetti) {
            confetti.style.display = "block";
        }

        gameActive = false;

        // ✅ Update and save score correctly
        if (currentPlayer === "X") {
            playerXScore++;  
            localStorage.setItem("playerXScore", playerXScore);  
            playerXScoreDisplay.textContent = playerXScore;  
        } else {
            playerOScore++;
            localStorage.setItem("playerOScore", playerOScore);
            playerOScoreDisplay.textContent = playerOScore;
        }

        // ✅ Keep winning cells fully visible
        winningCells.forEach(cell => cell.classList.add("winning-cell"));

        // ✅ Disable only non-winning cells
        cells.forEach(cell => {
            if (!winningCells.includes(cell)) {
                cell.classList.add("disabled");
            }
        });

        // ✅ Show only the winner's image with rotation
        document.getElementById("currentPlayerContainer").innerHTML = `
            <img id="currentPlayerImg" src="${currentPlayer === "X" ? playerXSrc : playerOSrc}" 
            alt="${winnerName}" class="draw-img winner-rotate">
        `;

        // ✅ Swap to score title after game ends
        swapTitles(true);

        // ✅ Show the restart button
        restartBtn.classList.add('show');
        resetScoreBtn.classList.add('show');

        playSound('sounds/win.mp3'); // ✅ Play win sound immediately

        return true; // ✅ Now returning `true` so handleCellClick() knows not to play move sound
    }

    if (!gameState.includes("")) {
        statusDisplay.textContent = "It's a draw! 😕🤪😴";
        statusDisplay.classList.add('draw');
        gameActive = false;

        // ✅ Disable all cells if it's a draw
        cells.forEach(cell => cell.classList.add("disabled"));

        // ✅ Show both player images inside `currentPlayerContainer`
        document.getElementById("currentPlayerContainer").innerHTML = `
            <div class="draw-container">
                <img src="${playerXSrc}" alt="${playerXName}" class="draw-img">
                <img src="${playerOSrc}" alt="${playerOName}" class="draw-img">
            </div>
        `;

        // ✅ Swap to score title after game ends
        swapTitles(true);

        // ✅ Show the restart button
        restartBtn.classList.add('show');

        playSound('sounds/draw.mp3'); // ✅ Play draw sound immediately

        return true; // ✅ Now returning `true` so handleCellClick() knows not to play move sound
    }

    changePlayer();
    return false; // ✅ If no win or draw, return false so move sound can play
}





	function restartGame() {
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

		// ✅ Reset `#currentPlayerContainer` and re-add `currentPlayerImg`
		document.getElementById("currentPlayerContainer").innerHTML = `
			<img id="currentPlayerImg" src="${currentPlayer === "X" ? playerXSrc : playerOSrc}" 
			alt="${startingPlayerName}" class="${currentPlayer === "X" ? "blue-border" : "orange-border"}">
		`;

		// ✅ Set correct status color immediately
		statusDisplay.classList.remove("status-blue", "status-orange");
		statusDisplay.classList.add(currentPlayer === "X" ? "status-blue" : "status-orange");

		// ✅ Enable board again
		cells.forEach(cell => cell.classList.remove("disabled"));

		// ✅ Hide the restart button
		restartBtn.classList.remove('show');
		
		statusDisplay.classList.remove('draw');
		statusDisplay.classList.remove('bolder');
		confetti.style.display = "none";

		// ✅ Swap back to game title at the start of a new game
		swapTitles(false);
		
		playSound('sounds/restart.mp3');
	}




    // ✅ Reset the score when "Reset Score" button is clicked
    function resetScore() {
        localStorage.setItem("playerXScore", 0);
        localStorage.setItem("playerOScore", 0);
        playerXScore = 0;
        playerOScore = 0;
        playerXScoreDisplay.textContent = 0;
        playerOScoreDisplay.textContent = 0;

        updateResetScoreButton();

        // ✅ Restart game after resetting score
        restartGame();
    }

    restartBtn.addEventListener('click', restartGame);
    resetScoreBtn.addEventListener('click', resetScore);
    cells.forEach(cell => cell.addEventListener('click', handleCellClick));

    restartGame();
});


const confettiWrapper = document.querySelector('.confetti-wrapper');

// ✅ Adjust number of confetti (Reduce density)
const CONFETTI_COUNT = 15; // Lower number from 50 to 25

// Generate confetti
for (let i = 0; i < CONFETTI_COUNT; i++) {
  const confetti = document.createElement('div');
  confetti.classList.add('confetti-piece');

  // ✅ Reduce confetti size (CSS variable)
  confetti.style.setProperty('--confetti-size', `${Math.random() * 5 + 5}px`); // 5px to 10px

  // ✅ Slower fall speed (increase duration)
  confetti.style.setProperty('--fall-duration', `${Math.random() * 4 + 4}s`); // 4s to 8s

  // ✅ Spread confetti more randomly
  confetti.style.left = `${Math.random() * 100}%`;

  // ✅ Assign random color
  confetti.style.setProperty('--confetti-color', getRandomColor());

  confettiWrapper.appendChild(confetti);
}

// Random color generator
function getRandomColor() {
  const colors = ['#ff6347', '#ffa500', '#32cd32', '#1e90ff', '#ff69b4'];
  return colors[Math.floor(Math.random() * colors.length)];
}

