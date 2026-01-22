"""
Flask API routes - all API endpoints
"""
from flask import request, jsonify, Response, make_response
from datetime import datetime
import yfinance as yf
import pandas as pd
import numpy as np
import io
import csv
import logging

# Import from our modules
#
# NOTE:
# This module supports both:
# - Package mode imports (from .components...)
# - Standalone mode imports (from components...)
#
if __package__:
    from .components.config import AVAILABLE_ASSETS
    from .components.stores import (
        open_positions_store,
        position_lock,
        latest_backtest_store,
        backtest_lock,
    )
    from .components.data_fetcher import fetch_historical_data
    from .components.indicators import (
        calculate_ema,
        calculate_ma,
        calculate_dema,
        calculate_rsi,
        calculate_cci,
        calculate_zscore,
        calculate_roll_std,
        calculate_roll_median,
        calculate_roll_percentile,
    )
    from .components.backtest_engine import (
        run_backtest,
        analyze_current_market,
        run_optimization_backtest,
        run_combined_equity_backtest,
        run_indicator_optimization_backtest,
        run_combined_equity_backtest_indicator,
    )
else:
    from components.config import AVAILABLE_ASSETS
    from components.stores import (
        open_positions_store,
        position_lock,
        latest_backtest_store,
        backtest_lock,
    )
    from components.data_fetcher import fetch_historical_data
    from components.indicators import (
        calculate_ema,
        calculate_ma,
        calculate_dema,
        calculate_rsi,
        calculate_cci,
        calculate_zscore,
        calculate_roll_std,
        calculate_roll_median,
        calculate_roll_percentile,
    )
    from components.backtest_engine import (
        run_backtest,
        analyze_current_market,
        run_optimization_backtest,
        run_combined_equity_backtest,
        run_indicator_optimization_backtest,
        run_combined_equity_backtest_indicator,
    )

logger = logging.getLogger(__name__)

