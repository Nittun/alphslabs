# Backtest Web Setup Guide

This project integrates a Next.js frontend with a Python backtesting API.

## Prerequisites

- Node.js 18+ installed
- Python 3.8+ installed
- npm or yarn package manager

## Setup Instructions

### 1. Install Node.js Dependencies

```bash
npm install
```

### 2. Install Python Dependencies

**Recommended: Use a virtual environment** (avoids permission issues):

```bash
# Run the setup script (creates venv and installs dependencies)
./setup_python.sh
```

Or manually:

```bash
# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

**Alternative: Install globally** (if you have permission):

```bash
pip3 install -r requirements.txt
```

**Note**: On macOS, Python 3 is typically installed as `python3` rather than `python`. If `python` doesn't work, use `python3`.

### 3. Start the Python API Server

In one terminal window:

**If using virtual environment:**
```bash
# Activate virtual environment first
source venv/bin/activate

# Then start the server
python backtest_api.py
```

**Or use the startup script** (automatically activates venv if available):
```bash
./start_api.sh
```

**Or use npm script:**
```bash
npm run api
```

**Or directly with python3:**
```bash
python3 backtest_api.py
```

The API server will run on `http://localhost:5001` (port changed from 5000 to avoid conflict with macOS AirPlay Receiver)

### 4. Start the Next.js Development Server

In another terminal window:

```bash
npm run dev
```

The web application will run on `http://localhost:3000`

## Usage

1. Open `http://localhost:3000` in your browser
2. Use the **Backtest Configuration** panel on the right sidebar to:
   - Select a crypto/asset (BTC/USDT, ETH/USDT, or NVDA)
   - Set the number of days to look back
   - Choose the time interval (1h, 2h, 4h, 1d, 1W, 1M)
   - Set initial capital
   - Enable/disable short positions
3. Click **Run Backtest** to execute the backtest
4. View results in:
   - **Backtest Results** panel showing performance metrics
   - **Trade Log** section showing all executed trades
   - The TradingView chart will update to show the selected asset

## Features

- **Live TradingView Chart**: Displays real-time price data with indicators (RSI, MACD, MA)
- **Dynamic Asset Selection**: Switch between BTC/USDT, ETH/USDT, and NVDA
- **Configurable Backtest Parameters**: Adjust date range, interval, and capital
- **Real-time Trade Logging**: All backtest trades are displayed with entry/exit details
- **Performance Metrics**: Win rates, total return, and trade statistics

## API Endpoints

- `POST /api/backtest` - Run a backtest with configuration
- `GET /api/assets` - Get available assets

## Troubleshooting

- **"command not found: python"**: On macOS, use `python3` instead of `python`. You can also use the startup script: `./start_api.sh` or `npm run api`
- **"ModuleNotFoundError: No module named 'flask'"**: 
  - If using virtual environment: Make sure you've activated it with `source venv/bin/activate` before running the API
  - If not using venv: Run `./setup_python.sh` to create a virtual environment, or install dependencies with `pip3 install -r requirements.txt`
- **Permission errors with pip**: Use a virtual environment instead: `./setup_python.sh`
- **"Error running backtest"**: Make sure the Python API server is running on port 5001
- **"Address already in use" on port 5000**: This is common on macOS due to AirPlay Receiver. The server now uses port 5001 instead.
- **CORS errors**: The Flask API has CORS enabled, but ensure both servers are running
- **Data fetch errors**: Check your internet connection and that yfinance can access market data

