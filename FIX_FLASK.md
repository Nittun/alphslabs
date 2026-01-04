# Fix: Install Flask in Virtual Environment

Since you're already in the virtual environment (you see `(venv)` in your prompt), run:

```bash
pip install flask flask-cors yfinance pandas numpy
```

Or install from requirements.txt:

```bash
pip install -r requirements.txt
```

Then try starting the API server again:

```bash
./start_api.sh
```

