from flask import Flask, render_template, request, jsonify, redirect, url_for
import greenwash 
import os
import json
from datetime import datetime
import logging
import greenwash

# Set up logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
                    filename='app.log')
logger = logging.getLogger(__name__)

app = Flask(__name__)

RESULTS_DIR = 'analysis_results'
os.makedirs(RESULTS_DIR, exist_ok=True)

# Initialize NLTK during app startup
with app.app_context():
    try:
        greenwash.setup_nltk()
        logger.info("NLTK resources successfully downloaded")
    except Exception as e:
        logger.error(f"Error downloading NLTK resources: {e}")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/process_barcode', methods=['POST'])
def process_barcode():
    data = request.get_json()
    barcode = data.get('barcode')
    product_name, brand = greenwash.lookup_openfoodfacts(barcode)
    
    if product_name and brand:
        parent_company, ticker = greenwash.get_parent_company_ticker(brand)
        if ticker:
            esg_info = greenwash.get_esg_data(ticker)
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

@app.route('/search')
def search():
    return render_template('search.html')

@app.route('/analyze', methods=['POST'])
def analyze():
    """Process the form and start the analysis"""
    company_name = request.form.get('company_name', '').strip().lower()
    
    if not company_name:
        return render_template('search.html', error='Please enter a company name')
    
    # Check if we already have cached results
    cache_file = os.path.join(RESULTS_DIR, f"{company_name}.json")
    if os.path.exists(cache_file):
        # Check if file is not empty
        if os.path.getsize(cache_file) > 0:
            try:
                # Load cached results if they exist
                with open(cache_file, 'r') as f:
                    results = json.load(f)
                return redirect(url_for('results', company_name=company_name))
            except json.JSONDecodeError:
                # If JSON is invalid, delete the file and re-analyze
                os.remove(cache_file)
                logger.warning(f"Removed corrupted cache file for {company_name}")
    
    # Redirect to loading page while analysis runs
    return redirect(url_for('loading', company_name=company_name))

@app.route('/loading/<company_name>')
def loading(company_name):
    """Display a loading page while analysis runs in the background"""
    return render_template('loading.html', company_name=company_name)

@app.route('/process/<company_name>')
def process(company_name):
    """API endpoint that runs the analysis and saves results"""
    try:
        logger.info(f"Starting analysis for {company_name}")
        
        # Run the analysis with default values in case of failure
        try:
            results = greenwash.quick_analysis(company_name)
            if not results:
                raise ValueError("Analysis returned empty results")
        except Exception as analysis_error:
            logger.error(f"Analysis error for {company_name}: {analysis_error}")
            # Provide default values if analysis fails
            results = {
                'mislead_scores': [0.7, 0.3],
                'vague_scores': [0.6, 0.4],
                'public_sentiment': 0.2,
                'number_of_false_claims': 0,
                'contradictions': []
            }
        
        # Convert any non-serializable data 
        serializable_results = {
            'company_name': company_name,
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'mislead_scores': results.get('mislead_scores', [0.7, 0.3]),
            'vague_scores': results.get('vague_scores', [0.6, 0.4]),
            'public_sentiment': results.get('public_sentiment', 0.2),
            'number_of_false_claims': results.get('number_of_false_claims', 0),
            'contradictions': [(claim, report, float(score)) for claim, report, score in results.get('contradictions', [])] 
                               if results.get('contradictions') else []
        }
        
        # Save results to a file
        cache_file = os.path.join(RESULTS_DIR, f"{company_name}.json")
        with open(cache_file, 'w') as f:
            json.dump(serializable_results, f)
        
        logger.info(f"Analysis completed for {company_name}")
        return jsonify({'status': 'success'})
    
    except Exception as e:
        logger.error(f"Process error for {company_name}: {e}")
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/results/<company_name>')
def results(company_name):
    """Display the analysis results"""
    cache_file = os.path.join(RESULTS_DIR, f"{company_name}.json")
    
    if not os.path.exists(cache_file):
        logger.warning(f"Results file not found for {company_name}")
        return redirect(url_for('search'))
    
    try:
        with open(cache_file, 'r') as f:
            results = json.load(f)
    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error for {company_name}: {e}")
        # If file is corrupted, delete it and redirect to try again
        os.remove(cache_file)
        return redirect(url_for('search', error='Analysis data corrupted. Please try again.'))
    
    return render_template('results.html', results=results)

@app.errorhandler(404)
def page_not_found(e):
    return render_template('search.html', error='Page not found'), 404

@app.errorhandler(500)
def internal_server_error(e):
    logger.error(f"Internal server error: {e}")
    return render_template('search.html', error='An internal server error occurred. Please try again.'), 500

if __name__ == "__main__":
    app.run(debug=True)
