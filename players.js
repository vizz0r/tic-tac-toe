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

/**
 * Downscale an image to a maximum dimension while preserving aspect ratio.
 * @param {Blob|File} file - The original image file.
 * @param {number} maxDimension - The maximum width or height (e.g., 1200).
 * @returns {Promise<Blob>} - A Promise that resolves to the downscaled JPEG blob.
 */
function downscaleImage(file, maxDimension = 1200) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

      // Only downscale if the image is bigger than maxDimension in either dimension
      if (width > maxDimension || height > maxDimension) {
        const aspectRatio = width / height;
        if (width > height) {
          width = maxDimension;
          height = Math.round(maxDimension / aspectRatio);
        } else {
          height = maxDimension;
          width = Math.round(maxDimension * aspectRatio);
        }
      }

      // Draw the scaled image onto a canvas
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, width, height);

      // Convert canvas back to a Blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Downscale failed: Canvas is empty."));
          }
        },
        "image/png",
        0.95 // JPEG quality (0.0 to 1.0). Adjust as needed
		// Sharepning value "0.95" ignored when PNG is used
      );
    };
    img.onerror = (err) => reject(err);

    // Turn your File/Blob into a local URL so <img> can load it
    img.src = URL.createObjectURL(file);
  });
}

// Apply a sharpen filter using a 3x3 convolution kernel that sums to 1
function applySharpen(imageData) {
    const width = imageData.width, height = imageData.height;
    const src = imageData.data;
    const output = new Uint8ClampedArray(src.length);
    const kernel = [
        /* 0, -1,  0,
        -1,  5, -1,
         0, -1,  0 */ /* sharper */
		 
		/* 0, -0.5, 0,
		-0.5, 3, -0.5,
		0, -0.5, 0 */  /* milder */
		
		0, -0.25, 0,
		-0.25, 2, -0.25,
		0, -0.25, 0  /* even gentler */

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

            // Turn off smoothing and apply CSS filters
            ctx.imageSmoothingEnabled = false;
            ctx.filter = "brightness(105%) contrast(105%) saturate(120%)";

            // White background fill, then draw
            //ctx.fillStyle = "#ffffff";  // Breaks PNG, so removed
            //ctx.fillRect(0, 0, canvas.width, canvas.height); // Breaks PNG, so removed
            ctx.drawImage(img, 0, 0);

            // Sharpen the result
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const sharpenedData = applySharpen(imageData);
            ctx.putImageData(sharpenedData, 0, 0);
			
            // Convert final to a Blob (PNG - no quality parameter needed)
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error("Processing image failed."));
                }
            }, "image/png"); // Sharpening value "image/jpeg", 1.00" ignored when PNG is used
        };
        img.onerror = (error) => reject(error);
        img.src = URL.createObjectURL(file);
    });
}


//NEW Version - Multi-API attempts
// ✅ UPDATED: Toggle to skip background removal API (starts as false to enable API attempts)
let SKIP_BG_API = false;

// ✅ UPDATED: Remove background using remove.bg API with multi-key fallback
async function removeBackground(file) {
    console.log("🖼 Sending raw (or downscaled) image to remove.bg API...");

    const apiKeys = [
        "XLZeaz7xuaVeVxX8mPnMR7Mw",   // Primary key
        "KjPdyp9s7MMbP3H8JEcscay8",   // Secondary key
        "o8Az4Tb8EwwF1RbxsUmw7r1z",    // Tertiary key
        "frpLhcePEKLLiuBo1mwDXXtg"    // BH1@
    ];

    const formData = new FormData();
    formData.append("image_file", file);
    formData.append("size", "auto");
	formData.append("format", "png");

    // ✅ Try each API key until success
    for (let i = 0; i < apiKeys.length; i++) {
        const removeBgApiKey = apiKeys[i];
        console.log(`🔄 Trying Remove.bg API Key #${i + 1}`);
		
		// ✅ RECREATE FormData each time since fetch consumes it
        const formData = new FormData();
        formData.append("image_file", file);
        formData.append("size", "auto");

        try {
            const response = await fetch("https://api.remove.bg/v1.0/removebg", {
                method: "POST",
                headers: { "X-Api-Key": removeBgApiKey },
                body: formData
            });

            if (response.ok) {
                console.log(`🎨 Removing Background via remove.bg (API Key #${i + 1} ✅ SUCCESS)`);
                return response.blob();
            } else {
                const errorDetails = await response.text();
                console.warn(`❌ API Key #${i + 1} failed: ${response.statusText}. Details: ${errorDetails}`);

                // ✅ Optional: Detect quota-related errors (case-insensitive)
                if (/quota/i.test(errorDetails)) {
                    console.warn("⚠️ API quota reached for this key.");
                }
            }
        } catch (err) {
            console.error(`❌ Error with API Key #${i + 1}:`, err);
        }
    }

    // ✅ All attempts failed, fallback to skipping background removal
    console.warn("🚨 All Remove.bg API keys failed. Skipping background removal.");
    SKIP_BG_API = true;
    return file;  // ✅ Return original file so processing continues
}



