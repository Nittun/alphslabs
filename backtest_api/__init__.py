"""
Backtest API Package
Modular structure with caching for improved performance
"""

# Export the Flask app and main functions for easy importing
from .main import app, run_app, start_background_thread

__all__ = ['app', 'run_app', 'start_background_thread']
