#!/bin/bash
# Start the Python Backtest API Server

# Check if virtual environment exists
if [ -d "venv" ]; then
    echo "Activating virtual environment..."
    source venv/bin/activate
    echo "Starting Python API server..."
    python backtest_api.py
else
    echo "Virtual environment not found. Please run ./setup_python.sh first"
    echo ""
    echo "Or use python3 directly:"
    if command -v python3 &> /dev/null; then
        echo "  python3 backtest_api.py"
    elif command -v python &> /dev/null; then
        echo "  python backtest_api.py"
    else
        echo "  Error: Python not found. Please install Python 3.8 or higher."
        exit 1
    fi
fi
