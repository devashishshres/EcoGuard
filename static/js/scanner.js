document.addEventListener('DOMContentLoaded', function() {
  console.log("DOM fully loaded and scanner.js running.");
  
  const startButton = document.getElementById('start-scan');
  const stopButton = document.getElementById('stop-scan');
  const scannerContainer = document.getElementById('scanner-container');

  // UI elements to hide during scanning
  const orText = document.getElementById('or-text');
  const searchForm = document.getElementById('search-form');
  const instructionText = document.getElementById('instruction-text');
  const barcodeImage = document.getElementById('barcode-image');

  // Variables for sliding window detection
  let detectionWindow = [];
  const windowSize = 10; // Reduced window size for faster results
  const frequencyThreshold = 5; // Reduced threshold to confirm a barcode

  // For time-based confirmation
  let stableStartTime = null;
  let lastStableCode = null;
  const stableTimeThreshold = 3000; // 3 seconds in milliseconds
  
  // Track if we've already processed a barcode in this session
  let barcodeProcessed = false;

  function startScanner() {
    console.log("startScanner called.");
    
    // Check if browser supports getUserMedia
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Your browser doesn't support camera access. Please try a different browser.");
      return;
    }
    
    // Hide UI elements
    startButton.style.display = 'none';
    orText.style.display = 'none';
    
    // Make sure we properly find the search form
    if (searchForm) {
      searchForm.style.display = 'none';
    } else {
      // Try to find it by form element directly
      const formElement = document.querySelector('form[action="/search"]');
      if (formElement) formElement.style.display = 'none';
    }
    
    instructionText.style.display = 'none';
    barcodeImage.style.display = 'none';

    // Show scanner container and Stop button
    scannerContainer.style.display = 'block';
    stopButton.style.display = 'inline-block';

    // Reset variables
    detectionWindow = [];
    stableStartTime = null;
    lastStableCode = null;
    barcodeProcessed = false;

    // Make sure Quagga is available
    if (typeof Quagga === 'undefined') {
      console.error("Quagga is not loaded. Make sure the script is included correctly.");
      alert("Barcode scanner library not loaded. Please refresh the page and try again.");
      stopScanner();
      return;
    }

    // Initialize Quagga with settings
    Quagga.init({
      inputStream: {
        name: "Live",
        type: "LiveStream",
        target: scannerContainer,
        constraints: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "environment" // Use rear camera by default
        }
      },
      locate: true,
      decoder: {
        readers: [
          "ean_reader",
          "ean_8_reader",
          "code_128_reader",
          "code_39_reader",
          "upc_reader",
          "upc_e_reader"
        ]
      },
      locator: {
        patchSize: "medium", // x-small, small, medium, large, x-large
        halfSample: true
      },
      debug: {
        drawBoundingBox: false, // We'll handle drawing ourselves
        showFrequency: false,
        drawScanline: true,
        showPattern: false
      }
    }, function(err) {
      if (err) {
        console.error("Quagga init error:", err);
        alert("Camera access error: " + err.message);
        stopScanner(); // Restore UI if camera fails
        return;
      }
      console.log("Quagga initialized successfully.");
      
      try {
        Quagga.start();
        // Create an overlay canvas for drawing detection boxes and text
        setTimeout(createOverlay, 500); // Give a bit of time for video to initialize
      } catch (startErr) {
        console.error("Error starting Quagga:", startErr);
        alert("Error starting camera: " + startErr.message);
        stopScanner();
      }
    });
  }

  // Create an overlay canvas for drawing detection information
  function createOverlay() {
    // Remove any existing overlay
    const existingOverlay = document.getElementById('scanner-overlay');
    if (existingOverlay) {
      existingOverlay.remove();
    }

    // Create a new overlay canvas
    const overlay = document.createElement('canvas');
    overlay.id = 'scanner-overlay';
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.pointerEvents = 'none'; // Allow clicks to pass through

    // Append to the scanner container
    scannerContainer.style.position = 'relative'; // Ensure relative positioning for overlay absolute positioning
    scannerContainer.appendChild(overlay);

    // Resize the canvas to match the video dimensions
    setTimeout(() => {
      const video = scannerContainer.querySelector('video');
      if (video) {
        overlay.width = video.videoWidth || video.clientWidth;
        overlay.height = video.videoHeight || video.clientHeight;
        console.log("Overlay canvas created with dimensions:", overlay.width, overlay.height);
      } else {
        console.warn("Video element not found for overlay sizing");
        overlay.width = scannerContainer.clientWidth;
        overlay.height = scannerContainer.clientHeight;
      }
    }, 1000); // Give time for the video to initialize
  }

  function drawDetectionInfo(result) {
    const overlay = document.getElementById('scanner-overlay');
    if (!overlay) return;

    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (!result || !result.box) return;

    const code = result.codeResult.code;

    // Draw a more prominent bounding box
    ctx.lineWidth = 8; // Thick line for visibility
    ctx.strokeStyle = 'rgba(0, 255, 0, 1)'; // Bright green, fully opaque
    
    // Add a semi-transparent fill for the rectangle
    ctx.fillStyle = 'rgba(0, 255, 0, 0.2)'; // Light green fill
    ctx.fillRect(result.box.x, result.box.y, result.box.width, result.box.height);
    
    // Draw the box outline
    ctx.beginPath();
    ctx.moveTo(result.box.x, result.box.y);
    ctx.lineTo(result.box.x + result.box.width, result.box.y);
    ctx.lineTo(result.box.x + result.box.width, result.box.y + result.box.height);
    ctx.lineTo(result.box.x, result.box.y + result.box.height);
    ctx.lineTo(result.box.x, result.box.y);
    ctx.stroke();
    
    // Add corner markers for better visibility
    const cornerSize = 20; // Increased size for better visibility
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(255, 255, 0, 1)'; // Yellow corners
    
    // Top-left corner
    ctx.beginPath();
    ctx.moveTo(result.box.x, result.box.y + cornerSize);
    ctx.lineTo(result.box.x, result.box.y);
    ctx.lineTo(result.box.x + cornerSize, result.box.y);
    ctx.stroke();
    
    // Top-right corner
    ctx.beginPath();
    ctx.moveTo(result.box.x + result.box.width - cornerSize, result.box.y);
    ctx.lineTo(result.box.x + result.box.width, result.box.y);
    ctx.lineTo(result.box.x + result.box.width, result.box.y + cornerSize);
    ctx.stroke();
    
    // Bottom-right corner
    ctx.beginPath();
    ctx.moveTo(result.box.x + result.box.width, result.box.y + result.box.height - cornerSize);
    ctx.lineTo(result.box.x + result.box.width, result.box.y + result.box.height);
    ctx.lineTo(result.box.x + result.box.width - cornerSize, result.box.y + result.box.height);
    ctx.stroke();
    
    // Bottom-left corner
    ctx.beginPath();
    ctx.moveTo(result.box.x + cornerSize, result.box.y + result.box.height);
    ctx.lineTo(result.box.x, result.box.y + result.box.height);
    ctx.lineTo(result.box.x, result.box.y + result.box.height - cornerSize);
    ctx.stroke();

    // Draw the barcode text above the box
    ctx.font = 'bold 20px Arial'; // Slightly bigger font
    
    // Add a background for better readability
    const textWidth = ctx.measureText(code).width;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(result.box.x - 5, result.box.y - 35, textWidth + 16, 30);
    
    ctx.fillStyle = 'rgba(0, 255, 0, 1)';
    ctx.fillText(code, result.box.x + 3, result.box.y - 12);

    // Add a scanning indicator animation
    const scanLineY = result.box.y + (Date.now() % 1000) / 1000 * result.box.height;
    ctx.beginPath();
    ctx.moveTo(result.box.x, scanLineY);
    ctx.lineTo(result.box.x + result.box.width, scanLineY);
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Time-based confirmation display
    if (stableStartTime !== null && !barcodeProcessed) {
      const elapsedTime = Date.now() - stableStartTime;
      const remainingTime = stableTimeThreshold - elapsedTime;
      
      if (remainingTime > 0) {
        // Show progress bar
        const progressWidth = 200;
        const progress = Math.min(1, elapsedTime / stableTimeThreshold);
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(overlay.width/2 - progressWidth/2 - 5, overlay.height - 70, progressWidth + 10, 30);
        
        ctx.fillStyle = 'rgba(255, 165, 0, 1)';
        ctx.fillRect(overlay.width/2 - progressWidth/2, overlay.height - 65, progressWidth * progress, 20);
        
        ctx.fillStyle = 'white';
        ctx.font = 'bold 16px Arial';
        ctx.fillText(`Confirming: ${Math.ceil(remainingTime/100)/10}s`, overlay.width/2 - 70, overlay.height - 80);
      }
    }

    // Display info at the top of the screen
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, overlay.width, 40);
    
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = 'white';
    ctx.fillText(`Scanning: ${code}`, 10, 25);
  }

  function stopScanner() {
    console.log("stopScanner called.");
    
    try {
      if (typeof Quagga !== 'undefined') {
        Quagga.stop();
      }
    } catch (err) {
      console.error("Error stopping Quagga:", err);
    }
    
    scannerContainer.style.display = 'none';
    stopButton.style.display = 'none';

    // Remove overlay
    const overlay = document.getElementById('scanner-overlay');
    if (overlay) {
      overlay.remove();
    }

    // Restore UI elements
    startButton.style.display = 'inline-block';
    orText.style.display = 'block';
    
    // Handle search form display
    if (searchForm) {
      searchForm.style.display = 'block';
    } else {
      // Try to find it by form element directly
      const formElement = document.querySelector('form[action="/search"]');
      if (formElement) formElement.style.display = 'block';
    }
    
    instructionText.style.display = 'block';
    barcodeImage.style.display = 'block';
  }

  function processConfirmedBarcode(barcode) {
    // Check if we've already processed a barcode in this session
    if (barcodeProcessed) {
      return;
    }
    
    // Mark as processed to prevent multiple notifications
    barcodeProcessed = true;
    
    // Draw final confirmation
    const overlay = document.getElementById('scanner-overlay');
    if (overlay) {
      const ctx = overlay.getContext('2d');
      
      // Clear the overlay
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      
      // Draw confirmation message
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(overlay.width/2 - 200, overlay.height/2 - 50, 400, 100);
      
      ctx.fillStyle = 'rgba(0, 255, 0, 1)';
      ctx.font = 'bold 24px Arial';
      ctx.fillText(`CONFIRMED: ${barcode}`, overlay.width/2 - 150, overlay.height/2);
      ctx.font = '18px Arial';
      ctx.fillText('Processing...', overlay.width/2 - 50, overlay.height/2 + 30);
    }
    
    // Wait a moment to show the confirmation
    setTimeout(() => {
      stopScanner();
      
      // Send the barcode to the server
      fetch('/process_barcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode: barcode })
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        return response.json();
      })
      .then(result => { 
        console.log("Server response:", result);  
      
        alert("Product: " + (result.product || "Unknown") + 
              "\nBrand: " + (result.brand || "Unknown") + 
              "\nESG Info: " + (result.esg || "Not available"));
      })
      .catch(error => {
        console.error("Error processing barcode:", error);
        alert("Error processing barcode: " + error.message);
      }); 
    }, 1200); 
  }

  // Setup button event listeners with error handling
  if (startButton) {
    startButton.addEventListener('click', function(e) {
      e.preventDefault(); // Prevent any form submission
      startScanner();
    });
  } else {
    console.error("Start scan button not found in the DOM!");
  }
  
  if (stopButton) {
    stopButton.addEventListener('click', function(e) {
      e.preventDefault(); // Prevent any form submission
      stopScanner();
    });
  } else {
    console.error("Stop scan button not found in the DOM!");
  }

  // Register Quagga event handlers if Quagga is available
  if (typeof Quagga !== 'undefined') {
    // Process raw detected data from Quagga (for drawing)
    Quagga.onProcessed(function(result) {
      if (barcodeProcessed) return; // Skip processing if we already found a barcode
      
      // Get the overlay canvas
      const overlay = document.getElementById('scanner-overlay');
      if (!overlay) return;
      
      const ctx = overlay.getContext('2d');
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      
      if (result && result.codeResult && result.codeResult.code && result.codeResult.code.length >= 10) {
        // Valid code detected - draw the green detection box with yellow corners
        drawDetectionInfo(result);
      } else if (result && result.box) {
        // No valid code yet, but potential barcode area detected - draw scanning rectangle
        
        // Draw a distinctive scanning rectangle
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(255, 165, 0, 0.8)'; // Orange, more visible
        ctx.setLineDash([10, 10]); // Dashed line for "in progress" appearance
        ctx.strokeRect(result.box.x, result.box.y, result.box.width, result.box.height);
        ctx.setLineDash([]); // Reset to solid line
        
        // Add "Scanning" label
        ctx.font = 'bold 16px Arial';
        ctx.fillStyle = 'rgba(255, 165, 0, 0.9)';
        
        // Text background for better visibility
        const scanningText = 'Scanning...';
        const textWidth = ctx.measureText(scanningText).width;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(result.box.x, result.box.y - 25, textWidth + 16, 25);
        
        // Text
        ctx.fillStyle = 'rgba(255, 165, 0, 0.9)';
        ctx.fillText(scanningText, result.box.x + 8, result.box.y - 8);
      }
      
      // Display status info at the top of the screen
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, overlay.width, 40);
      
      ctx.font = 'bold 16px Arial';
      ctx.fillStyle = 'white';
      ctx.fillText(`Looking for barcode...`, 10, 25);
    });

    // Process detected barcodes
    Quagga.onDetected(function(data) {
      // Skip if we already processed a barcode
      if (barcodeProcessed) return;
      
      const detectedCode = data.codeResult.code;
      
      // Filter out codes that are too short
      if (detectedCode.length < 10) return;
      
      console.log("Detected barcode:", detectedCode);
      
      // Draw detection info
      drawDetectionInfo(data);
      
      // Time-based stability detection
      const currentTime = Date.now();
      
      if (lastStableCode === detectedCode) {
        // Same code detected, check if we've been stable for set time
        if (stableStartTime !== null && (currentTime - stableStartTime) >= stableTimeThreshold) {
          console.log("Barcode stable for required time:", detectedCode);
          processConfirmedBarcode(detectedCode);
          return;
        }
      } else {
        // New code detected, reset the stable start time
        lastStableCode = detectedCode;
        stableStartTime = currentTime;
      }
      
      // Add to detection window for frequency-based confirmation (as a backup method)
      detectionWindow.push(detectedCode);
      
      if (detectionWindow.length >= windowSize) {
        // Count frequency of each code in the window
        let frequency = detectionWindow.reduce((acc, code) => {
          acc[code] = (acc[code] || 0) + 1;
          return acc;
        }, {});
        
        let mode = null, maxCount = 0;
        for (let code in frequency) {
          if (frequency[code] > maxCount) {
            maxCount = frequency[code];
            mode = code;
          }
        }
        
        console.log("Mode in window:", mode, "with count:", maxCount);
        
        if (maxCount >= frequencyThreshold) {
          processConfirmedBarcode(mode);
        } else {
          // Slide the window: remove the oldest reading
          detectionWindow.shift();
        }
      }
    });
  } else {
    console.error("Quagga is not defined! Make sure the script is loaded correctly.");
  }
});