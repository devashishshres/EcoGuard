from flask import Flask, render_template, request, jsonify
import project 

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/process_barcode', methods=['POST'])
def process_barcode():
    data = request.get_json()
    barcode = data.get('barcode')
    product_name, brand = project.lookup_openfoodfacts(barcode)
    
    if product_name and brand:
        parent_company, ticker = project.get_parent_company_ticker(brand)
        if ticker:
            esg_info = project.get_esg_data(ticker)
        else:
            esg_info = "Could not determine parent company ticker."
    else:
        product_name = "Product not found"
        brand = ""
        esg_info = ""
    
    return jsonify({
        'product': product_name,
        'brand': brand,
        'esg': esg_info
    })

if __name__ == "__main__":
    app.run(debug=True)
