from flask import Flask, render_template

app = Flask(__name__)


@app.route('/')
def index():
    return render_template('index.html')


if __name__ == "__main__":
    port = 5000
    print(f"Starting server on port {port}")
    app.run(debug=True, port=port)