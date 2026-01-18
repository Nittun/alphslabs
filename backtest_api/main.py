#!/usr/bin/env python3
"""
Backtest API Server - Main Entry Point
Refactored with modular components and caching
"""
from flask import Flask
from flask_cors import CORS
import os
import threading
import time
import logging
import warnings
from datetime import datetime

# Import routes and background tasks
#
# NOTE:
# This file is designed to work in two modes:
# - Package mode:    python -m backtest_api.main   (recommended)
# - Standalone mode: python main.py               (common locally)
#
# Relative imports (from .x import y) only work in package mode, so we
# fall back to absolute imports when __package__ is empty.
if __package__:
    from .routes import register_routes
    from .components.config import AVAILABLE_ASSETS
    from .components.stores import open_positions_store, position_lock
    from .components.data_fetcher import fetch_historical_data
    from .components.indicators import calculate_ema
    from .components.strategy import check_exit_condition
else:
    from routes import register_routes
    from components.config import AVAILABLE_ASSETS
    from components.stores import open_positions_store, position_lock
    from components.data_fetcher import fetch_historical_data
    from components.indicators import calculate_ema
    from components.strategy import check_exit_condition

warnings.filterwarnings('ignore')

app = Flask(__name__)

# Configure CORS to allow all origins for all API endpoints
CORS(app, 
     resources={r"/api/*": {
         "origins": "*",
         "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
         "allow_headers": ["Content-Type", "Authorization"]
     }},
     supports_credentials=False)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Register all routes
register_routes(app)

# Background task to update open positions
def update_open_positions():
    """Background task to update open positions every minute"""
    while True:
        try:
            time.sleep(60)  # Wait 1 minute
            with position_lock:
                positions = list(open_positions_store.values())
                for position in positions:
                    asset = position.get('asset')
                    interval = position.get('interval', '1d')
                    
                    if asset and asset in AVAILABLE_ASSETS:
                        asset_info = AVAILABLE_ASSETS[asset]
                        df = fetch_historical_data(
                            asset_info['symbol'],
                            asset_info['yf_symbol'],
                            interval,
                            60  # Get 60 days for EMA calculation
                        )
                        
                        if not df.empty and len(df) >= 2:
                            # Calculate EMAs
                            df['EMA12'] = calculate_ema(df, 12)
                            df['EMA26'] = calculate_ema(df, 26)
                            
                            current_row = df.iloc[-1]
                            prev_row = df.iloc[-2]
                            
                            current_price = float(current_row['Close'])
                            current_high = float(current_row['High'])
                            current_low = float(current_row['Low'])
                            
                            # Update position
                            position['current_price'] = current_price
                            position['last_update'] = datetime.now().isoformat()
                            
                            # Check exit conditions (including EMA crossover)
                            should_exit, exit_reason, exit_price, stop_loss_hit = check_exit_condition(
                                position, current_price, current_high, current_low, current_row, prev_row
                            )
                            
                            if should_exit:
                                logger.info(f"Position {position.get('position_id')} exited: {exit_reason}")
        except Exception as e:
            logger.error(f"Error updating positions: {e}", exc_info=True)
            time.sleep(60)

# Start background thread for position updates (works with both Flask dev server and gunicorn)
def start_background_thread():
    update_thread = threading.Thread(target=update_open_positions, daemon=True)
    update_thread.start()
    logger.info('Started background position update thread (updates every 60 seconds)')

# Start background thread when module loads (for gunicorn)
start_background_thread()

def run_app():
    """Run the Flask app - can be called externally"""
    # Get port from environment (Railway sets this)
    port = int(os.environ.get('PORT', 5001))
    is_production = os.environ.get('RAILWAY_ENVIRONMENT') or os.environ.get('RENDER')
    
    logger.info(f'Starting Flask API server on port {port}...')
    logger.info('API endpoints:')
    logger.info('  GET  /api/health - Health check')
    logger.info('  GET  /api/assets - Get available assets')
    logger.info('  POST /api/backtest - Run backtest')
    logger.info('  GET  /api/latest-backtest - Get latest backtest results')
    logger.info('  GET  /api/export-backtest-csv - Export backtest to CSV')
    logger.info('  POST /api/analyze-current - Analyze current market')
    logger.info('  GET  /api/position/<id> - Get position status')
    logger.info('  GET  /api/positions - Get all open positions')
    logger.info('  POST /api/position/<id>/close - Close position')
    logger.info('  POST /api/chart-data - Get chart data')
    logger.info('  POST /api/optimize - Run optimization')
    logger.info('  POST /api/optimize-single - Run single optimization')
    logger.info('  POST /api/optimize-equity - Run equity optimization')
    logger.info('  POST /api/price-ema-data - Get price & indicator data')
    
    # Use debug=False in production
    debug_mode = not is_production
    logger.info(f'Debug mode: {debug_mode}, Production: {is_production}')
    
    app.run(host='0.0.0.0', port=port, debug=debug_mode, threaded=True)

if __name__ == '__main__':
    run_app()

