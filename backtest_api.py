#!/usr/bin/env python3
"""
Backtest API Server - Entry Point
This file now imports from the modular structure in backtest_api/
"""

# For backward compatibility and direct execution
# Import and run the Flask app from the new modular structure
import sys
import os

# Add current directory to path so we can import backtest_api package
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

# Import and run the main app
try:
    from backtest_api.main import run_app
    if __name__ == '__main__':
        run_app()
except ImportError as e:
    # Fallback: if package import fails, try direct import
    import importlib.util
    spec = importlib.util.spec_from_file_location("main", os.path.join(current_dir, "backtest_api", "main.py"))
    main_module = importlib.util.module_from_spec(spec)
    sys.modules["backtest_api.main"] = main_module
    spec.loader.exec_module(main_module)
    if __name__ == '__main__':
        main_module.run_app()