def convert_numpy_types(obj):
    """Recursively convert numpy types to Python native types for JSON serialization"""
    if isinstance(obj, dict):
        return {k: convert_numpy_types(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_numpy_types(item) for item in obj]
    elif isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.bool_):
        return bool(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif pd.isna(obj):
        return None
    else:
        return obj

def register_routes(app):
    """Register all API routes with the Flask app"""
    
    @app.route('/api/health', methods=['GET'])
    def health_check():
        return jsonify({'status': 'ok', 'message': 'Backtest API is running'})

    @app.route('/api/assets', methods=['GET'])
    def get_assets():
        return jsonify({
            'assets': list(AVAILABLE_ASSETS.keys()),
            'asset_info': AVAILABLE_ASSETS
        })

    @app.route('/api/crypto-prices', methods=['GET'])
    def get_crypto_prices():
        """Fetch real-time prices for cryptocurrencies, stocks, and commodities"""
        try:
            # All assets to fetch prices for (matching CryptoTicker component)
            ticker_symbols = {
                # Cryptocurrencies
                'BTC': 'BTC-USD',
                'ETH': 'ETH-USD',
                'SOL': 'SOL-USD',
                'BNB': 'BNB-USD',
                'XRP': 'XRP-USD',
                # Top 5 US Stocks
                'AAPL': 'AAPL',
                'MSFT': 'MSFT',
                'GOOGL': 'GOOGL',
                'AMZN': 'AMZN',
                'NVDA': 'NVDA',
                # Commodities
                'GOLD': 'GC=F',
                'SILVER': 'SI=F',
            }
            
            prices = {}
            for symbol, yf_symbol in ticker_symbols.items():
                try:
                    ticker = yf.Ticker(yf_symbol)
                    info = ticker.fast_info
                    current_price = info.last_price if hasattr(info, 'last_price') else 0
                    prev_close = info.previous_close if hasattr(info, 'previous_close') else current_price
                    
                    if current_price and prev_close:
                        change_pct = ((current_price - prev_close) / prev_close) * 100
                    else:
                        change_pct = 0
                    
                    prices[symbol] = {
                        'price': float(current_price) if current_price else 0,
                        'change': float(change_pct)
                    }
                except Exception as e:
                    logger.warning(f"Failed to fetch price for {symbol}: {e}")
                    prices[symbol] = {'price': 0, 'change': 0}
            
            return jsonify({'success': True, 'prices': prices})
        except Exception as e:
            logger.error(f"Error fetching crypto prices: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500

    @app.route('/api/current-price', methods=['GET'])
    def get_current_price():
        """Get current price for a specific asset"""
        try:
            asset = request.args.get('asset', 'BTC/USDT')
            
            if asset not in AVAILABLE_ASSETS:
                return jsonify({'success': False, 'error': f'Asset {asset} not available'}), 400
            
            asset_info = AVAILABLE_ASSETS[asset]
            yf_symbol = asset_info['symbol']
            
            ticker = yf.Ticker(yf_symbol)
            info = ticker.fast_info
            
            current_price = info.last_price if hasattr(info, 'last_price') else 0
            prev_close = info.previous_close if hasattr(info, 'previous_close') else current_price
            
            if current_price and prev_close:
                change_pct = ((current_price - prev_close) / prev_close) * 100
            else:
                change_pct = 0
            
            return jsonify({
                'success': True,
                'asset': asset,
                'price': float(current_price) if current_price else 0,
                'previous_close': float(prev_close) if prev_close else 0,
                'change_pct': float(change_pct),
                'timestamp': datetime.now().isoformat()
            })
        except Exception as e:
            logger.error(f"Error fetching current price for {asset}: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500

    @app.route('/api/search-assets', methods=['GET'])
    def search_assets():
        """Search for available assets"""
        query = request.args.get('q', '').upper()
        
        all_assets = []
        for symbol, info in AVAILABLE_ASSETS.items():
            asset_type = info.get('type', 'crypto')
            exchange = 'BINANCE' if asset_type == 'crypto' else 'NASDAQ'
            all_assets.append({
                'symbol': symbol,
                'name': info.get('name', symbol),
                'type': asset_type,
                'exchange': exchange
            })
        
        if len(query) < 1:
            return jsonify({'success': True, 'results': all_assets})
        
        results = [
            asset for asset in all_assets
            if query in asset['symbol'].upper() or query in asset['name'].upper()
        ][:15]
        
        return jsonify({'success': True, 'results': results})

    @app.route('/api/backtest', methods=['POST', 'OPTIONS'])
    def run_backtest_api():
        """Run backtest based on FE input"""
        if request.method == 'OPTIONS':
            return jsonify({'status': 'ok'}), 200
        
        try:
            data = request.json
            asset = data.get('asset', 'BTC/USDT')
            start_date = data.get('start_date')
            end_date = data.get('end_date')
            days_back = data.get('days_back')
            interval = data.get('interval', '4h')
            initial_capital = float(data.get('initial_capital', 10000))
            enable_short = data.get('enable_short', True)
            strategy_mode = data.get('strategy_mode', 'reversal')
            ema_fast = int(data.get('ema_fast', 12))
            ema_slow = int(data.get('ema_slow', 26))
            indicator_type = data.get('indicator_type', 'ema')
            indicator_params = data.get('indicator_params', None)
            entry_delay = int(data.get('entry_delay', 1))  # Bars after signal to enter
            exit_delay = int(data.get('exit_delay', 1))    # Bars after signal to exit
            
            # Parse use_stop_loss - ensure it's a boolean
            use_stop_loss_raw = data.get('use_stop_loss', True)
            if isinstance(use_stop_loss_raw, bool):
                use_stop_loss = use_stop_loss_raw
            elif isinstance(use_stop_loss_raw, str):
                use_stop_loss = use_stop_loss_raw.lower() not in ('false', '0', 'no', 'none', '')
            else:
                use_stop_loss = bool(use_stop_loss_raw)
            
            dsl = data.get('dsl', None)  # DSL config for saved strategies
            
            # Log DSL and stop loss for debugging
            logger.info(f'Stop loss mode: use_stop_loss={use_stop_loss} (raw value: {use_stop_loss_raw})')
            if dsl:
                logger.info(f'DSL received: indicators={list(dsl.get("indicators", {}).keys())}, entry={dsl.get("entry") is not None}, exit={dsl.get("exit") is not None}')
            else:
                logger.info('No DSL provided in request')
            
            # Validate delays (0-5)
            entry_delay = max(0, min(5, entry_delay))
            exit_delay = max(0, min(5, exit_delay))
            
            if days_back is not None:
                days_back = int(days_back)
            
            if ema_fast < 2 or ema_fast > 500:
                ema_fast = 12
            if ema_slow < 2 or ema_slow > 500:
                ema_slow = 26
            
            if ema_fast >= ema_slow:
                ema_fast, ema_slow = min(ema_fast, ema_slow), max(ema_fast, ema_slow)
                if ema_fast == ema_slow:
                    ema_slow = ema_fast + 14
            
            logger.info(f'Received EMA settings from frontend: Fast={ema_fast}, Slow={ema_slow}')
            
            valid_modes = ['reversal', 'wait_for_next', 'long_only', 'short_only']
            if strategy_mode not in valid_modes:
                strategy_mode = 'reversal'
            
            if asset not in AVAILABLE_ASSETS:
                return jsonify({'error': f'Asset {asset} not available'}), 400
            
            asset_info = AVAILABLE_ASSETS[asset]
            
            if start_date and end_date:
                logger.info(f'Fetching data for {asset}, interval: {interval}, date range: {start_date} to {end_date}, strategy: {strategy_mode}, EMA({ema_fast}/{ema_slow})')
                df = fetch_historical_data(
                    asset_info['symbol'],
                    asset_info['yf_symbol'],
                    interval,
                    start_date=start_date,
                    end_date=end_date
                )
            else:
                if days_back is None:
                    days_back = 730
                logger.info(f'Fetching data for {asset}, interval: {interval}, days_back: {days_back}, strategy: {strategy_mode}, EMA({ema_fast}/{ema_slow})')
                df = fetch_historical_data(
                    asset_info['symbol'],
                    asset_info['yf_symbol'],
                    interval,
                    days_back=days_back
                )
            
            if df.empty:
                logger.error(
                    f"Backtest data fetch returned empty dataframe "
                    f"(asset={asset}, yf_symbol={asset_info.get('yf_symbol')}, interval={interval}, "
                    f"days_back={days_back}, start_date={start_date}, end_date={end_date})"
                )
                # 502 is more accurate here: upstream data provider returned no data
                return jsonify({'error': 'Failed to fetch data (no candles returned)'}), 502
            
            trades, performance, open_position = run_backtest(
                df, initial_capital, enable_short, interval, strategy_mode, 
                ema_fast, ema_slow, indicator_type, indicator_params,
                entry_delay=entry_delay, exit_delay=exit_delay,
                use_stop_loss=use_stop_loss, dsl=dsl
            )
            
            run_date = datetime.now().isoformat()
            with backtest_lock:
                latest_backtest_store[asset] = {
                    'run_date': run_date,
                    'trades': convert_numpy_types(trades),
                    'performance': convert_numpy_types(performance),
                    'open_position': convert_numpy_types(open_position),
                    'asset': asset,
                    'interval': interval,
                    'days_back': days_back,
                    'start_date': start_date,
                    'end_date': end_date,
                    'strategy_mode': strategy_mode,
                    'ema_fast': ema_fast,
                    'ema_slow': ema_slow,
                }
            
            # Convert numpy types to Python native types for JSON serialization
            response_data = {
                'success': True,
                'trades': convert_numpy_types(trades),
                'performance': convert_numpy_types(performance),
                'open_position': convert_numpy_types(open_position),
                'run_date': run_date,
                'strategy_mode': strategy_mode,
                'ema_fast': ema_fast,
                'ema_slow': ema_slow,
            }
            return jsonify(response_data)
            
        except Exception as e:
            logger.error(f"Error running backtest: {e}", exc_info=True)
            return jsonify({'error': str(e)}), 500

    @app.route('/api/latest-backtest', methods=['GET'])
    def get_latest_backtest():
        """Get latest backtest results"""
        asset = request.args.get('asset', 'BTC/USDT')
        with backtest_lock:
            result = latest_backtest_store.get(asset)
            if result:
                return jsonify({'success': True, **result})
            return jsonify({'success': False, 'message': 'No backtest found', 'trades': [], 'performance': None, 'open_position': None})

    @app.route('/api/export-backtest-csv', methods=['GET'])
    def export_backtest_csv():
        """Export backtest results to CSV"""
        asset = request.args.get('asset', 'BTC/USDT')
        with backtest_lock:
            result = latest_backtest_store.get(asset)
            if not result or not result.get('trades'):
                return jsonify({'error': 'No backtest data to export'}), 404
            
            trades = result['trades']
            
            output = io.StringIO()
            if trades:
                fieldnames = trades[0].keys()
                writer = csv.DictWriter(output, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(trades)
            
            return Response(
                output.getvalue(),
                mimetype='text/csv',
                headers={'Content-Disposition': f'attachment; filename=backtest_{asset.replace("/", "_")}_{result["run_date"][:10]}.csv'}
            )

    @app.route('/api/analyze-current', methods=['POST', 'OPTIONS'])
    def analyze_current_market_api():
        """Analyze current market - real-time position monitoring"""
        if request.method == 'OPTIONS':
            return jsonify({'status': 'ok'}), 200
        
        try:
            data = request.get_json()
            asset = data.get('asset', 'BTC/USDT')
            interval = data.get('interval', '1d')
            days_back = data.get('days_back', 365)
            enable_short = data.get('enable_short', True)
            initial_capital = float(data.get('initial_capital', 10000))
            
            entry_signal, current_position, market_data = analyze_current_market(
                asset, interval, days_back, enable_short, initial_capital
            )
            
            return jsonify({
                'success': True,
                'entry_signal': entry_signal,
                'current_position': current_position,
                'market_data': market_data,
            })
            
        except Exception as e:
            logger.error(f"Error analyzing current market: {e}", exc_info=True)
            return jsonify({'error': str(e)}), 500

    @app.route('/api/position/<position_id>', methods=['GET'])
    def get_position(position_id):
        """Get position status"""
        with position_lock:
            position = open_positions_store.get(position_id)
            if position:
                return jsonify({'success': True, 'position': position})
            return jsonify({'error': 'Position not found'}), 404

    @app.route('/api/positions', methods=['GET'])
    def get_positions():
        """Get all open positions"""
        with position_lock:
            positions = list(open_positions_store.values())
            return jsonify({'success': True, 'positions': positions})

    @app.route('/api/position/<position_id>/close', methods=['POST'])
    def close_position(position_id):
        """Close a position"""
        with position_lock:
            position = open_positions_store.get(position_id)
            if position:
                del open_positions_store[position_id]
                return jsonify({'success': True, 'message': 'Position closed', 'position': position})
            return jsonify({'error': 'Position not found'}), 404

    @app.route('/api/chart-data', methods=['POST'])
    def get_chart_data():
        """Get chart data for TradingView"""
        try:
            data = request.get_json()
            asset = data.get('asset', 'BTC/USDT')
            interval = data.get('interval', '1d')
            days_back = int(data.get('days_back', 365))
            
            if asset not in AVAILABLE_ASSETS:
                return jsonify({'success': False, 'error': 'Asset not supported'}), 400
            
            asset_info = AVAILABLE_ASSETS[asset]
            df = fetch_historical_data(
                asset_info['symbol'],
                asset_info['yf_symbol'],
                interval,
                days_back
            )
            
            if df.empty:
                return jsonify({'success': False, 'error': 'No chart data available'}), 400
            
            chart_data = []
            for idx, row in df.iterrows():
                try:
                    timestamp = pd.Timestamp(row['Date'])
                    timestamp_ms = int(timestamp.timestamp() * 1000)
                    
                    chart_data.append({
                        'x': timestamp_ms,
                        'y': [
                            float(row['Open']) if pd.notna(row['Open']) else 0,
                            float(row['High']) if pd.notna(row['High']) else 0,
                            float(row['Low']) if pd.notna(row['Low']) else 0,
                            float(row['Close']) if pd.notna(row['Close']) else 0,
                        ]
                    })
                except Exception as e:
                    logger.warning(f'Error processing row {idx}: {e}')
                    continue
            
            if not chart_data:
                return jsonify({'success': False, 'error': 'No valid data points'}), 400
            
            return jsonify({
                'success': True,
                'data': chart_data,
                'ticker': asset_info['yf_symbol'],
                'interval': interval
            })
            
        except Exception as e:
            logger.error(f"Error fetching chart data: {e}", exc_info=True)
            return jsonify({'success': False, 'error': str(e)}), 500

    @app.route('/api/price-ema-data', methods=['POST', 'OPTIONS'])
    def get_price_ema_data():
        """Get price data with indicator values for CSV export"""
        if request.method == 'OPTIONS':
            return jsonify({'status': 'ok'}), 200
        
        try:
            logger.info("Received price/indicator data request")
            data = request.get_json()
            
            if not data:
                logger.error("No data received in request")
                return jsonify({'success': False, 'error': 'No data provided'}), 400
            asset = data.get('asset', 'BTC/USDT')
            interval = data.get('interval', '1d')
            start_date = data.get('start_date')
            end_date = data.get('end_date')
            days_back = data.get('days_back')
            
            indicator_type = data.get('indicator_type', 'ema')
            indicator_params = data.get('indicator_params')
            
            # Initialize indicator_params with defaults if not provided
            if indicator_params is None or indicator_params == {}:
                if indicator_type == 'ema':
                    ema_fast = int(data.get('ema_fast', 12))
                    ema_slow = int(data.get('ema_slow', 26))
                    indicator_params = {'fast': ema_fast, 'slow': ema_slow}
                elif indicator_type == 'ma':
                    indicator_params = {'fast': 12, 'slow': 26}
                elif indicator_type == 'rsi':
                    indicator_params = {'length': 14, 'top': 70, 'bottom': 30}
                elif indicator_type == 'cci':
                    indicator_params = {'length': 20, 'top': 100, 'bottom': -100}
                elif indicator_type == 'zscore':
                    indicator_params = {'length': 20, 'top': 2, 'bottom': -2}
                else:
                    indicator_params = {}
            
            # Ensure indicator_params is a dict (not None)
            if indicator_params is None:
                indicator_params = {}
            
            if asset not in AVAILABLE_ASSETS:
                return jsonify({'success': False, 'error': 'Asset not supported'}), 400
            
            asset_info = AVAILABLE_ASSETS[asset]
            df = fetch_historical_data(
                asset_info['symbol'],
                asset_info['yf_symbol'],
                interval,
                days_back=days_back,
                start_date=start_date,
                end_date=end_date
            )
            
            if df.empty:
                return jsonify({'success': False, 'error': 'No chart data available'}), 400
            
            indicator_values = {}
            line_count = indicator_params.get('lineCount', 2) if indicator_params else 2
            
            # Handle no indicator type (just price data)
            if not indicator_type or indicator_type == 'none':
                indicator_values = {'type': 'none'}
            elif indicator_type == 'ema':
                # Support single-line indicator with 'length' or multi-line with 'fast'/'slow'
                if indicator_params.get('length') and not indicator_params.get('fast'):
                    # Single line indicator
                    single_period = indicator_params.get('length', 20)
                    df['Indicator_Fast'] = calculate_ema(df, single_period)
                    indicator_values = {
                        'type': 'EMA',
                        'length': single_period,
                        'lineCount': 1,
                        'fast_col': 'Indicator_Fast',
                        'slow_col': None,
                        'medium_col': None
                    }
                else:
                    # Multi-line indicator
                    fast_period = indicator_params.get('fast', 12)
                    medium_period = indicator_params.get('medium', 21)
                    slow_period = indicator_params.get('slow', 26)
                    
                    df['Indicator_Fast'] = calculate_ema(df, fast_period)
                    if line_count >= 2:
                        df['Indicator_Slow'] = calculate_ema(df, slow_period)
                    if line_count >= 3:
                        df['Indicator_Medium'] = calculate_ema(df, medium_period)
                    
                    indicator_values = {
                        'type': 'EMA',
                        'fast': fast_period,
                        'slow': slow_period,
                        'medium': medium_period,
                        'lineCount': line_count,
                        'fast_col': 'Indicator_Fast',
                        'slow_col': 'Indicator_Slow' if line_count >= 2 else None,
                        'medium_col': 'Indicator_Medium' if line_count >= 3 else None
                    }
            elif indicator_type == 'ma':
                # Support single-line indicator with 'length' or multi-line with 'fast'/'slow'
                if indicator_params.get('length') and not indicator_params.get('fast'):
                    # Single line indicator
                    single_period = indicator_params.get('length', 20)
                    df['Indicator_Fast'] = calculate_ma(df, single_period)
                    indicator_values = {
                        'type': 'MA',
                        'length': single_period,
                        'lineCount': 1,
                        'fast_col': 'Indicator_Fast',
                        'slow_col': None,
                        'medium_col': None
                    }
                else:
                    # Multi-line indicator
                    fast_period = indicator_params.get('fast', 12)
                    medium_period = indicator_params.get('medium', 20)
                    slow_period = indicator_params.get('slow', 50)
                    
                    df['Indicator_Fast'] = calculate_ma(df, fast_period)
                    if line_count >= 2:
                        df['Indicator_Slow'] = calculate_ma(df, slow_period)
                    if line_count >= 3:
                        df['Indicator_Medium'] = calculate_ma(df, medium_period)
                    
                    indicator_values = {
                        'type': 'MA',
                        'fast': fast_period,
                        'slow': slow_period,
                        'medium': medium_period,
                        'lineCount': line_count,
                        'fast_col': 'Indicator_Fast',
                        'slow_col': 'Indicator_Slow' if line_count >= 2 else None,
                        'medium_col': 'Indicator_Medium' if line_count >= 3 else None
                    }
            elif indicator_type == 'dema':
                # Support single-line indicator with 'length' or multi-line with 'fast'/'slow'
                if indicator_params.get('length') and not indicator_params.get('fast'):
                    # Single line indicator
                    single_period = indicator_params.get('length', 20)
                    df['Indicator_Fast'] = calculate_dema(df, single_period)
                    indicator_values = {
                        'type': 'DEMA',
                        'length': single_period,
                        'lineCount': 1,
                        'fast_col': 'Indicator_Fast',
                        'slow_col': None,
                        'medium_col': None
                    }
                else:
                    # Multi-line indicator
                    fast_period = indicator_params.get('fast', 12)
                    medium_period = indicator_params.get('medium', 20)
                    slow_period = indicator_params.get('slow', 26)
                    
                    df['Indicator_Fast'] = calculate_dema(df, fast_period)
                    if line_count >= 2:
                        df['Indicator_Slow'] = calculate_dema(df, slow_period)
                    if line_count >= 3:
                        df['Indicator_Medium'] = calculate_dema(df, medium_period)
                    
                    indicator_values = {
                        'type': 'DEMA',
                        'fast': fast_period,
                        'slow': slow_period,
                        'medium': medium_period,
                        'lineCount': line_count,
                        'fast_col': 'Indicator_Fast',
                        'slow_col': 'Indicator_Slow' if line_count >= 2 else None,
                        'medium_col': 'Indicator_Medium' if line_count >= 3 else None
                    }
            elif indicator_type == 'rsi':
                length = indicator_params.get('length', 14)
                df['Indicator_Value'] = calculate_rsi(df, length)
                indicator_values = {
                    'type': 'RSI',
                    'length': length,
                    'top': indicator_params.get('top', 70),
                    'bottom': indicator_params.get('bottom', 30),
                    'value_col': 'Indicator_Value'
                }
            elif indicator_type == 'cci':
                length = indicator_params.get('length', 20)
                df['Indicator_Value'] = calculate_cci(df, length)
                indicator_values = {
                    'type': 'CCI',
                    'length': length,
                    'top': indicator_params.get('top', 100),
                    'bottom': indicator_params.get('bottom', -100),
                    'value_col': 'Indicator_Value'
                }
            elif indicator_type == 'zscore':
                length = indicator_params.get('length', 20)
                df['Indicator_Value'] = calculate_zscore(df, length)
                indicator_values = {
                    'type': 'Z-Score',
                    'length': length,
                    'top': indicator_params.get('top', 2),
                    'bottom': indicator_params.get('bottom', -2),
                    'value_col': 'Indicator_Value'
                }
            elif indicator_type == 'roll_std':
                length = indicator_params.get('length', 20)
                df['Indicator_Value'] = calculate_roll_std(df, length)
                indicator_values = {
                    'type': 'Roll Std',
                    'length': length,
                    'value_col': 'Indicator_Value'
                }
            elif indicator_type == 'roll_median':
                length = indicator_params.get('length', 20)
                df['Indicator_Value'] = calculate_roll_median(df, length)
                indicator_values = {
                    'type': 'Roll Median',
                    'length': length,
                    'value_col': 'Indicator_Value'
                }
            elif indicator_type == 'roll_percentile':
                length = indicator_params.get('length', 20)
                percentile = indicator_params.get('percentile', 50)
                df['Indicator_Value'] = calculate_roll_percentile(df, length, percentile)
                indicator_values = {
                    'type': 'Roll Percentile',
                    'length': length,
                    'percentile': percentile,
                    'value_col': 'Indicator_Value'
                }
            # Fallback - no specific indicator type, just return price data
            else:
                indicator_values = {'type': 'none'}
            
            export_data = []
            for idx, row in df.iterrows():
                try:
                    date_str = pd.Timestamp(row['Date']).strftime('%Y-%m-%d %H:%M:%S')
                    row_data = {
                        'Date': date_str,
                        'Open': float(row['Open']) if pd.notna(row['Open']) else 0,
                        'Close': float(row['Close']) if pd.notna(row['Close']) else 0,
                        'High': float(row['High']) if pd.notna(row['High']) else 0,
                        'Low': float(row['Low']) if pd.notna(row['Low']) else 0,
                        'Volume': float(row['Volume']) if pd.notna(row['Volume']) else 0
                    }
                    
                    # Add indicator values based on type
                    if 'fast_col' in indicator_values and indicator_values.get('fast_col'):
                        row_data['Indicator_Fast'] = float(row[indicator_values['fast_col']]) if pd.notna(row.get(indicator_values['fast_col'])) else None
                    if 'slow_col' in indicator_values and indicator_values.get('slow_col'):
                        row_data['Indicator_Slow'] = float(row[indicator_values['slow_col']]) if pd.notna(row.get(indicator_values['slow_col'])) else None
                    if 'medium_col' in indicator_values and indicator_values.get('medium_col'):
                        row_data['Indicator_Medium'] = float(row[indicator_values['medium_col']]) if pd.notna(row.get(indicator_values['medium_col'])) else None
                    elif 'value_col' in indicator_values:
                        row_data['Indicator_Value'] = float(row[indicator_values['value_col']]) if pd.notna(row[indicator_values['value_col']]) else None
                    
                    export_data.append(row_data)
                except Exception as e:
                    logger.warning(f'Error processing row {idx}: {e}')
                    continue
            
            if not export_data:
                return jsonify({'success': False, 'error': 'No valid data points'}), 400
            
            response_data = {
                'success': True,
                'data': export_data,
                'indicator_type': indicator_type,
                'indicator_values': indicator_values,
                'interval': interval
            }
            
            if indicator_type in ['ema', 'ma']:
                response_data['ema_fast'] = indicator_values.get('fast', 12)
                response_data['ema_slow'] = indicator_values.get('slow', 26)
            
            return jsonify(response_data)
        except Exception as e:
            logger.error(f"Error fetching price/indicator data: {e}", exc_info=True)
            return jsonify({'success': False, 'error': str(e)}), 500

    @app.route('/api/optimize', methods=['POST', 'OPTIONS'])
    def run_optimization():
        """Run parameter optimization for EMA crossover or indicator strategy"""
        if request.method == 'OPTIONS':
            return jsonify({'status': 'ok'}), 200
        
        try:
            data = request.get_json()
            symbol = data.get('symbol', 'BTC-USD')
            interval = data.get('interval', '1d')
            years = data.get('years', [2023, 2022])
            sample_type = data.get('sample_type', 'in_sample')
            indicator_type = data.get('indicator_type', 'ema')
            indicator_params = data.get('indicator_params', {})
            max_ema_short = data.get('max_ema_short')
            max_ema_long = data.get('max_ema_long')
            max_indicator_length = data.get('max_indicator_length')
            max_indicator_top = data.get('max_indicator_top')
            position_type = data.get('position_type', 'both')
            strategy_mode = data.get('strategy_mode', 'reversal')
            oscillator_strategy = data.get('oscillator_strategy', 'mean_reversion')
            risk_free_rate = float(data.get('risk_free_rate', 0))
            
            valid_positions = ['both', 'long_only', 'short_only']
            if position_type not in valid_positions:
                position_type = 'both'
            
            if isinstance(years, (int, float)):
                years = [int(years)]
            
            years = sorted(years)
            
            if not years:
                return jsonify({'error': 'No years selected'}), 400
            
            min_year = min(years)
            max_year = max(years)
            
            start_date = datetime(min_year, 1, 1)
            end_date = datetime(max_year, 12, 31)
            
            yf_symbol = symbol
            
            df = fetch_historical_data(
                symbol=symbol,
                yf_symbol=yf_symbol,
                interval=interval,
                start_date=start_date,
                end_date=end_date
            )
            
            if df.empty or len(df) < 50:
                return jsonify({'error': 'Failed to fetch sufficient data'}), 400
            
            df['Date'] = pd.to_datetime(df['Date'])
            df['Year'] = df['Date'].dt.year
            
            sample_data = df[df['Year'].isin(years)].copy()
            
            logger.info(f"Sample data: {len(sample_data)} rows for years {years}")
            
            if len(sample_data) < 50:
                return jsonify({'error': f'Insufficient data for selected years. Only {len(sample_data)} data points found.'}), 400
            
            results = []
            combinations_tested = 0
            
            # Crossover indicators: EMA, MA, DEMA
            if indicator_type in ['ema', 'ma', 'dema']:
                max_ema_short = int(max_ema_short or 20)
                max_ema_long = int(max_ema_long or 50)
                
                indicator_label = indicator_type.upper()
                logger.info(f"Running {sample_type} optimization for {symbol}, indicator: {indicator_label}, interval: {interval}")
                logger.info(f"Years: {years}")
                logger.info(f"{indicator_label} range: Short 3-{max_ema_short}, Long 10-{max_ema_long}")
                
                ema_short_range = range(3, min(max_ema_short + 1, max_ema_long))
                ema_long_range = range(10, max_ema_long + 1)
                
                for ema_short in ema_short_range:
                    for ema_long in ema_long_range:
                        if ema_short >= ema_long:
                            continue
                        
                        combinations_tested += 1
                        result = run_optimization_backtest(
                            sample_data,
                            ema_short,
                            ema_long,
                            position_type=position_type,
                            risk_free_rate=risk_free_rate,
                            indicator_type=indicator_type,
                            strategy_mode=strategy_mode
                        )
                        if result:
                            results.append(result)
            
            else:  # RSI, CCI, Z-Score, Roll_Std, Roll_Median, Roll_Percentile
                indicator_length = data.get('indicator_length')
                if indicator_length is None:
                    indicator_length = indicator_params.get('length', 14)
                indicator_length = int(indicator_length)
                
                min_indicator_bottom = float(data.get('min_indicator_bottom', -200))
                max_indicator_bottom = float(data.get('max_indicator_bottom', 0))
                min_indicator_top = float(data.get('min_indicator_top', 0))
                max_indicator_top = float(data.get('max_indicator_top', 200))
                
                # Determine step size based on indicator type
                if indicator_type == 'rsi':
                    bottom_range = range(int(min_indicator_bottom), int(max_indicator_bottom) + 1, 5)
                    top_range = range(int(min_indicator_top), int(max_indicator_top) + 1, 5)
                elif indicator_type == 'cci':
                    bottom_range = range(int(min_indicator_bottom), int(max_indicator_bottom) + 1, 10)
                    top_range = range(int(min_indicator_top), int(max_indicator_top) + 1, 10)
                elif indicator_type == 'zscore':
                    # Use step of 0.1 for Z-Score
                    bottom_range = [x/10 for x in range(int(min_indicator_bottom*10), int(max_indicator_bottom*10) + 1, 1)]
                    top_range = [x/10 for x in range(int(min_indicator_top*10), int(max_indicator_top*10) + 1, 1)]
                elif indicator_type == 'roll_std':
                    # Rolling Std: step of 0.1 for volatility thresholds
                    bottom_range = [x/10 for x in range(int(min_indicator_bottom*10), int(max_indicator_bottom*10) + 1, 1)]
                    top_range = [x/10 for x in range(int(min_indicator_top*10), int(max_indicator_top*10) + 1, 1)]
                elif indicator_type == 'roll_median':
                    # Rolling Median uses price cross, so use single value ranges (the length matters, not thresholds)
                    bottom_range = [0]  # Not used for price cross
                    top_range = [0]     # Not used for price cross
                elif indicator_type == 'roll_percentile':
                    # Rolling Percentile: step of 5 for percentile thresholds
                    bottom_range = range(int(min_indicator_bottom), int(max_indicator_bottom) + 1, 5)
                    top_range = range(int(min_indicator_top), int(max_indicator_top) + 1, 5)
                else:
                    return jsonify({'error': f'Unsupported indicator type: {indicator_type}'}), 400
                
                logger.info(f"Running {sample_type} optimization for {symbol}, indicator: {indicator_type}, interval: {interval}")
                logger.info(f"Years: {years}")
                logger.info(f"Fixed Length: {indicator_length}, Bottom: {min_indicator_bottom} to {max_indicator_bottom}, Top: {min_indicator_top} to {max_indicator_top}")
                
                for indicator_bottom in bottom_range:
                    for indicator_top in top_range:
                        combinations_tested += 1
                        result = run_indicator_optimization_backtest(
                            sample_data,
                            indicator_type,
                            indicator_length,
                            indicator_top,
                            indicator_bottom,
                            position_type=position_type,
                            risk_free_rate=risk_free_rate,
                            strategy_mode=strategy_mode,
                            oscillator_strategy=oscillator_strategy
                        )
                        if result:
                            results.append(result)
            
            results.sort(key=lambda x: x['sharpe_ratio'], reverse=True)
            
            sample_start = sample_data.iloc[0]['Date'].strftime('%Y-%m-%d') if len(sample_data) > 0 else 'N/A'
            sample_end = sample_data.iloc[-1]['Date'].strftime('%Y-%m-%d') if len(sample_data) > 0 else 'N/A'
            years_str = ', '.join(map(str, years))
            
            return jsonify({
                'success': True,
                'symbol': symbol,
                'interval': interval,
                'sample_type': sample_type,
                'results': results,
                'combinations_tested': combinations_tested,
                'period': f"{years_str} ({sample_start} to {sample_end})",
                'years': years,
                'data_points': len(sample_data),
            })
            
        except Exception as e:
            logger.error(f"Error running optimization: {e}", exc_info=True)
            return jsonify({'error': str(e)}), 500

    @app.route('/api/download-optimization-data', methods=['POST', 'OPTIONS'])
    def download_optimization_data():
        """Download the dataset and indicator values used for optimization"""
        if request.method == 'OPTIONS':
            return jsonify({'status': 'ok'}), 200
        
        try:
            data = request.get_json()
            symbol = data.get('symbol', 'BTC-USD')
            interval = data.get('interval', '1d')
            years = data.get('years', [2023, 2022])
            indicator_type = data.get('indicator_type', 'ema')
            indicator_length = int(data.get('indicator_length', 14))
            ema_short = int(data.get('ema_short', 12))
            ema_long = int(data.get('ema_long', 26))
            indicator_bottom = float(data.get('indicator_bottom', 30))
            indicator_top = float(data.get('indicator_top', 70))
            
            if isinstance(years, (int, float)):
                years = [int(years)]
            
            years = sorted(years)
            
            if not years:
                return jsonify({'error': 'No years selected'}), 400
            
            min_year = min(years)
            max_year = max(years)
            
            start_date = datetime(min_year, 1, 1)
            end_date = datetime(max_year, 12, 31)
            
            df = fetch_historical_data(
                symbol=symbol,
                yf_symbol=symbol,
                interval=interval,
                start_date=start_date,
                end_date=end_date
            )
            
            if df.empty or len(df) < 50:
                return jsonify({'error': 'Failed to fetch sufficient data'}), 400
            
            df['Date'] = pd.to_datetime(df['Date'])
            df['Year'] = df['Date'].dt.year
            
            # Filter to selected years
            sample_data = df[df['Year'].isin(years)].copy()
            
            if len(sample_data) < 10:
                return jsonify({'error': 'Insufficient data for selected years'}), 400
            
            # Calculate indicators based on type
            if indicator_type in ['ema', 'ma', 'dema']:
                if indicator_type == 'ema':
                    sample_data[f'EMA_{ema_short}'] = calculate_ema(sample_data, ema_short, use_cache=False)
                    sample_data[f'EMA_{ema_long}'] = calculate_ema(sample_data, ema_long, use_cache=False)
                elif indicator_type == 'ma':
                    sample_data[f'MA_{ema_short}'] = calculate_ma(sample_data, ema_short, use_cache=False)
                    sample_data[f'MA_{ema_long}'] = calculate_ma(sample_data, ema_long, use_cache=False)
                elif indicator_type == 'dema':
                    sample_data[f'DEMA_{ema_short}'] = calculate_dema(sample_data, ema_short, use_cache=False)
                    sample_data[f'DEMA_{ema_long}'] = calculate_dema(sample_data, ema_long, use_cache=False)
            elif indicator_type == 'rsi':
                sample_data[f'RSI_{indicator_length}'] = calculate_rsi(sample_data, indicator_length, use_cache=False)
                sample_data['Threshold_Bottom'] = indicator_bottom
                sample_data['Threshold_Top'] = indicator_top
            elif indicator_type == 'cci':
                sample_data[f'CCI_{indicator_length}'] = calculate_cci(sample_data, indicator_length, use_cache=False)
                sample_data['Threshold_Bottom'] = indicator_bottom
                sample_data['Threshold_Top'] = indicator_top
            elif indicator_type == 'zscore':
                sample_data[f'ZScore_{indicator_length}'] = calculate_zscore(sample_data, indicator_length, use_cache=False)
                sample_data['Threshold_Bottom'] = indicator_bottom
                sample_data['Threshold_Top'] = indicator_top
            elif indicator_type == 'roll_std':
                sample_data[f'RollStd_{indicator_length}'] = calculate_roll_std(sample_data, indicator_length, use_cache=False)
                sample_data['Threshold_Bottom'] = indicator_bottom
                sample_data['Threshold_Top'] = indicator_top
            elif indicator_type == 'roll_median':
                sample_data[f'RollMedian_{indicator_length}'] = calculate_roll_median(sample_data, indicator_length, use_cache=False)
            elif indicator_type == 'roll_percentile':
                sample_data[f'RollPct_{indicator_length}'] = calculate_roll_percentile(sample_data, indicator_length, use_cache=False)
                sample_data['Threshold_Bottom'] = indicator_bottom
                sample_data['Threshold_Top'] = indicator_top
            
            # Remove internal columns
            if '_Year' in sample_data.columns:
                sample_data = sample_data.drop(columns=['_Year'])
            
            # Format Date for CSV
            sample_data['Date'] = sample_data['Date'].dt.strftime('%Y-%m-%d %H:%M:%S')
            
            # Convert to CSV
            csv_data = sample_data.to_csv(index=False)
            
            # Return as downloadable CSV
            response = make_response(csv_data)
            response.headers['Content-Type'] = 'text/csv'
            response.headers['Content-Disposition'] = f'attachment; filename={symbol}_{indicator_type}_{"-".join(map(str, years))}.csv'
            
            return response
            
        except Exception as e:
            logger.error(f"Error downloading optimization data: {e}", exc_info=True)
            return jsonify({'error': str(e)}), 500

    @app.route('/api/optimize-single', methods=['POST', 'OPTIONS'])
    def run_single_optimization():
        """Run single EMA combination test for out-of-sample validation"""
        if request.method == 'OPTIONS':
            return jsonify({'status': 'ok'}), 200
        
        try:
            data = request.get_json()
            symbol = data.get('symbol', 'BTC-USD')
            interval = data.get('interval', '1d')
            years = data.get('years', [2024, 2025])
            ema_short = int(data.get('ema_short', 12))
            ema_long = int(data.get('ema_long', 26))
            position_type = data.get('position_type', 'both')
            strategy_mode = data.get('strategy_mode', 'reversal')
            risk_free_rate = float(data.get('risk_free_rate', 0))
            
            valid_positions = ['both', 'long_only', 'short_only']
            if position_type not in valid_positions:
                position_type = 'both'
            
            if isinstance(years, (int, float)):
                years = [int(years)]
            
            years = sorted(years)
            
            logger.info(f"Running single validation for {symbol}, EMA {ema_short}/{ema_long}, position: {position_type}, rf: {risk_free_rate}")
            logger.info(f"Years: {years}")
            
            if not years:
                return jsonify({'error': 'No years selected'}), 400
            
            if ema_short >= ema_long:
                return jsonify({'error': 'Short EMA must be less than Long EMA'}), 400
            
            min_year = min(years)
            max_year = max(years)
            
            start_date = datetime(min_year, 1, 1)
            end_date = datetime(max_year, 12, 31)
            
            yf_symbol = symbol
            
            df = fetch_historical_data(
                symbol=symbol,
                yf_symbol=yf_symbol,
                interval=interval,
                start_date=start_date,
                end_date=end_date
            )
            
            if df.empty or len(df) < 30:
                return jsonify({'error': 'Failed to fetch sufficient data'}), 400
            
            df['Date'] = pd.to_datetime(df['Date'])
            df['Year'] = df['Date'].dt.year
            
            sample_data = df[df['Year'].isin(years)].copy()
            
            if len(sample_data) < 30:
                return jsonify({'error': f'Insufficient data. Only {len(sample_data)} data points found.'}), 400
            
            result = run_optimization_backtest(
                sample_data,
                ema_short,
                ema_long,
                position_type=position_type,
                risk_free_rate=risk_free_rate,
                strategy_mode=strategy_mode
            )
            
            if not result:
                return jsonify({'error': 'Failed to run backtest'}), 400
            
            sample_start = sample_data.iloc[0]['Date'].strftime('%Y-%m-%d')
            sample_end = sample_data.iloc[-1]['Date'].strftime('%Y-%m-%d')
            years_str = ', '.join(map(str, years))
            
            return jsonify({
                'success': True,
                'symbol': symbol,
                'interval': interval,
                'ema_short': ema_short,
                'ema_long': ema_long,
                'sharpe_ratio': result['sharpe_ratio'],
                'total_return': result['total_return'],
                'max_drawdown': result['max_drawdown'],
                'win_rate': result['win_rate'],
                'total_trades': result['total_trades'],
                'period': f"{years_str} ({sample_start} to {sample_end})",
                'years': years,
                'data_points': len(sample_data),
            })
            
        except Exception as e:
            logger.error(f"Error running single optimization: {e}", exc_info=True)
            return jsonify({'error': str(e)}), 500

    @app.route('/api/optimize-equity', methods=['POST', 'OPTIONS'])
    def run_equity_optimization():
        """Run backtest with equity curve for both in-sample and out-of-sample with multiple splits"""
        if request.method == 'OPTIONS':
            return jsonify({'status': 'ok'}), 200
        
        try:
            data = request.get_json()
            symbol = data.get('symbol', 'BTC-USD')
            interval = data.get('interval', '1d')
            in_sample_years = data.get('in_sample_years', [2022, 2023])
            out_sample_years = data.get('out_sample_years', [2024, 2025])
            indicator_type = data.get('indicator_type', 'ema')
            initial_capital = float(data.get('initial_capital', 10000))
            position_type = data.get('position_type', 'both')
            strategy_mode = data.get('strategy_mode', 'reversal')
            oscillator_strategy = data.get('oscillator_strategy', 'mean_reversion')
            risk_free_rate = float(data.get('risk_free_rate', 0))
            
            valid_positions = ['both', 'long_only', 'short_only']
            if position_type not in valid_positions:
                position_type = 'both'
            
            if isinstance(in_sample_years, (int, float)):
                in_sample_years = [int(in_sample_years)]
            if isinstance(out_sample_years, (int, float)):
                out_sample_years = [int(out_sample_years)]
            
            in_sample_years = sorted(in_sample_years)
            out_sample_years = sorted(out_sample_years)
            
            all_years = sorted(set(in_sample_years + out_sample_years))
            if not all_years:
                return jsonify({'error': 'No years selected'}), 400
                
            min_year = min(all_years)
            max_year = max(all_years)
            
            start_date = datetime(min_year, 1, 1)
            end_date = datetime(max_year, 12, 31)
            
            yf_symbol = symbol
            
            df = fetch_historical_data(
                symbol=symbol,
                yf_symbol=yf_symbol,
                interval=interval,
                start_date=start_date,
                end_date=end_date
            )
            
            if df.empty or len(df) < 50:
                return jsonify({'error': 'Failed to fetch sufficient data'}), 400
            
            df['Date'] = pd.to_datetime(df['Date'])
            df['Year'] = df['Date'].dt.year
            
            df = df[df['Year'].isin(all_years)].copy()
            
            if len(df) < 50:
                return jsonify({'error': 'Insufficient data for selected years'}), 400
            
            if indicator_type == 'ema':
                ema_short = int(data.get('ema_short', 12))
                ema_long = int(data.get('ema_long', 26))
                
                if ema_short >= ema_long:
                    return jsonify({'error': 'Short EMA must be less than Long EMA'}), 400
                
                logger.info(f"Running equity backtest for {symbol}, EMA {ema_short}/{ema_long}, position: {position_type}, rf: {risk_free_rate}")
                logger.info(f"In-sample years: {in_sample_years}, Out-sample years: {out_sample_years}")
                logger.info(f"Initial capital: ${initial_capital}")
                
                in_sample_metrics, out_sample_metrics, equity_curve = run_combined_equity_backtest(
                    df,
                    ema_short,
                    ema_long,
                    initial_capital,
                    in_sample_years,
                    out_sample_years,
                    position_type,
                    risk_free_rate,
                    strategy_mode=strategy_mode
                )
            else:
                # RSI, CCI, or Z-Score
                indicator_length = int(data.get('indicator_length', 14))
                indicator_top = float(data.get('indicator_top', 2))
                indicator_bottom = float(data.get('indicator_bottom', -2))
                
                logger.info(f"Running equity backtest for {symbol}, {indicator_type.upper()} Length: {indicator_length}, Top: {indicator_top}, Bottom: {indicator_bottom}")
                logger.info(f"In-sample years: {in_sample_years}, Out-sample years: {out_sample_years}")
                logger.info(f"Initial capital: ${initial_capital}")
                
                in_sample_metrics, out_sample_metrics, equity_curve = run_combined_equity_backtest_indicator(
                    df,
                    indicator_type,
                    indicator_length,
                    indicator_top,
                    indicator_bottom,
                    initial_capital,
                    in_sample_years,
                    out_sample_years,
                    position_type,
                    risk_free_rate,
                    strategy_mode=strategy_mode,
                    oscillator_strategy=oscillator_strategy
                )
            
            segments = []
            if equity_curve:
                current_segment = {'type': equity_curve[0]['sample_type'], 'start': 0}
                for i, point in enumerate(equity_curve):
                    if point['sample_type'] != current_segment['type']:
                        current_segment['end'] = i - 1
                        segments.append(current_segment)
                        current_segment = {'type': point['sample_type'], 'start': i}
                current_segment['end'] = len(equity_curve) - 1
                segments.append(current_segment)
            
            in_sample_dates = df[df['Year'].isin(in_sample_years)]
            out_sample_dates = df[df['Year'].isin(out_sample_years)]
            
            in_sample_start = in_sample_dates.iloc[0]['Date'].strftime('%Y-%m-%d') if len(in_sample_dates) > 0 else 'N/A'
            in_sample_end = in_sample_dates.iloc[-1]['Date'].strftime('%Y-%m-%d') if len(in_sample_dates) > 0 else 'N/A'
            out_sample_start = out_sample_dates.iloc[0]['Date'].strftime('%Y-%m-%d') if len(out_sample_dates) > 0 else 'N/A'
            out_sample_end = out_sample_dates.iloc[-1]['Date'].strftime('%Y-%m-%d') if len(out_sample_dates) > 0 else 'N/A'
            
            response_data = {
                'success': True,
                'symbol': symbol,
                'interval': interval,
                'initial_capital': initial_capital,
                'in_sample': {
                    **in_sample_metrics,
                    'period': f"{', '.join(map(str, in_sample_years))} ({in_sample_start} to {in_sample_end})",
                    'years': in_sample_years,
                } if in_sample_metrics else None,
                'out_sample': {
                    **out_sample_metrics,
                    'period': f"{', '.join(map(str, out_sample_years))} ({out_sample_start} to {out_sample_end})",
                    'years': out_sample_years,
                } if out_sample_metrics else None,
                'equity_curve': equity_curve,
                'segments': segments,
            }
            
            if indicator_type == 'ema':
                response_data['ema_short'] = ema_short
                response_data['ema_long'] = ema_long
            else:
                response_data['indicator_type'] = indicator_type
                response_data['indicator_length'] = indicator_length
                response_data['indicator_top'] = indicator_top
                response_data['indicator_bottom'] = indicator_bottom
            
            return jsonify(response_data)
            
        except Exception as e:
            logger.error(f"Error running equity optimization: {e}", exc_info=True)
            return jsonify({'error': str(e)}), 500

    @app.route('/api/indicators', methods=['POST', 'OPTIONS'])
    def calculate_indicators_api():
        """
        Calculate indicator values for chart display
        
        Request body:
        {
            symbol: string,
            timeframe: string,
            indicators: [
                {
                    id: string,
                    type: 'zscore' | 'dema' | 'roll_std' | 'roll_median' | 'roll_percentile',
                    enabled: boolean,
                    pane: 'overlay' | 'oscillator',
                    source: 'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3' | 'ohlc4',
                    params: { length?: number, percentile?: number, ... }
                }
            ]
        }
        
        Response:
        {
            candles: [{ time, open, high, low, close, volume }],
            indicators: {
                [indicatorId]: [{ time, value }]
            }
        }
        """
        if request.method == 'OPTIONS':
            return jsonify({'status': 'ok'}), 200
        
        try:
            data = request.json
            symbol = data.get('symbol', 'BTC-USD')
            timeframe = data.get('timeframe', '1d')
            indicators_config = data.get('indicators', [])
            
            # Map symbol to yfinance format
            asset_info = AVAILABLE_ASSETS.get(symbol)
            if not asset_info:
                return jsonify({'error': f'Unknown symbol: {symbol}'}), 400
            
            # Fetch historical data
            logger.info(f'Fetching data for indicators: {symbol}, {timeframe}')
            df = fetch_historical_data(
                asset_info['symbol'],
                asset_info['yf_symbol'],
                timeframe,
                days_back=365  # Default 1 year of data
            )
            
            if df.empty:
                logger.error(
                    f"Indicator data fetch returned empty dataframe "
                    f"(symbol={symbol}, yf_symbol={asset_info.get('yf_symbol')}, timeframe={timeframe})"
                )
                return jsonify({'error': 'Failed to fetch data (no candles returned)'}), 502
            
            # Prepare candles
            candles = []
            for idx, row in df.iterrows():
                candles.append({
                    'time': int(row['Date'].timestamp()) if hasattr(row['Date'], 'timestamp') else int(pd.to_datetime(row['Date']).timestamp()),
                    'open': float(row['Open']),
                    'high': float(row['High']),
                    'low': float(row['Low']),
                    'close': float(row['Close']),
                    'volume': float(row.get('Volume', 0))
                })
            
            # Calculate indicators
            indicators_data = {}
            
            for ind_config in indicators_config:
                if not ind_config.get('enabled', True):
                    continue
                    
                ind_id = ind_config.get('id')
                ind_type = ind_config.get('type', '').lower()
                source = ind_config.get('source', 'close')
                params = ind_config.get('params', {})
                length = int(params.get('length', 20))
                
                # Get source series
                if source == 'close':
                    src = df['Close']
                elif source == 'open':
                    src = df['Open']
                elif source == 'high':
                    src = df['High']
                elif source == 'low':
                    src = df['Low']
                elif source == 'hl2':
                    src = (df['High'] + df['Low']) / 2
                elif source == 'hlc3':
                    src = (df['High'] + df['Low'] + df['Close']) / 3
                elif source == 'ohlc4':
                    src = (df['Open'] + df['High'] + df['Low'] + df['Close']) / 4
                else:
                    src = df['Close']
                
                # Calculate indicator
                result = None
                
                if ind_type == 'ema':
                    result = src.ewm(span=length, adjust=False).mean()
                    
                elif ind_type == 'ma':
                    result = src.rolling(window=length).mean()
                    
                elif ind_type == 'dema':
                    ema1 = src.ewm(span=length, adjust=False).mean()
                    ema2 = ema1.ewm(span=length, adjust=False).mean()
                    result = 2 * ema1 - ema2
                    
                elif ind_type == 'rsi':
                    delta = src.diff()
                    gain = delta.where(delta > 0, 0).rolling(window=length).mean()
                    loss = (-delta.where(delta < 0, 0)).rolling(window=length).mean()
                    rs = gain / loss
                    result = 100 - (100 / (1 + rs))
                    
                elif ind_type == 'cci':
                    tp = (df['High'] + df['Low'] + df['Close']) / 3
                    sma = tp.rolling(window=length).mean()
                    mad = tp.rolling(window=length).apply(lambda x: np.abs(x - x.mean()).mean())
                    result = (tp - sma) / (0.015 * mad)
                    
                elif ind_type == 'zscore':
                    mean = src.rolling(window=length).mean()
                    std = src.rolling(window=length).std()
                    result = (src - mean) / std
                    
                elif ind_type == 'roll_std':
                    result = src.rolling(window=length).std()
                    
                elif ind_type == 'roll_median':
                    result = src.rolling(window=length).median()
                    
                elif ind_type == 'roll_percentile':
                    percentile = int(params.get('percentile', 50))
                    result = src.rolling(window=length).quantile(percentile / 100)
                
                if result is not None:
                    indicator_values = []
                    for i, (idx, row) in enumerate(df.iterrows()):
                        val = result.iloc[i]
                        if pd.notna(val):
                            indicator_values.append({
                                'time': candles[i]['time'],
                                'value': float(val)
                            })
                    indicators_data[ind_id] = indicator_values
            
            return jsonify({
                'success': True,
                'candles': candles,
                'indicators': indicators_data
            })
            
        except Exception as e:
            logger.error(f"Error calculating indicators: {e}", exc_info=True)
            return jsonify({'error': str(e)}), 500