// OLD Working version
/* // Toggle to skip background removal API (set to true for testing without API)
const SKIP_BG_API = true;

// Remove background using remove.bg API without double-processing
async function removeBackground(file) {
    console.log("🖼 Sending raw (or downscaled) image to remove.bg API...");
    const removeBgApiKey = "XLZeaz7xuaVeVxX8mPnMR7Mw"; // Replace with your API key
    const formData = new FormData();
    formData.append("image_file", file);
    formData.append("size", "auto");

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
} */


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
                
                // Expand crop size by 40% for zoom-out effect
                const squareSize = Math.max(faceWidth, faceHeight) * 1.4;

                const faceCenterX = minX + faceWidth / 2;
                let faceCenterY = minY + faceHeight / 2;
                faceCenterY -= squareSize * 0.1; // moves the cropping area upward slightly

                // Define square cropping area
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

                //resolve(croppedCanvas.toDataURL("image/png")); // final dataURL
                resolve(croppedCanvas.toDataURL("image/png", 0.95)); // final dataURL
				// Sharepning value "0.95" ignored when PNG is used
            } catch (error) {
                console.error("❌ Error during FaceMesh processing:", error);
                resolve(canvas.toDataURL("image/png", 0.95));
				// Sharepning value "0.95" ignored when PNG is used
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

    // Adds drop shadow on page scroll
	window.addEventListener('scroll', () => {
		const selectionTitle = document.getElementById('selection-title');
		if (selectionTitle) {
			if (window.scrollY > 0) {
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
	
	let activeDetectCameraClosure = null;
	let activeFocusListener = null;
	let editingPlayerId = null;  // Holds the player name being edited
	let activeFile = null;  // ✅ Used to track the last previewed/attached image
	
	function cleanupFocusListener() {
		if (activeFocusListener) {
			window.removeEventListener("focus", activeFocusListener);
			activeFocusListener = null;
		}
	}


    /**
     * Displays the preview + confirmation message.
     * @param {string} imageSrc - The image URL to preview.
     * @param {boolean} fromCamera - Whether this image is from the camera or from browse.
     */
function updateUIAfterImageSelection(imageSrc, fromCamera) {
	 // 🔄 Clear any old messages (error or success)
    document.querySelectorAll('.errorMessage').forEach(el => el.remove());
    let oldConfirm = document.getElementById("photoConfirmMessage");
    if (oldConfirm) oldConfirm.remove();
	
    // Show name input and upload button
    playerNameInput.style.display = "block";
    uploadPlayerBtn.style.display = "block";

    // Remove any existing confirmation or preview container
    const oldPreviewContainer = document.getElementById("previewContainer");
    if (oldPreviewContainer) oldPreviewContainer.remove();

    // Create a new confirmation message
    const confirmMsg = document.createElement("div");
    confirmMsg.id = "photoConfirmMessage";
    confirmMsg.style.marginBottom = "5px";
    confirmMsg.style.fontWeight = "500";
    confirmMsg.style.color = "green";
    confirmMsg.textContent = fromCamera
        ? "🖼️ Photo taken and attached for preview"
        : "🖼️ File attached for preview";

    // Create the main preview container (flex row)
    const previewContainer = document.createElement("div");
    previewContainer.id = "previewContainer";

    // Create the image + delete button container (left side)
    const previewContent = document.createElement("div");
    previewContent.id = "previewContent";

    // Create the preview image
    const imagePreview = document.createElement("img");
    imagePreview.id = "imagePreview";
    imagePreview.style.width = "120px";
    imagePreview.style.marginTop = "5px";
    imagePreview.src = imageSrc;

    // Create the delete (cross) button
    const deletePreviewBtn = document.createElement("button");
    deletePreviewBtn.id = "deletePreviewBtn";
    deletePreviewBtn.textContent = "❌";
    deletePreviewBtn.style.cursor = "pointer";
    deletePreviewBtn.style.border = "none";
    deletePreviewBtn.style.background = "rgb(255 255 255 / 75%)";
    deletePreviewBtn.style.fontSize = "14px";
    deletePreviewBtn.setAttribute('title', 'Clear attachment');

    // Append image and delete button into the image container
    previewContent.appendChild(imagePreview);
    previewContent.appendChild(deletePreviewBtn);

    // ✅ Create the input and button block (right side)
    const inputAndButton = document.createElement("div");
    inputAndButton.id = "inputAndButtonContainer";
    inputAndButton.appendChild(playerNameInput);
    inputAndButton.appendChild(uploadPlayerBtn);

    // ✅ Append both sections side by side
    previewContainer.appendChild(previewContent);
    previewContainer.appendChild(inputAndButton);

    // Append the confirmation message and the preview container
	newPlayerContainer.appendChild(confirmMsg);
	newPlayerContainer.appendChild(previewContainer);

    // Delete button logic to reset everything
    deletePreviewBtn.addEventListener("click", () => {
        previewContainer.remove();
        confirmMsg.remove();

        // Clear file references
        if (playerUpload) playerUpload.value = "";
        window.capturedFile = null;

        // Reset file name display if exists
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
            tabStorage.classList.add('active');
            tabCamera.classList.remove('active');
            tabContentStorage.style.display = 'block';
            tabContentCamera.style.display = 'none';
        }

        console.log("New player form displayed. Reset to 'Open Gallery' tab.");
    });
}


// If "Browse" button is clicked, open file picker
if (browseButton && playerUpload) {
    browseButton.addEventListener('click', () => {
        console.log("Browse button clicked.");
        playerUpload.click();

        // ✅ Clean up any pending camera closure detection using the centralized function
        cleanupFocusListener();

        // ✅ Optional: clear the closure reference
        activeDetectCameraClosure = null;
    });
}





    // If user picks a file from "Browse"
if (playerUpload) {
    playerUpload.addEventListener('change', () => {
        const file = playerUpload.files[0];
        if (file) {
			// ✅ Validate that it's an image
            if (!file.type.startsWith('image/')) {
                console.warn("🚫 Selected file is not an image:", file.type);
                displayMessage("Please select a valid image format.");
                playerUpload.value = ""; // Reset the input
                return;
            }
			
            console.log("🖼️ File selected from gallery. Attaching preview...");
            const imageSrc = URL.createObjectURL(file);

            // Show "File attached for preview" (not appended to fileNameDisplay)
            updateUIAfterImageSelection(imageSrc, false);
			
			activeFile = file;  // ✅ ✅ ✅ This line is critical for upload to see the file
			console.log("✅ activeFile set from Browse:", activeFile);

            // Show the file name only
            if (fileNameDisplay && fileLabel) {
                fileNameDisplay.textContent = file.name;  // ❌ Removed "(attached for preview)"
                fileNameDisplay.style.display = "inline-block";
                fileLabel.style.display = "none";
            }
			
			window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
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

    // ✅ Clean up any previous closure listener
    if (activeDetectCameraClosure) {
        window.removeEventListener("focus", activeDetectCameraClosure);
        activeDetectCameraClosure = null;
    }

    cameraOpen = true;
    photoTaken = false;

activeDetectCameraClosure = function detectCameraClosure() {
    console.log("🔎 Checking camera closure...");

    if (photoTaken) {
        console.log("✅ Photo confirmed. Skipping error message.");
        cleanupFocusListener();   // ✅ Clean up here
        activeDetectCameraClosure = null;
        return;
    }

if (cameraOpen && !photoTaken) {
    const previewExists = document.getElementById("previewContainer");
    if (previewExists) {
        console.log("✅ Preview already exists. Skipping error message.");
    } else {
        console.log("❌ Camera was closed without taking a photo and no preview exists.");
        deselectAllTabs();
        document.querySelectorAll('.errorMessage').forEach(el => el.remove());
        const errorMsg = document.createElement("div");
        errorMsg.className = "errorMessage";
        errorMsg.style.marginBottom = "5px";
        errorMsg.style.fontWeight = "bold";
        errorMsg.style.color = "#FF0000";
        errorMsg.textContent = "⚠ No photo attached. Make a selection.";
        newPlayerContainer.appendChild(errorMsg);
    }
}


    cleanupFocusListener();   // ✅ Clean up here too
    activeDetectCameraClosure = null;
};


// Clean up any previous listener
if (activeFocusListener) {
    window.removeEventListener("focus", activeFocusListener);
    activeFocusListener = null;
}

activeFocusListener = () => {
    if (!photoTaken) {
        setTimeout(activeDetectCameraClosure, 400);
    }
};
window.addEventListener("focus", activeFocusListener);


    // ✅ Create capture input here
    const captureInput = document.createElement("input");
    captureInput.type = "file";
    captureInput.accept = "image/*";
    captureInput.setAttribute("capture", "environment");
    captureInput.style.display = "none";
    document.body.appendChild(captureInput);

    captureInput.addEventListener("change", () => {
        const file = captureInput.files[0];
        if (file) {
            console.log("✅ Photo taken. Attaching for preview...");
            const imageSrc = URL.createObjectURL(file);

            updateUIAfterImageSelection(imageSrc, true);
			
			activeFile = file;  // ✅ ✅ ✅ Also critical here
			console.log("✅ activeFile set from Camera:", activeFile);

            window.capturedFile = file;
            cameraOpen = false;
            photoTaken = true;

            // ✅ Optional file label cleanup
            if (fileNameDisplay && fileLabel) {
                fileNameDisplay.textContent = "";
                fileNameDisplay.style.display = "none";
                fileLabel.style.display = "inline";
            }

setTimeout(() => {
    console.log("🔄 Deselecting tabs after successful photo.");
    deselectAllTabs();
}, 50);

        } else {
            console.log("❌ No photo taken. Camera closed. Deselecting tabs.");
            deselectAllTabs();
        }
		
		window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
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

// 1. Ensure players have IDs when loaded
let players = JSON.parse(localStorage.getItem('players')) || [
    { id: 'player1', name: 'Alex', image: 'images/playerX.png', isDefault: true },
    { id: 'player2', name: 'Martin', image: 'images/playerO.png', isDefault: true }
];

// 2. Load selectedPlayers from storage
let storedSelectedPlayers = JSON.parse(localStorage.getItem('selectedPlayers'));
let selectedPlayers = new Set();

if (storedSelectedPlayers) {
    if (storedSelectedPlayers.player1) selectedPlayers.add(storedSelectedPlayers.player1);
    if (storedSelectedPlayers.player2) selectedPlayers.add(storedSelectedPlayers.player2);
}

// 3. Fallback safely if empty
if (selectedPlayers.size === 0 && players.length >= 2 && players[0].id && players[1].id) {
    console.log("✅ No selected players found, defaulting to first two players");
    selectedPlayers.add(players[0].id);
    selectedPlayers.add(players[1].id);
}


function persistSelectedPlayers() {
    const ids = Array.from(selectedPlayers).filter(id => id);  // ✅ Filter out null/undefined
    localStorage.setItem('selectedPlayers', JSON.stringify({
        player1: ids[0] || null,
        player2: ids[1] || null
    }));
    console.log("💾 Persisted selected players:", localStorage.getItem('selectedPlayers'));
}


    persistSelectedPlayers();
    console.log("✅ Players selected after load:", Array.from(selectedPlayers));

uploadedPlayersContainer.addEventListener('click', (event) => {
    // ✅ Skip if clicking inside the editing <input>
    if (event.target.closest('input')) {
        console.log('✏ Clicked inside editing input - skip player selection');
        return;
    }

    if (event.target.closest('.delete-player-btn')) {
        deletePlayer(event);
        return;
    }

    // ✅ Prevent selection if editing player name
    if (event.target.closest('.editable-text')) {
        console.log('✏ Editing mode - skip player select');
        return;
    }

    const playerDiv = event.target.closest('.player-selection');
    if (playerDiv) {
        if (playerDiv.classList.contains('add-new')) {
            console.log("🆕 Add New Player clicked");
            newPlayerContainer.style.display = "inline-flex";	

			// ✅ Reset playerUpload file input (to avoid persists the previous file)
			playerUpload.value = "";

			// ✅ Clear the stale capturedFile reference (to avoid holding the last camera capture)
			window.capturedFile = null;
			
			window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
            return;
        } else {
            const playerId = playerDiv.getAttribute('data-player-id');
            handlePlayerSelection(playerId);
        }
    }
});




// Upload button logic with conditional background removal API call.
uploadPlayerBtn.addEventListener("click", async () => {
    uploadPlayerBtn.textContent = "Uploading...";
    const spinner = document.createElement("span");
    spinner.classList.add("spinner");
    uploadPlayerBtn.appendChild(spinner);
    uploadPlayerBtn.prepend(spinner);
    uploadPlayerBtn.style.pointerEvents = "none";
    browseButton.style.pointerEvents = "none";

    try {
        // 🔄 UPDATED: Use activeFile instead of checking upload/camera directly
        let file = activeFile; // 🔄 <-- Now always respects last previewed image

        if (!file) {
            const errorMessage = isMobileDevice
                ? "No image selected from gallery or camera."
                : "No image selected for upload.";
            displayMessage(errorMessage);
            console.log("⚠️ Upload Failed - No file selected.");
            return;  // 🔄 No need to reset pointerEvents here because finally runs
        }

        // 2) Validate player name
        const playerName = playerNameInput.value.trim();
        console.log("Player name entered:", playerName);

        if (!playerName) {
            displayMessage("Please enter a player name.");
            console.log("⚠️ Upload Failed - Missing name.");
            return;  // 🔄 let finally handle the button state reset
        }

        // 3) Check for duplicates
        if (players.some(p => p.name.toLowerCase() === playerName.toLowerCase())) {
            displayMessage(`A player named "${playerName}" already exists.`);
            console.log(`❌ Duplicate name detected: ${playerName}`);
            return;  // 🔄 let finally handle the button state reset
        }

        console.log("✅ Name is unique. Proceeding with image processing...");
        console.log("🛠 File Details:", file);

        // 4) Downscale the image if it's too large (e.g., max 1200px)
        console.log("📐 Downscaling image if necessary...");
        const downscaledBlob = await downscaleImage(file, 1200);

        // 5) Conditionally remove background
        /* let bgBlob;
        if (!SKIP_BG_API) {
            console.log("🎨 Removing Background via remove.bg...");
            bgBlob = await removeBackground(downscaledBlob);
        } else {
            console.log("😊 Skipping background removal API.");
            bgBlob = downscaledBlob;
        } */
		console.log("🎨 Processing background removal (with fallback)...");
		const bgBlob = await removeBackground(downscaledBlob);


        // 6) Apply brightness/contrast/saturate/sharpen (single pass)
        console.log("🛠 Applying filters and sharpening...");
        const processedBlob = await processImage(bgBlob);

        // 7) Face crop
        console.log("🔵 Applying Face Cropping...");
        const finalImage = await cropFaceToSquare(processedBlob);

        // 8) Add new player and update UI
        const newPlayerId = `player_${Date.now()}`;
        players.push({ id: newPlayerId, name: playerName, image: finalImage, isDefault: false });
        savePlayers();
        renderPlayers();
        console.log(`✅ New Player Added: ${playerName}`);

        // 9) Reset UI
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
        const previewContainer = document.getElementById("previewContainer");
        if (previewContainer) previewContainer.remove();
        playerNameInput.value = "";
        playerNameInput.style.display = "none";
        uploadPlayerBtn.style.display = "none";

        // 10) Reset tabs to "Browse" mode using a safe block
        const tabStorage = document.getElementById('tabStorage');
        const tabCamera = document.getElementById('tabCamera');
        const tabContentStorage = document.getElementById('tabContentStorage');
        const tabContentCamera = document.getElementById('tabContentCamera');
        if (tabStorage && tabCamera && tabContentStorage && tabContentCamera) {
            tabStorage.classList.add('active');
            tabCamera.classList.remove('active');
            tabContentStorage.style.display = 'block';
            tabContentCamera.style.display = 'none';
        }

        console.log("📂 Player image processed and UI updated.");
    } catch (error) {
        console.error("❌ Image Processing Failed:", error);
    } finally {
        uploadPlayerBtn.textContent = "Upload Player";
        uploadPlayerBtn.disabled = false;
        // ✅ Re-enable pointer events here
        uploadPlayerBtn.style.pointerEvents = "auto";
        browseButton.style.pointerEvents = "auto";

        // 🔄 UPDATED: Clear activeFile and capturedFile after successful upload
        activeFile = null;
        window.capturedFile = null;
        playerUpload.value = ""; // Optional clean-up to fully reset the file input
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
        let isNewPlayer = !p.isDefault;
        const isSelected = selectedPlayers.has(p.id);  // ✅ Use ID for selection check

        uploadedPlayersContainer.innerHTML += `
          <div class="player-selection ${isSelected ? 'selected' : ''} ${isNewPlayer ? 'new-player' : ''}" data-player-id="${p.id}">
            <img src="${p.image}" onerror="this.src='images/default-avatar.png'" alt="${p.name}" class="player-img">

            ${editingPlayerId === p.id
              ? `<span class="edit-icon">✏️</span>
                 <input type="text" class="player-name-input" value="${p.name}" 
                        style="max-width: 85%; font-size: 16px; padding: 5px 7px;">`
              : `<span class="player-name editable-text">${p.name}</span>`
            }

            ${index >= 2 ? `<button title="Delete player" class="delete-player-btn" data-index="${index}">❌</button>` : ""}
            <div class="selected-tag">SELECTED</div>

          </div>
        `;

        console.log(`✅ Player Rendered: ${p.name} (Selected: ${isSelected}, New Player: ${isNewPlayer})`);
    });

    // ✅ Add "Add New Player" card
    uploadedPlayersContainer.innerHTML += `
        <div class="player-selection add-new" data-action="add-new">
            <span class="plus-icon">+</span>
            <span class="player-name">Add New Player</span>
        </div>
    `;

    updateSelectionTitle(false);

    // ✅ Re-bind editable spans
    uploadedPlayersContainer.querySelectorAll('.editable-text').forEach(makeSpanEditable);

    // ✅ Re-bind active input for editing
    const activeInput = document.querySelector('.player-name-input');
    if (activeInput) {
        activeInput.focus();
        activeInput.select();

        activeInput.addEventListener('blur', saveEditedName);
        activeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveEditedName.call(activeInput);
        });
    }
}

// Helper function to toggle the 'selected' class
function togglePlayerSelectionClass(playerId) {
    const playerDiv = document.querySelector(`.player-selection[data-player-id="${playerId}"]`);
    if (playerDiv) {
        playerDiv.classList.toggle('selected');
    }
}



function handlePlayerSelection(playerId) {
    if (selectedPlayers.has(playerId)) {
        selectedPlayers.delete(playerId);
        console.log(`Deselected player: ${playerId}`);
    } else {
        if (selectedPlayers.size >= 2) {
            displayMessage("You must deselect one player before selecting another.");
            console.log("❌ Cannot select more than 2 players.");
            return;
        }
        selectedPlayers.add(playerId);
        console.log(`Selected player: ${playerId}`);
    }

    persistSelectedPlayers();
    togglePlayerSelectionClass(playerId);

    // ✅ Update title and start button state
    updateSelectionTitle(true);

    // ✅ Scroll only if we now have 2 players selected
    if (selectedPlayers.size === 2) {
        setTimeout(() => {
            startGameBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    }
}




function updateSelectionTitle(shouldScroll = true) {
    const titleEl = document.getElementById('selection-title');
    const selectionTitle = document.getElementById('selection-title');
		
    console.log(`🎯 Selected Players Count: ${selectedPlayers.size}`);

    if (selectedPlayers.size === 0) {
        titleEl.textContent = "Select 2 Players";
        startGameBtn.classList.remove('visible');
		selectionTitle.style.backgroundColor = "";
    } else if (selectedPlayers.size === 1) {
        titleEl.textContent = "Select 1 More Player";
        startGameBtn.classList.remove('visible');
		selectionTitle.style.backgroundColor = "";
    } else if (selectedPlayers.size === 2) {
        titleEl.textContent = "✅ 2 Players Selected";
        startGameBtn.classList.add('visible');
		selectionTitle.style.backgroundColor = "#deefde";

        // ✅ Scroll only if allowed
        if (shouldScroll) {
            setTimeout(() => {
                startGameBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        }
    } else {
        titleEl.textContent = "Invalid Selection";
        startGameBtn.classList.remove('visible');
    }
}



///////////////////////////////////////
// ✅ Updated deletePlayer(event)
///////////////////////////////////////
function deletePlayer(event) {
    event.stopPropagation(); // Prevent click from bubbling further

    // Identify which player index was clicked
    const playerIndex = parseInt(event.target.getAttribute("data-index"));
    // Retrieve the player's id and name from your 'players' array
    const player = players[playerIndex];
    const playerId = player.id;
    const playerName = player.name;

    // Show a custom confirmation modal
    createDeleteConfirmationModal(playerName, () => {
        console.log(`🗑️ Modal confirmed deletion of player: ${playerName}`);

        // Only delete if it's not one of the first two "default" players
        if (playerIndex >= 2) {
            // 1) Remove the player from the array
            players.splice(playerIndex, 1);
            savePlayers();

            // 2) Remove the player by ID from selectedPlayers (important)
            selectedPlayers.delete(playerId);
            persistSelectedPlayers();
			
			// ✅ NEW: Auto-select default players if only two remain
            if (players.length === 2 && players[0].id === 'player1' && players[1].id === 'player2') {
                selectedPlayers.clear();
                selectedPlayers.add('player1');
                selectedPlayers.add('player2');
                console.log("✅ Only default players left. Auto-selected player1 and player2.");
                persistSelectedPlayers();
            }

            // 3) Re-render after the data is updated
            renderPlayers();

            console.log("✅ Successfully deleted player:", playerId);
            console.log("players array is now:", players);
            console.log("selectedPlayers is now:", Array.from(selectedPlayers));
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
    message.innerHTML = `Are you sure you want to delete player <span class="bold">'${playerName}'</span>?`;

    // Container for buttons
    const btnContainer = document.createElement("div");
    btnContainer.classList.add("btn-container");

    // Confirm button
    const confirmBtn = document.createElement("button");
    confirmBtn.textContent = "Delete";
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
	
	//Click to edit any player name
function makeSpanEditable(span) {
    span.addEventListener('click', function (e) {
        e.stopPropagation();
        const playerCard = span.closest('.player-selection');
        editingPlayerId = playerCard.getAttribute('data-player-id');  // ✅ Use player ID
        renderPlayers(); // ✅ Re-render with the input field visible
    });
}


function saveEditedName() {
    const input = this;
    const newName = input.value.trim() || 'Unnamed';
    const playerCard = input.closest('.player-selection');
    const playerId = playerCard.getAttribute('data-player-id'); // ✅ Pull the correct ID

    const player = players.find(p => p.id === playerId);
    if (player) {
        player.name = newName;
        console.log(`💾 Player name updated: ${player.name} ➔ ${newName}`);
    }

    // ✅ No need to touch selectedPlayers Set (it's ID-based)
    // ✅ No need to set data-player-name (ID stays same, name updates inside player object)

    savePlayers();
    persistSelectedPlayers();

    editingPlayerId = null;  // ✅ Reset editing mode
    renderPlayers();
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

