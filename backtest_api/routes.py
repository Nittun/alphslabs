"""
Flask API routes - all API endpoints
"""
from flask import request, jsonify, Response
from datetime import datetime
import yfinance as yf
import pandas as pd
import numpy as np
import io
import csv
import logging

# Import from our modules
from .components.config import AVAILABLE_ASSETS
from .components.stores import open_positions_store, position_lock, latest_backtest_store, backtest_lock
from .components.data_fetcher import fetch_historical_data
from .components.indicators import calculate_ema, calculate_ma, calculate_rsi, calculate_cci, calculate_zscore
from .components.backtest_engine import (
    run_backtest, analyze_current_market, 
    run_optimization_backtest, run_combined_equity_backtest, run_indicator_optimization_backtest,
    run_combined_equity_backtest_indicator
)

logger = logging.getLogger(__name__)

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
        """Fetch real-time prices for top 10 cryptocurrencies"""
        try:
            crypto_symbols = {
                'BTC': 'BTC-USD',
                'ETH': 'ETH-USD',
                'BNB': 'BNB-USD',
                'XRP': 'XRP-USD',
                'SOL': 'SOL-USD',
                'ADA': 'ADA-USD',
                'DOGE': 'DOGE-USD',
                'TRX': 'TRX-USD',
                'AVAX': 'AVAX-USD',
                'DOT': 'DOT-USD',
            }
            
            prices = {}
            for symbol, yf_symbol in crypto_symbols.items():
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
            
            # Validate delays (1-5)
            entry_delay = max(1, min(5, entry_delay))
            exit_delay = max(1, min(5, exit_delay))
            
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
                return jsonify({'error': 'Failed to fetch data'}), 500
            
            trades, performance, open_position = run_backtest(
                df, initial_capital, enable_short, interval, strategy_mode, 
                ema_fast, ema_slow, indicator_type, indicator_params,
                entry_delay=entry_delay, exit_delay=exit_delay
            )
            
            run_date = datetime.now().isoformat()
            with backtest_lock:
                latest_backtest_store[asset] = {
                    'run_date': run_date,
                    'trades': trades,
                    'performance': performance,
                    'open_position': open_position,
                    'asset': asset,
                    'interval': interval,
                    'days_back': days_back,
                    'start_date': start_date,
                    'end_date': end_date,
                    'strategy_mode': strategy_mode,
                    'ema_fast': ema_fast,
                    'ema_slow': ema_slow,
                }
            
            return jsonify({
                'success': True,
                'trades': trades,
                'performance': performance,
                'open_position': open_position,
                'run_date': run_date,
                'strategy_mode': strategy_mode,
                'ema_fast': ema_fast,
                'ema_slow': ema_slow,
            })
            
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
            if indicator_type == 'ema':
                fast_period = indicator_params.get('fast', 12)
                slow_period = indicator_params.get('slow', 26)
                df['Indicator_Fast'] = calculate_ema(df, fast_period)
                df['Indicator_Slow'] = calculate_ema(df, slow_period)
                indicator_values = {
                    'type': 'EMA',
                    'fast': fast_period,
                    'slow': slow_period,
                    'fast_col': 'Indicator_Fast',
                    'slow_col': 'Indicator_Slow'
                }
            elif indicator_type == 'ma':
                fast_period = indicator_params.get('fast', 12)
                slow_period = indicator_params.get('slow', 26)
                df['Indicator_Fast'] = calculate_ma(df, fast_period)
                df['Indicator_Slow'] = calculate_ma(df, slow_period)
                indicator_values = {
                    'type': 'MA',
                    'fast': fast_period,
                    'slow': slow_period,
                    'fast_col': 'Indicator_Fast',
                    'slow_col': 'Indicator_Slow'
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
            else:
                fast_period = indicator_params.get('fast', 12) if indicator_params else 12
                slow_period = indicator_params.get('slow', 26) if indicator_params else 26
                df['Indicator_Fast'] = calculate_ema(df, fast_period)
                df['Indicator_Slow'] = calculate_ema(df, slow_period)
                indicator_values = {
                    'type': 'EMA',
                    'fast': fast_period,
                    'slow': slow_period,
                    'fast_col': 'Indicator_Fast',
                    'slow_col': 'Indicator_Slow'
                }
            
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
                    
                    if 'fast_col' in indicator_values and 'slow_col' in indicator_values:
                        row_data['Indicator_Fast'] = float(row[indicator_values['fast_col']]) if pd.notna(row[indicator_values['fast_col']]) else None
                        row_data['Indicator_Slow'] = float(row[indicator_values['slow_col']]) if pd.notna(row[indicator_values['slow_col']]) else None
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
            risk_free_rate = float(data.get('risk_free_rate', 0))
            
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
            
            if indicator_type == 'ema':
                max_ema_short = int(max_ema_short or 20)
                max_ema_long = int(max_ema_long or 50)
                
                logger.info(f"Running {sample_type} optimization for {symbol}, interval: {interval}")
                logger.info(f"Years: {years}")
                logger.info(f"EMA range: Short 3-{max_ema_short}, Long 10-{max_ema_long}")
                
                ema_short_range = range(3, min(max_ema_short + 1, max_ema_long))
                ema_long_range = range(10, max_ema_long + 1)
                
                for ema_short in ema_short_range:
                    for ema_long in ema_long_range:
                        if ema_short >= ema_long:
                            continue
                        
                        combinations_tested += 1
                        result = run_optimization_backtest(sample_data, ema_short, ema_long, position_type=position_type, risk_free_rate=risk_free_rate)
                        if result:
                            results.append(result)
            
            else:  # RSI, CCI, or Z-Score
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
                else:
                    return jsonify({'error': f'Unsupported indicator type: {indicator_type}'}), 400
                
                logger.info(f"Running {sample_type} optimization for {symbol}, indicator: {indicator_type}, interval: {interval}")
                logger.info(f"Years: {years}")
                logger.info(f"Fixed Length: {indicator_length}, Bottom: {min_indicator_bottom} to {max_indicator_bottom}, Top: {min_indicator_top} to {max_indicator_top}")
                
                for indicator_bottom in bottom_range:
                    for indicator_top in top_range:
                        combinations_tested += 1
                        result = run_indicator_optimization_backtest(
                            sample_data, indicator_type, indicator_length, indicator_top, indicator_bottom,
                            position_type=position_type, risk_free_rate=risk_free_rate
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
            risk_free_rate = float(data.get('risk_free_rate', 0))
            
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
            
            result = run_optimization_backtest(sample_data, ema_short, ema_long, position_type=position_type, risk_free_rate=risk_free_rate)
            
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
            risk_free_rate = float(data.get('risk_free_rate', 0))
            
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
                    df, ema_short, ema_long, initial_capital, in_sample_years, out_sample_years, position_type, risk_free_rate
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
                    df, indicator_type, indicator_length, indicator_top, indicator_bottom,
                    initial_capital, in_sample_years, out_sample_years, position_type, risk_free_rate
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

