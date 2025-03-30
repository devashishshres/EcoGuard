import cv2
import yfinance as yf
from pyzbar.pyzbar import decode
import numpy as np
import requests
import json
import time
from collections import Counter


def scan_barcode():
    # Open the default camera (index 0)
    cap = cv2.VideoCapture(0)
    
    if not cap.isOpened():
        print("ERROR: Could not open webcam. Try a different camera index.")
        return None

    scan_timeout = 20  # Maximum scanning duration in seconds
    threshold_count = 7  # Minimum number of detections to confirm a barcode
    start_time = time.time()
    
    # Dictionary to count occurrences of each barcode
    barcode_counts = {}

    confirmed_barcode = None

    while True:
        ret, frame = cap.read()
        if not ret:
            print("Failed to grab frame - stream may have ended")
            break
        
        display_frame = frame.copy()
        decoded_objects = decode(frame)
        current_barcode = None

        # Process detected barcodes
        for obj in decoded_objects:
            current_barcode = obj.data.decode('utf-8')
            barcode_type = obj.type

            # Draw rectangle around the barcode and display the data
            x, y, w, h = obj.rect
            cv2.rectangle(display_frame, (x, y), (x + w, y + h), (0, 255, 0), 2)
            cv2.putText(display_frame, f"{current_barcode}", (x, y - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
            print(f"DETECTED: {current_barcode} ({barcode_type})")
            break  # Only process the first barcode detected

        # If a barcode is detected, update the counts
        if current_barcode:
            barcode_counts[current_barcode] = barcode_counts.get(current_barcode, 0) + 1
            cv2.putText(display_frame, 
                        f"Count for {current_barcode}: {barcode_counts[current_barcode]}",
                        (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 165, 255), 2)
            
            # If the current barcode reaches the threshold count, confirm it
            if barcode_counts[current_barcode] >= threshold_count:
                confirmed_barcode = current_barcode
                cv2.putText(display_frame, "CONFIRMED", (10, 60),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
                cv2.imshow('Barcode Scanner', display_frame)
                cv2.waitKey(2000)  # Display the confirmed frame for 2 seconds
                break
        else:
            cv2.putText(display_frame, "Scanning...", (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 0, 0), 2)
        
        cv2.imshow('Barcode Scanner', display_frame)
        
        # Exit if user presses 'q'
        if cv2.waitKey(1) & 0xFF == ord('q'):
            print("User terminated scanning")
            break

        # Stop scanning if the time limit is reached
        if time.time() - start_time > scan_timeout:
            print("Scan timeout reached")
            break
    
    cap.release()
    cv2.destroyAllWindows()

    # If no barcode met the threshold, choose the one that appeared most frequently
    if not confirmed_barcode and barcode_counts:
        confirmed_barcode = max(barcode_counts, key=barcode_counts.get)
        print(f"CONFIRMED BARCODE (by frequency): {confirmed_barcode} "
              f"with count {barcode_counts[confirmed_barcode]}")

    print("Barcode scanning complete")
    return confirmed_barcode  # Return the confirmed barcode

def lookup_openfoodfacts(barcode_data):
    if barcode_data is None:
        print("No barcode data provided")
        return None, None
    
    url = f"https://world.openfoodfacts.org/api/v0/product/{barcode_data}"
    response = requests.get(url)
    
    if response.status_code == 200:
        data = response.json()
        if data['status'] == 1:
            product = data['product']
            brand = product.get('brands', 'Unknown')
            name = product.get('product_name', 'Unknown')
            return name, brand
    
    return None, None

with open("parent_companies.json", "r") as f:
    parent_companies = json.load(f)

def get_parent_company_ticker(brand_name):
    brand_lower = brand_name.lower()
    if brand_lower in parent_companies:
        return brand_lower, parent_companies[brand_lower]
    for known_brand, ticker in parent_companies.items():
        if known_brand in brand_lower or brand_lower in known_brand:
            return known_brand, ticker
    return brand_name, None

def get_esg_data(company_ticker):
    try:
        stock = yf.Ticker(company_ticker)
        esg_data = stock.sustainability
        
        if esg_data is not None and 'totalEsg' in esg_data.index:
            total_esg_score = esg_data.loc['totalEsg'].iloc[0]
            return f"Total ESG Score for {company_ticker}: {total_esg_score}"
        else:
            return f"No ESG data available for {company_ticker}."
    except Exception as e:
        return f"Error fetching ESG data for {company_ticker}: {e}"

if __name__ == "__main__":
    detected_barcode = scan_barcode()
    
    if detected_barcode:
        product_name, brand = lookup_openfoodfacts(detected_barcode)
        
        if product_name and brand:
            print(f"Found product: {product_name} by {brand}")
            parent_company, ticker = get_parent_company_ticker(brand)
            
            if ticker:
                print(f"Parent company: {parent_company} (Ticker: {ticker})")
                esg_result = get_esg_data(ticker)
                print(esg_result)
            else:
                print(f"Could not determine parent company ticker for {brand}")
        else:
            print("Product not found in OpenFoodFacts database")
    else:
        print("No barcode detected or scanning was cancelled")