document.addEventListener('DOMContentLoaded', function() {
    const startButton = document.getElementById('start-scan');
    const stopButton = document.getElementById('stop-scan');
    const scannerContainer = document.getElementById('scanner-container');
  
    // Elements to hide when scanning starts
    const orText = document.getElementById('or-text');
    const searchForm = document.getElementById('search-form');
    const instructionText = document.getElementById('instruction-text');
    const barcodeImage = document.getElementById('barcode-image');
  
    function startScanner() {
      // Hide the Scan button and other elements
      startButton.style.display = 'none';
      orText.style.display = 'none';
      searchForm.style.display = 'none';
      instructionText.style.display = 'none';
      barcodeImage.style.display = 'none';
  
      // Show the scanner container and Stop button
      scannerContainer.style.display = 'block';
      stopButton.style.display = 'inline-block';
  
      // Initialize Quagga with ideal constraints
      Quagga.init({
        inputStream: {
          name: "Live",
          type: "LiveStream",
          target: scannerContainer,
          constraints: {
            facingMode: { ideal: "environment" }
          }
        },
        decoder: {
          readers: ["code_128_reader", "ean_reader", "ean_8_reader"]
        }
      }, function(err) {
        if (err) {
          console.error("Quagga init error:", err);
          return;
        }
        Quagga.start();
      });
    }
  
    function stopScanner() {
      Quagga.stop();
      scannerContainer.style.display = 'none';
      stopButton.style.display = 'none';
  
      // Restore the hidden elements
      startButton.style.display = 'inline-block';
      orText.style.display = 'block';
      searchForm.style.display = 'block';
      instructionText.style.display = 'block';
      barcodeImage.style.display = 'block';
    }
  
    startButton.addEventListener('click', startScanner);
    stopButton.addEventListener('click', stopScanner);
  
    Quagga.onDetected(function(data) {
      const barcode = data.codeResult.code;
      console.log("Detected barcode:", barcode);
      stopScanner();
      // Send the detected barcode to your Flask backend
      fetch('/process_barcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode: barcode })
      })
      .then(response => response.json())
      .then(result => {
        console.log("Server response:", result);
        alert("Product: " + result.product + "\nBrand: " + result.brand + "\nESG Info: " + result.esg);
      })
      .catch(error => console.error("Error sending barcode:", error));
    });
  });
  