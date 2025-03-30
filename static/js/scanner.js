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
    const windowSize = 10;          // Reduced window size for faster results
    const frequencyThreshold = 5;   // Reduced threshold to confirm a barcode
  
    function startScanner() {
      console.log("startScanner called.");
      // Hide UI elements
      startButton.style.display = 'none';
      orText.style.display = 'none';
      searchForm.style.display = 'none';
      instructionText.style.display = 'none';
      barcodeImage.style.display = 'none';
  
      // Show scanner container and Stop button
      scannerContainer.style.display = 'block';
      stopButton.style.display = 'inline-block';
  
      detectionWindow = []; // Reset the detection window
  
      // Initialize Quagga with settings
      Quagga.init({
        inputStream: {
          name: "Live",
          type: "LiveStream",
          target: scannerContainer,
          constraints: {
            width: { ideal: 640 },
            height: { ideal: 480 }
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
        }
      }, function(err) {
        if (err) {
          console.error("Quagga init error:", err);
          return;
        }
        console.log("Quagga initialized successfully.");
        Quagga.start();
      });
      
    }
  
    function stopScanner() {
      console.log("stopScanner called.");
      Quagga.stop();
      scannerContainer.style.display = 'none';
      stopButton.style.display = 'none';
  
      // Restore UI elements
      startButton.style.display = 'inline-block';
      orText.style.display = 'block';
      searchForm.style.display = 'block';
      instructionText.style.display = 'block';
      barcodeImage.style.display = 'block';
    }
  
    startButton.addEventListener('click', startScanner);
    stopButton.addEventListener('click', stopScanner);
  
    // Process detected barcodes using a sliding window.
    Quagga.onDetected(function(data) {
      const detectedCode = data.codeResult.code;
      
      // Filter out codes that are too short (assuming valid codes are at least 10 digits)
      if (detectedCode.length < 10) return;
      
      console.log("Detected barcode:", detectedCode);
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
          stopScanner();
          fetch('/process_barcode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ barcode: mode })
          })
          .then(response => response.json())
          .then(result => {
            console.log("Server response:", result);
            alert("Product: " + result.product + "\nBrand: " + result.brand + "\nESG Info: " + result.esg);
          })
          .catch(error => console.error("Error sending barcode:", error));
        } else {
          // Slide the window: remove the oldest reading
          detectionWindow.shift();
        }
      }
    });
  });
  