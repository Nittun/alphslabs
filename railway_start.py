#!/usr/bin/env python3
"""
Railway startup script - handles PORT environment variable properly
"""
import os
import sys
import subprocess

# Get port from Railway
port = os.environ.get('PORT', '5001')

print(f"=" * 50, flush=True)
print(f"Starting Alphalabs API Server", flush=True)
print(f"Port: {port}", flush=True)
print(f"Python: {sys.version}", flush=True)
print(f"=" * 50, flush=True)

# Test import before starting gunicorn
try:
    print("Testing imports...", flush=True)
    import flask
    import flask_cors
    import yfinance
    import pandas
    import numpy
    print("All imports successful!", flush=True)
except ImportError as e:
    print(f"Import error: {e}", flush=True)
    sys.exit(1)

# Run gunicorn - using exec to replace this process
cmd = [
    "gunicorn",
    "backtest_api:app",
    "--bind", f"0.0.0.0:{port}",
    "--workers", "1",
    "--threads", "4", 
    "--timeout", "120",
    "--access-logfile", "-",
    "--error-logfile", "-",
    "--capture-output",
    "--enable-stdio-inheritance"
]

print(f"Running: {' '.join(cmd)}", flush=True)
os.execvp("gunicorn", cmd)

