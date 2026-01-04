#!/bin/bash
# Install Python dependencies in virtual environment

echo "Installing Python dependencies..."

# Use venv's pip directly
./venv/bin/pip install flask flask-cors yfinance pandas numpy

echo ""
echo "✓ Dependencies installed!"
echo ""
echo "Now you can start the API server with:"
echo "  source venv/bin/activate"
echo "  python backtest_api.py"
echo ""
echo "Or use the startup script:"
echo "  ./start_api.sh"

