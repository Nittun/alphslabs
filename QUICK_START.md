# Quick Start Guide

## Step 1: Install Python Dependencies

Run this command in your terminal:

```bash
./setup_python.sh
```

Or manually:

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Step 2: Start the Python API Server

**IMPORTANT**: You must activate the virtual environment first!

```bash
# Activate the virtual environment
source venv/bin/activate

# Then start the API server
python backtest_api.py
```

**OR** use the startup script (it activates venv automatically):

```bash
./start_api.sh
```

You should see:
```
 * Running on http://127.0.0.1:5000
```

## Step 3: Start Next.js (in a NEW terminal)

Open a **new terminal window** and run:

```bash
cd /Users/nittunlertwirojkul/Downloads/backtest_web
npm run dev
```

## Troubleshooting

### "ModuleNotFoundError: No module named 'flask'"

This means you're not using the virtual environment. Make sure to:

1. **Activate the virtual environment first:**
   ```bash
   source venv/bin/activate
   ```
   
   You should see `(venv)` at the start of your terminal prompt.

2. **Then run the API server:**
   ```bash
   python backtest_api.py
   ```

3. **Or use the startup script** which does this automatically:
   ```bash
   ./start_api.sh
   ```

### How to know if venv is activated?

When the virtual environment is activated, you'll see `(venv)` at the start of your terminal prompt:

```
(venv) user@computer:~/backtest_web$
```

If you don't see `(venv)`, the virtual environment is NOT activated!

