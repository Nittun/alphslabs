#!/usr/bin/env python3
"""
Backtest API Server - Clean EMA Crossover Strategy
EMA12/EMA26 Crossover with Support/Resistance Stop Loss
"""

from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import warnings
import threading
import time
import requests
import io
import csv
import logging

warnings.filterwarnings('ignore')

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global stores
open_positions_store = {}
position_lock = threading.Lock()
latest_backtest_store = {}
backtest_lock = threading.Lock()

# Available assets
# Available assets that work with Yahoo Finance
# Format: 'display_symbol': {'symbol': 'internal', 'yf_symbol': 'yahoo_finance_symbol', 'name': 'Full Name', 'type': 'crypto/stock/forex'}
AVAILABLE_ASSETS = {
    # Cryptocurrencies (using Yahoo Finance crypto symbols)
    'BTC/USDT': {'symbol': 'BTCUSDT', 'yf_symbol': 'BTC-USD', 'name': 'Bitcoin', 'type': 'crypto'},
    'ETH/USDT': {'symbol': 'ETHUSDT', 'yf_symbol': 'ETH-USD', 'name': 'Ethereum', 'type': 'crypto'},
    'BNB/USDT': {'symbol': 'BNBUSDT', 'yf_symbol': 'BNB-USD', 'name': 'BNB', 'type': 'crypto'},
    'XRP/USDT': {'symbol': 'XRPUSDT', 'yf_symbol': 'XRP-USD', 'name': 'XRP', 'type': 'crypto'},
    'SOL/USDT': {'symbol': 'SOLUSDT', 'yf_symbol': 'SOL-USD', 'name': 'Solana', 'type': 'crypto'},
    'ADA/USDT': {'symbol': 'ADAUSDT', 'yf_symbol': 'ADA-USD', 'name': 'Cardano', 'type': 'crypto'},
    'DOGE/USDT': {'symbol': 'DOGEUSDT', 'yf_symbol': 'DOGE-USD', 'name': 'Dogecoin', 'type': 'crypto'},
    'AVAX/USDT': {'symbol': 'AVAXUSDT', 'yf_symbol': 'AVAX-USD', 'name': 'Avalanche', 'type': 'crypto'},
    'DOT/USDT': {'symbol': 'DOTUSDT', 'yf_symbol': 'DOT-USD', 'name': 'Polkadot', 'type': 'crypto'},
    'LINK/USDT': {'symbol': 'LINKUSDT', 'yf_symbol': 'LINK-USD', 'name': 'Chainlink', 'type': 'crypto'},
    'MATIC/USDT': {'symbol': 'MATICUSDT', 'yf_symbol': 'MATIC-USD', 'name': 'Polygon', 'type': 'crypto'},
    'UNI/USDT': {'symbol': 'UNIUSDT', 'yf_symbol': 'UNI-USD', 'name': 'Uniswap', 'type': 'crypto'},
    'ATOM/USDT': {'symbol': 'ATOMUSDT', 'yf_symbol': 'ATOM-USD', 'name': 'Cosmos', 'type': 'crypto'},
    'LTC/USDT': {'symbol': 'LTCUSDT', 'yf_symbol': 'LTC-USD', 'name': 'Litecoin', 'type': 'crypto'},
    'TRX/USDT': {'symbol': 'TRXUSDT', 'yf_symbol': 'TRX-USD', 'name': 'TRON', 'type': 'crypto'},
    'TOTAL/USDT': {'symbol': 'TOTALUSDT', 'yf_symbol': 'TOTAL-USD', 'name': 'Total Crypto Market Cap', 'type': 'crypto'},
    # Stocks (US Market)
    'NVDA': {'symbol': 'NVDA', 'yf_symbol': 'NVDA', 'name': 'NVIDIA', 'type': 'stock'},
    'AAPL': {'symbol': 'AAPL', 'yf_symbol': 'AAPL', 'name': 'Apple', 'type': 'stock'},
    'MSFT': {'symbol': 'MSFT', 'yf_symbol': 'MSFT', 'name': 'Microsoft', 'type': 'stock'},
    'GOOGL': {'symbol': 'GOOGL', 'yf_symbol': 'GOOGL', 'name': 'Alphabet', 'type': 'stock'},
    'AMZN': {'symbol': 'AMZN', 'yf_symbol': 'AMZN', 'name': 'Amazon', 'type': 'stock'},
    'TSLA': {'symbol': 'TSLA', 'yf_symbol': 'TSLA', 'name': 'Tesla', 'type': 'stock'},
    'META': {'symbol': 'META', 'yf_symbol': 'META', 'name': 'Meta', 'type': 'stock'},
    'AMD': {'symbol': 'AMD', 'yf_symbol': 'AMD', 'name': 'AMD', 'type': 'stock'},
    'INTC': {'symbol': 'INTC', 'yf_symbol': 'INTC', 'name': 'Intel', 'type': 'stock'},
    'NFLX': {'symbol': 'NFLX', 'yf_symbol': 'NFLX', 'name': 'Netflix', 'type': 'stock'},
    'SPY': {'symbol': 'SPY', 'yf_symbol': 'SPY', 'name': 'S&P 500 ETF', 'type': 'stock'},
    'QQQ': {'symbol': 'QQQ', 'yf_symbol': 'QQQ', 'name': 'Nasdaq 100 ETF', 'type': 'stock'},
}

# ============================================================================
# CORE STRATEGY FUNCTIONS
# ============================================================================

def calculate_ema(data, period):
    """Calculate Exponential Moving Average"""
    return data['Close'].ewm(span=period, adjust=False).mean()

def calculate_support_resistance(data, current_idx, lookback=50):
    """
    Calculate support and resistance levels based on recent price action
    Returns: (support, resistance)
    """
    if current_idx < lookback:
        lookback = current_idx
    
    if lookback == 0:
        return None, None
    
    lookback_data = data.iloc[max(0, current_idx - lookback):current_idx + 1]
    
    if len(lookback_data) == 0:
        return None, None
    
    support = lookback_data['Low'].min()
    resistance = lookback_data['High'].max()
    
    return support, resistance

def check_entry_signal(data_row, prev_row, ema_fast_col='EMA12', ema_slow_col='EMA26'):
    """
    Check for EMA crossover signal with configurable EMA periods
    Returns: (has_signal, signal_type, entry_reason)
    - has_signal: bool
    - signal_type: 'Long' or 'Short' or None
    - entry_reason: str
    """
    if prev_row is None:
        return False, None, None
    
    # Get EMA values using dynamic column names
    ema_fast_current = float(data_row.get(ema_fast_col, 0)) if not pd.isna(data_row.get(ema_fast_col, np.nan)) else 0.0
    ema_slow_current = float(data_row.get(ema_slow_col, 0)) if not pd.isna(data_row.get(ema_slow_col, np.nan)) else 0.0
    ema_fast_prev = float(prev_row.get(ema_fast_col, 0)) if not pd.isna(prev_row.get(ema_fast_col, np.nan)) else 0.0
    ema_slow_prev = float(prev_row.get(ema_slow_col, 0)) if not pd.isna(prev_row.get(ema_slow_col, np.nan)) else 0.0
    
    # Extract period numbers from column names for display
    fast_period = ema_fast_col.replace('EMA', '')
    slow_period = ema_slow_col.replace('EMA', '')
    
    # Long signal: Fast EMA crosses above Slow EMA
    if ema_fast_prev <= ema_slow_prev and ema_fast_current > ema_slow_current:
        return True, 'Long', f'EMA{fast_period} crossed above EMA{slow_period} (Golden Cross) - EMA{fast_period}: {ema_fast_current:.2f}, EMA{slow_period}: {ema_slow_current:.2f}'
    
    # Short signal: Fast EMA crosses below Slow EMA
    elif ema_fast_prev >= ema_slow_prev and ema_fast_current < ema_slow_current:
        return True, 'Short', f'EMA{fast_period} crossed below EMA{slow_period} (Death Cross) - EMA{fast_period}: {ema_fast_current:.2f}, EMA{slow_period}: {ema_slow_current:.2f}'
    
    return False, None, None

def calculate_stop_loss(signal_type, entry_price, support, resistance):
    """
    Calculate stop loss based on support/resistance levels
    Returns: stop_loss_price
    """
    if signal_type == 'Long':
        # Use support level, or 5% below entry if no support
        if support is not None and support < entry_price:
            return support
        else:
            return entry_price * 0.95  # 5% below entry
    else:  # Short
        # Use resistance level, or 5% above entry if no resistance
        if resistance is not None and resistance > entry_price:
            return resistance
        else:
            return entry_price * 1.05  # 5% above entry

def check_exit_condition(position, current_price, current_high, current_low, current_row=None, prev_row=None, ema_fast_col='EMA12', ema_slow_col='EMA26'):
    """
    Check if position should exit based on:
    1. Stop loss hit
    2. Opposite EMA crossover (exit Long on Death Cross, exit Short on Golden Cross)
    Returns: (should_exit, exit_reason, exit_price, stop_loss_hit)
    """
    stop_loss = position.get('stop_loss')
    position_type = position.get('position_type')
    
    # Check stop loss first
    if stop_loss is not None:
        if position_type == 'long':
            if current_low <= stop_loss:
                return True, f'Stop Loss Hit - Low ${current_low:.2f} touched stop loss ${stop_loss:.2f}', current_price, True
        else:  # short
            if current_high >= stop_loss:
                return True, f'Stop Loss Hit - High ${current_high:.2f} touched stop loss ${stop_loss:.2f}', current_price, True
    
    # Check for opposite EMA crossover exit
    if current_row is not None and prev_row is not None:
        ema_fast_current = float(current_row.get(ema_fast_col, 0)) if not pd.isna(current_row.get(ema_fast_col, np.nan)) else 0.0
        ema_slow_current = float(current_row.get(ema_slow_col, 0)) if not pd.isna(current_row.get(ema_slow_col, np.nan)) else 0.0
        ema_fast_prev = float(prev_row.get(ema_fast_col, 0)) if not pd.isna(prev_row.get(ema_fast_col, np.nan)) else 0.0
        ema_slow_prev = float(prev_row.get(ema_slow_col, 0)) if not pd.isna(prev_row.get(ema_slow_col, np.nan)) else 0.0
        
        # Extract period numbers for display
        fast_period = ema_fast_col.replace('EMA', '')
        slow_period = ema_slow_col.replace('EMA', '')
        
        if position_type == 'long':
            # Exit Long on Death Cross (Fast EMA crosses below Slow EMA)
            if ema_fast_prev >= ema_slow_prev and ema_fast_current < ema_slow_current:
                return True, f'EMA Death Cross - Exit Long (EMA{fast_period}: {ema_fast_current:.2f} < EMA{slow_period}: {ema_slow_current:.2f})', current_price, False
        else:  # short
            # Exit Short on Golden Cross (Fast EMA crosses above Slow EMA)
            if ema_fast_prev <= ema_slow_prev and ema_fast_current > ema_slow_current:
                return True, f'EMA Golden Cross - Exit Short (EMA{fast_period}: {ema_fast_current:.2f} > EMA{slow_period}: {ema_slow_current:.2f})', current_price, False
    
    return False, None, current_price, False

# ============================================================================
# DATA FETCHING
# ============================================================================

def fetch_total_marketcap_coingecko(interval, days_back=None, start_date=None, end_date=None):
    """Fetch total crypto market cap data from CoinGecko API"""
    try:
        # Calculate days needed
        if start_date and end_date:
            if isinstance(start_date, str):
                start_date = datetime.strptime(start_date, '%Y-%m-%d')
            if isinstance(end_date, str):
                end_date = datetime.strptime(end_date, '%Y-%m-%d')
            days = (end_date - start_date).days
        else:
            days = days_back or 730
        
        # Limit to max days CoinGecko allows (typically 365 for free tier)
        days = min(days, 365)
        
        # Map intervals to CoinGecko days (they only support daily for market cap)
        # We'll fetch daily and resample if needed
        url = f"https://api.coingecko.com/api/v3/global/market_cap_chart?days={days}"
        
        logger.info(f"Fetching total market cap from CoinGecko, days: {days}")
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        
        data_json = response.json()
        # CoinGecko returns data in format: {"market_cap": [[timestamp_ms, value], ...]}
        market_cap_list = data_json.get('market_cap', [])
        
        if not market_cap_list:
            logger.error("No market cap data returned from CoinGecko")
            return pd.DataFrame()
        
        # Convert to DataFrame
        timestamps = [datetime.fromtimestamp(ts[0] / 1000) for ts in market_cap_list]
        values = [ts[1] for ts in market_cap_list]
        
        # Convert from market cap to price-like values (normalize to start at 1)
        if not values:
            return pd.DataFrame()
        
        base_value = values[0]
        normalized_values = [v / base_value for v in values]
        
        df = pd.DataFrame({
            'Date': timestamps,
            'Close': normalized_values
        })
        
        # Create OHLC from close (since we only have market cap, use same value)
        df['Open'] = df['Close']
        df['High'] = df['Close']
        df['Low'] = df['Close']
        df['Volume'] = 0  # No volume data available
        
        # Resample for different intervals
        df = df.set_index('Date')
        
        if interval in ['1h', '2h', '4h']:
            # For hourly intervals, interpolate daily data
            if interval == '1h':
                resample_rule = '1H'
            elif interval == '2h':
                resample_rule = '2H'
            else:
                resample_rule = '4H'
            
            df = df.resample(resample_rule).interpolate(method='linear')
            df = df.dropna()
        elif interval in ['1w', '1wk', '1W']:
            df = df.resample('1W').agg({
                'Open': 'first',
                'High': 'max',
                'Low': 'min',
                'Close': 'last',
                'Volume': 'sum'
            })
        elif interval in ['1M', '1mo']:
            df = df.resample('1M').agg({
                'Open': 'first',
                'High': 'max',
                'Low': 'min',
                'Close': 'last',
                'Volume': 'sum'
            })
        
        df = df.reset_index()
        df = df.dropna(subset=['Close'])
        
        # Filter by date range if specified
        if start_date and end_date:
            df = df[(df['Date'] >= start_date) & (df['Date'] <= end_date)]
        
        logger.info(f"Fetched {len(df)} rows of total market cap data from CoinGecko")
        return df
        
    except Exception as e:
        logger.error(f"Error fetching total market cap from CoinGecko: {e}")
        return pd.DataFrame()

def fetch_historical_data(symbol, yf_symbol, interval, days_back=None, max_retries=3, start_date=None, end_date=None):
    """Fetch historical data with proper interval handling and retry logic
    
    Can use either:
    - start_date and end_date (preferred)
    - days_back (legacy, calculates from today)
    
    Special handling for TOTAL-USD (uses CoinGecko API)
    """
    
    # Special case: TOTAL market cap uses CoinGecko
    if yf_symbol == 'TOTAL-USD':
        return fetch_total_marketcap_coingecko(interval, days_back, start_date, end_date)
    
    interval_map = {
        '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
        '1h': '60m', '2h': '60m', '4h': '60m',  # Use 60m for hourly intervals and resample
        '1d': '1d', '1w': '1wk', '1wk': '1wk', '1W': '1wk', '1M': '1mo', '1mo': '1mo'
    }
    
    yf_interval = interval_map.get(interval, '1d')
    
    # Handle date range - prefer explicit dates over days_back
    if start_date and end_date:
        # Use explicit date range
        if isinstance(start_date, str):
            start_date = datetime.strptime(start_date, '%Y-%m-%d')
        if isinstance(end_date, str):
            end_date = datetime.strptime(end_date, '%Y-%m-%d')
        
        # Add 1 day to end_date because yfinance end date is exclusive
        end_date = end_date + timedelta(days=1)
        
        use_date_range = True
        period = None
        logger.info(f"Fetching {yf_symbol} data, interval: {interval}, date range: {start_date.date()} to {end_date.date()}")
    else:
        # Legacy: use days_back
        use_date_range = False
        if days_back is None:
            days_back = 730
        
        # Limit period based on days_back
        if days_back <= 30:
            period = '1mo'
        elif days_back <= 60:
            period = '60d'
        elif days_back <= 90:
            period = '3mo'
        elif days_back <= 365:
            period = '1y'
        elif days_back <= 730:
            period = '2y'
        else:
            period = 'max'
        
        logger.info(f"Fetching {yf_symbol} data, interval: {interval}, period: {period}")
    
    for attempt in range(max_retries):
        try:
            ticker = yf.Ticker(yf_symbol)
            
            if use_date_range:
                # For hourly intervals, yfinance has ~730 day limit
                # Adjust start_date if needed
                if yf_interval == '60m' or interval in ['1h', '2h', '4h']:
                    max_days_back = 729  # yfinance limit for hourly data
                    min_start = datetime.now() - timedelta(days=max_days_back)
                    if start_date < min_start:
                        logger.warning(f"Hourly data limited to {max_days_back} days. Adjusting start date from {start_date.date()} to {min_start.date()}")
                        start_date = min_start
                
                # Use explicit date range
                logger.info(f"Calling yfinance with start={start_date}, end={end_date}, interval={yf_interval}")
                data = ticker.history(start=start_date, end=end_date, interval=yf_interval)
                logger.info(f"Got {len(data)} rows from yfinance")
            else:
                # Try with period first
                data = ticker.history(period=period, interval=yf_interval)
                
                # If empty, try with explicit date range calculated from days_back
                if data.empty:
                    logger.warning(f"Empty data with period, trying date range (attempt {attempt + 1})")
                    calc_end_date = datetime.now()
                    calc_start_date = calc_end_date - timedelta(days=days_back)
                    data = ticker.history(start=calc_start_date, end=calc_end_date, interval=yf_interval)
            
            if data.empty:
                logger.warning(f"Still empty on attempt {attempt + 1}, retrying...")
                time.sleep(2 * (attempt + 1))  # Exponential backoff
                continue
            
            # Reset index and rename
            data = data.reset_index()
            if 'Date' not in data.columns and 'Datetime' in data.columns:
                data['Date'] = data['Datetime']
            
            # Resample for custom intervals if needed
            if interval in ['1h', '2h', '4h']:
                if interval == '1h':
                    resample_rule = '1H'
                elif interval == '2h':
                    resample_rule = '2H'
                else:
                    resample_rule = '4H'
                logger.info(f"Resampling to {interval}")
                data = data.set_index('Date').resample(resample_rule).agg({
                    'Open': 'first', 'High': 'max', 'Low': 'min', 'Close': 'last', 'Volume': 'sum'
                }).dropna().reset_index()
            
            # Clean and return
            data = data[['Date', 'Open', 'High', 'Low', 'Close', 'Volume']].copy()
            data = data.dropna(subset=['Close'])
            
            logger.info(f"Fetched {len(data)} rows for {yf_symbol}, interval: {interval}")
            return data
            
        except Exception as e:
            logger.error(f"Error fetching data (attempt {attempt + 1}): {e}")
            if attempt < max_retries - 1:
                time.sleep(2 * (attempt + 1))
            continue
    
    logger.error(f"Failed to fetch data for {yf_symbol} after {max_retries} attempts")
    return pd.DataFrame()

# ============================================================================
# BACKTEST ENGINE
# ============================================================================

def run_backtest(data, initial_capital=10000, enable_short=True, interval='1d', strategy_mode='reversal', ema_fast=12, ema_slow=26):
    """
    Clean backtest engine with multiple strategy modes and configurable EMA periods:
    - 'reversal': Always in market - exit and immediately enter opposite on crossover
    - 'wait_for_next': Exit on crossover, wait for NEXT crossover to re-enter (flat periods)
    - 'long_only': Only Long trades - enter on Golden Cross, exit on Death Cross
    - 'short_only': Only Short trades - enter on Death Cross, exit on Golden Cross
    
    EMA Parameters:
    - ema_fast: Fast EMA period (default 12)
    - ema_slow: Slow EMA period (default 26)
    """
    if len(data) == 0:
        logger.warning('Empty data provided to backtest')
        return [], {}, None
    
    # Ensure ema_fast < ema_slow
    if ema_fast >= ema_slow:
        ema_fast, ema_slow = ema_slow, ema_fast
    
    logger.info(f'Starting backtest: {len(data)} candles, capital: ${initial_capital:,.2f}, interval: {interval}, mode: {strategy_mode}, EMA({ema_fast}/{ema_slow})')
    
    # Calculate EMAs with configurable periods
    ema_fast_col = f'EMA{ema_fast}'
    ema_slow_col = f'EMA{ema_slow}'
    data[ema_fast_col] = calculate_ema(data, ema_fast)
    data[ema_slow_col] = calculate_ema(data, ema_slow)
    
    trades = []
    capital = initial_capital
    position = None
    just_exited_on_crossover = False  # Track if we just exited on a crossover (for wait_for_next mode)
    
    # Process each candle one by one
    for i in range(1, len(data)):
        current_row = data.iloc[i]
        prev_row = data.iloc[i-1]
        
        current_date = current_row['Date']
        current_price = current_row['Close']
        current_high = current_row['High']
        current_low = current_row['Low']
        
        # Get current crossover signal (used for exit and entry decisions)
        has_crossover, crossover_type, crossover_reason = check_entry_signal(current_row, prev_row, ema_fast_col, ema_slow_col)
        
        # Check exit conditions first (if position exists)
        if position is not None:
            should_exit, exit_reason, exit_price, stop_loss_hit = check_exit_condition(
                position, current_price, current_high, current_low, current_row, prev_row, ema_fast_col, ema_slow_col
            )
            
            if should_exit:
                # Close position
                if position['position_type'] == 'long':
                    exit_value = position['shares'] * exit_price
                    pnl = exit_value - capital
                    pnl_pct = (pnl / capital) * 100
                else:  # short
                    entry_value = position['shares'] * position['entry_price']
                    exit_value = position['shares'] * exit_price
                    pnl = entry_value - exit_value
                    pnl_pct = (pnl / capital) * 100
                
                trade = {
                    'Entry_Date': position['entry_date'].strftime('%Y-%m-%d %H:%M:%S'),
                    'Exit_Date': current_date.strftime('%Y-%m-%d %H:%M:%S'),
                    'Position_Type': position['position_type'].capitalize(),
                    'Entry_Price': float(position['entry_price']),
                    'Exit_Price': float(exit_price),
                    'Stop_Loss': float(position['stop_loss']),
                    'Stop_Loss_Hit': stop_loss_hit,
                    'Shares': float(position['shares']),
                    'Entry_Value': float(capital),
                    'Exit_Value': float(exit_value),
                    'PnL': float(pnl),
                    'PnL_Pct': float(pnl_pct),
                    'Holding_Days': (current_date - position['entry_date']).days,
                    'Entry_Reason': position.get('entry_reason', 'N/A'),
                    'Exit_Reason': exit_reason or 'N/A',
                    'Interval': interval,
                    'EMA_Fast_Period': ema_fast,
                    'EMA_Slow_Period': ema_slow,
                    'Entry_EMA_Fast': float(position.get('entry_ema_fast', 0)),
                    'Entry_EMA_Slow': float(position.get('entry_ema_slow', 0)),
                    'Exit_EMA_Fast': float(current_row.get(ema_fast_col, 0)) if not pd.isna(current_row.get(ema_fast_col, np.nan)) else 0.0,
                    'Exit_EMA_Slow': float(current_row.get(ema_slow_col, 0)) if not pd.isna(current_row.get(ema_slow_col, np.nan)) else 0.0,
                    'Strategy_Mode': strategy_mode,
                }
                trades.append(trade)
                
                if position['position_type'] == 'long':
                    capital = exit_value
                else:
                    capital = capital + pnl
                
                # Track if exit was due to crossover (not stop loss)
                just_exited_on_crossover = not stop_loss_hit and has_crossover
                
                position = None
                logger.info(f"Exit: {exit_reason} at ${exit_price:.2f}, P&L: ${pnl:.2f} ({pnl_pct:.2f}%)")
        
        # Check entry signal (only if no position)
        if position is None and has_crossover and crossover_type:
            # Determine if we should enter based on strategy mode
            should_enter = False
            entry_decision_reason = ''
            
            if strategy_mode == 'reversal':
                # Always enter on crossover (immediately flip)
                should_enter = True
                entry_decision_reason = 'reversal mode - always enter on crossover'
                
            elif strategy_mode == 'wait_for_next':
                # Only enter if we didn't just exit on this same crossover
                # (i.e., wait for the NEXT crossover after exiting)
                if not just_exited_on_crossover:
                    should_enter = True
                    entry_decision_reason = 'wait_for_next mode - this is a fresh crossover'
                else:
                    entry_decision_reason = 'wait_for_next mode - skipping (just exited on this crossover)'
                    
            elif strategy_mode == 'long_only':
                # Only enter Long positions (Golden Cross)
                if crossover_type == 'Long':
                    should_enter = True
                    entry_decision_reason = 'long_only mode - Golden Cross detected'
                else:
                    entry_decision_reason = 'long_only mode - skipping Short signal'
                    
            elif strategy_mode == 'short_only':
                # Only enter Short positions (Death Cross)
                if crossover_type == 'Short':
                    should_enter = True
                    entry_decision_reason = 'short_only mode - Death Cross detected'
                else:
                    entry_decision_reason = 'short_only mode - skipping Long signal'
            
            # Filter by enable_short setting
            if should_enter and crossover_type == 'Short' and not enable_short:
                should_enter = False
                entry_decision_reason = 'Short disabled in settings'
            
            if not should_enter and entry_decision_reason:
                logger.debug(f"Skipping entry: {entry_decision_reason}")
            
            if should_enter:
                # Calculate support/resistance for stop loss
                support, resistance = calculate_support_resistance(data, i, lookback=50)
                
                # Calculate stop loss
                stop_loss = calculate_stop_loss(crossover_type, current_price, support, resistance)
                
                # Create position
                shares = capital / current_price
                
                position = {
                    'entry_date': current_date,
                    'entry_price': current_price,
                    'shares': shares,
                    'position_type': crossover_type.lower(),
                    'stop_loss': stop_loss,
                    'entry_reason': crossover_reason,
                    'entry_ema_fast': float(current_row.get(ema_fast_col, 0)) if not pd.isna(current_row.get(ema_fast_col, np.nan)) else 0.0,
                    'entry_ema_slow': float(current_row.get(ema_slow_col, 0)) if not pd.isna(current_row.get(ema_slow_col, np.nan)) else 0.0,
                    'entry_interval': interval,
                }
                
                logger.info(f"Entry: {crossover_type} at ${current_price:.2f}, Stop Loss: ${stop_loss:.2f}, Reason: {crossover_reason}")
        
        # Reset the just_exited flag for next candle
        if not has_crossover:
            just_exited_on_crossover = False
    
    # Handle open position at end
    open_position = None
    if position is not None:
        final_price = data.iloc[-1]['Close']
        final_date = data.iloc[-1]['Date']
        
        if position['position_type'] == 'long':
            exit_value = position['shares'] * final_price
            unrealized_pnl = exit_value - capital
            unrealized_pnl_pct = (unrealized_pnl / capital) * 100 if capital > 0 else 0
        else:
            entry_value = position['shares'] * position['entry_price']
            exit_value = position['shares'] * final_price
            unrealized_pnl = entry_value - exit_value
            unrealized_pnl_pct = (unrealized_pnl / capital) * 100 if capital > 0 else 0
        
        open_position = {
            'Entry_Date': position['entry_date'].strftime('%Y-%m-%d %H:%M:%S'),
            'Exit_Date': None,
            'Position_Type': position['position_type'].capitalize(),
            'Entry_Price': float(position['entry_price']),
            'Current_Price': float(final_price),
            'Stop_Loss': float(position['stop_loss']),
            'Shares': float(position['shares']),
            'Unrealized_PnL': float(unrealized_pnl),
            'Unrealized_PnL_Pct': float(unrealized_pnl_pct),
            'Entry_Reason': position.get('entry_reason', 'N/A'),
            'Interval': interval,
            'EMA_Fast_Period': ema_fast,
            'EMA_Slow_Period': ema_slow,
            'Entry_EMA_Fast': float(position.get('entry_ema_fast', 0)),
            'Entry_EMA_Slow': float(position.get('entry_ema_slow', 0)),
        }
    
    # Calculate performance metrics
    if trades:
        total_trades = len(trades)
        winning_trades = len([t for t in trades if t['PnL'] > 0])
        losing_trades = len([t for t in trades if t['PnL'] < 0])
        total_pnl = sum(t['PnL'] for t in trades)
        total_return_pct = ((capital - initial_capital) / initial_capital) * 100
        
        performance = {
            'Initial_Capital': float(initial_capital),
            'Final_Capital': float(capital),
            'Total_Return': float(total_pnl),
            'Total_Return_Pct': float(total_return_pct),
            'Total_Trades': total_trades,
            'Winning_Trades': winning_trades,
            'Losing_Trades': losing_trades,
            'Win_Rate': (winning_trades / total_trades * 100) if total_trades > 0 else 0,
        }
    else:
        performance = {
            'Initial_Capital': float(initial_capital),
            'Final_Capital': float(capital),
            'Total_Return': 0.0,
            'Total_Return_Pct': 0.0,
            'Total_Trades': 0,
            'Winning_Trades': 0,
            'Losing_Trades': 0,
            'Win_Rate': 0.0,
        }
    
    logger.info(f'Backtest complete: {len(trades)} trades, Return: {performance["Total_Return_Pct"]:.2f}%, Strategy: {strategy_mode}, EMA({ema_fast}/{ema_slow})')
    if open_position:
        logger.info(f'Open position at end: {open_position["Position_Type"]} @ ${open_position["Entry_Price"]:.2f}, Unrealized P&L: {open_position["Unrealized_PnL_Pct"]:.2f}%')
    else:
        logger.info(f'No open position at end of backtest')
    
    return trades, performance, open_position

# ============================================================================
# CURRENT POSITION ENGINE (Real-time)
# ============================================================================

def analyze_current_market(asset, interval, days_back=365, enable_short=True, initial_capital=10000):
    """
    Analyze current market - fetch real-time data and check for signals
    Only enters on closed candles
    """
    if asset not in AVAILABLE_ASSETS:
        return None, None, None
    
    asset_info = AVAILABLE_ASSETS[asset]
    
    # Fetch recent data
    df = fetch_historical_data(
        asset_info['symbol'],
        asset_info['yf_symbol'],
        interval,
        days_back
    )
    
    if df.empty or len(df) < 2:
        return None, None, None
    
    # Calculate EMAs
    df['EMA12'] = calculate_ema(df, 12)
    df['EMA26'] = calculate_ema(df, 26)
    
    # Get latest CLOSED candle (second-to-last, as last might be forming)
    latest_closed_idx = len(df) - 2 if len(df) >= 2 else len(df) - 1
    latest_closed = df.iloc[latest_closed_idx]
    prev_closed = df.iloc[latest_closed_idx - 1] if latest_closed_idx > 0 else None
    
    # Check for entry signal on CLOSED candle
    has_signal, signal_type, entry_reason = check_entry_signal(latest_closed, prev_closed)
    
    # Filter by enable_short
    if has_signal and signal_type == 'Short' and not enable_short:
        has_signal = False
    
    # Check if position already exists
    current_position = None
    with position_lock:
        positions = list(open_positions_store.values())
        if positions:
            current_position = positions[-1]  # Get most recent
    
    entry_signal = None
    if has_signal and signal_type and current_position is None:
        # Calculate support/resistance
        support, resistance = calculate_support_resistance(df, latest_closed_idx, lookback=50)
        
        # Calculate stop loss
        entry_price = float(latest_closed['Close'])
        stop_loss = calculate_stop_loss(signal_type, entry_price, support, resistance)
        
        entry_signal = {
            'signal_type': signal_type,
            'entry_price': entry_price,
            'stop_loss': stop_loss,
            'entry_reason': entry_reason,
            'ema12': float(latest_closed.get('EMA12', 0)) if not pd.isna(latest_closed.get('EMA12', np.nan)) else 0.0,
            'ema26': float(latest_closed.get('EMA26', 0)) if not pd.isna(latest_closed.get('EMA26', np.nan)) else 0.0,
            'interval': interval,
            'date': latest_closed['Date'].strftime('%Y-%m-%d %H:%M:%S'),
        }
    
    # Get current price (latest data)
    current_price = float(df.iloc[-1]['Close'])
    current_high = float(df.iloc[-1]['High'])
    current_low = float(df.iloc[-1]['Low'])
    
    return entry_signal, current_position, {
        'current_price': current_price,
        'current_high': current_high,
        'current_low': current_low,
        'ema12': float(df.iloc[-1].get('EMA12', 0)) if not pd.isna(df.iloc[-1].get('EMA12', np.nan)) else 0.0,
        'ema26': float(df.iloc[-1].get('EMA26', 0)) if not pd.isna(df.iloc[-1].get('EMA26', np.nan)) else 0.0,
    }

# ============================================================================
# API ROUTES
# ============================================================================

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
        import yfinance as yf
        
        # Top 10 crypto symbols
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
                # Get current price and previous close
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
    """Search for available assets - only returns assets that are actually supported"""
    query = request.args.get('q', '').upper()
    
    # Build list from AVAILABLE_ASSETS (guaranteed to work)
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
    
    # If no query, return all assets
    if len(query) < 1:
        return jsonify({'success': True, 'results': all_assets})
    
    # Filter by query
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
        # Support both date range and legacy days_back
        start_date = data.get('start_date')  # Format: 'YYYY-MM-DD'
        end_date = data.get('end_date')      # Format: 'YYYY-MM-DD'
        days_back = data.get('days_back')    # Legacy: number of days back
        interval = data.get('interval', '4h')
        initial_capital = float(data.get('initial_capital', 10000))
        enable_short = data.get('enable_short', True)
        strategy_mode = data.get('strategy_mode', 'reversal')  # New: reversal, wait_for_next, long_only, short_only
        ema_fast = int(data.get('ema_fast', 12))  # Fast EMA period
        ema_slow = int(data.get('ema_slow', 26))  # Slow EMA period
        
        # Convert days_back to int if provided
        if days_back is not None:
            days_back = int(days_back)
        
        # Validate EMA periods - accept any reasonable value from 2 to 500
        if ema_fast < 2 or ema_fast > 500:
            ema_fast = 12
        if ema_slow < 2 or ema_slow > 500:
            ema_slow = 26
        
        # Ensure fast < slow
        if ema_fast >= ema_slow:
            ema_fast, ema_slow = min(ema_fast, ema_slow), max(ema_fast, ema_slow)
            if ema_fast == ema_slow:
                ema_slow = ema_fast + 14  # Default to +14 for slow
        
        logger.info(f'Received EMA settings from frontend: Fast={ema_fast}, Slow={ema_slow}')
        
        # Validate strategy_mode
        valid_modes = ['reversal', 'wait_for_next', 'long_only', 'short_only']
        if strategy_mode not in valid_modes:
            strategy_mode = 'reversal'
        
        if asset not in AVAILABLE_ASSETS:
            return jsonify({'error': f'Asset {asset} not available'}), 400
        
        asset_info = AVAILABLE_ASSETS[asset]
        
        # Fetch data - prefer date range over days_back
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
            # Legacy: use days_back
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
        
        # Run backtest with strategy mode and EMA settings
        trades, performance, open_position = run_backtest(
            df, initial_capital, enable_short, interval, strategy_mode, ema_fast, ema_slow
        )
        
        # Store latest backtest
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
        return jsonify({'success': False, 'message': 'No backtest found'}), 404

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
            return jsonify({'success': False, 'error': 'No data available'}), 400
        
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

# ============================================================================
# OPTIMIZATION ENGINE
# ============================================================================

def calculate_sharpe_ratio(returns, risk_free_rate=0):
    """Calculate annualized Sharpe Ratio"""
    if len(returns) == 0 or returns.std() == 0:
        return 0.0
    
    excess_returns = returns - (risk_free_rate / 365)  # Daily risk-free rate
    return float(np.sqrt(365) * excess_returns.mean() / returns.std())

def calculate_max_drawdown(equity_curve):
    """Calculate maximum drawdown"""
    if len(equity_curve) == 0:
        return 0.0
    
    peak = equity_curve.expanding(min_periods=1).max()
    drawdown = (equity_curve - peak) / peak
    return float(abs(drawdown.min()))

def run_optimization_backtest(data, ema_short, ema_long, initial_capital=10000, position_type='both', risk_free_rate=0):
    """
    Run a simple backtest for optimization - returns metrics only
    
    position_type: 'long_only', 'short_only', or 'both'
    risk_free_rate: annualized risk-free rate (e.g., 0.02 = 2%)
    """
    if len(data) < max(ema_short, ema_long) + 10:
        return None
    
    # Calculate EMAs
    data = data.copy()
    data['EMA_Short'] = data['Close'].ewm(span=ema_short, adjust=False).mean()
    data['EMA_Long'] = data['Close'].ewm(span=ema_long, adjust=False).mean()
    
    # Generate signals based on position type
    data['Signal'] = 0
    if position_type == 'long_only':
        # Only long positions: 1 when EMA_Short > EMA_Long, else 0
        data.loc[data['EMA_Short'] > data['EMA_Long'], 'Signal'] = 1
    elif position_type == 'short_only':
        # Only short positions: -1 when EMA_Short < EMA_Long, else 0
        data.loc[data['EMA_Short'] < data['EMA_Long'], 'Signal'] = -1
    else:  # 'both'
        # Both long and short positions
        data.loc[data['EMA_Short'] > data['EMA_Long'], 'Signal'] = 1
        data.loc[data['EMA_Short'] < data['EMA_Long'], 'Signal'] = -1
    
    # Calculate returns
    data['Returns'] = data['Close'].pct_change()
    data['Strategy_Returns'] = data['Signal'].shift(1) * data['Returns']
    
    # Remove NaN
    data = data.dropna()
    
    if len(data) == 0:
        return None
    
    # Calculate metrics
    strategy_returns = data['Strategy_Returns']
    
    # Equity curve
    equity = initial_capital * (1 + strategy_returns).cumprod()
    
    # Total return
    total_return = (equity.iloc[-1] / initial_capital) - 1 if len(equity) > 0 else 0
    
    # Sharpe ratio (pass risk_free_rate)
    sharpe = calculate_sharpe_ratio(strategy_returns, risk_free_rate)
    
    # Max drawdown
    max_dd = calculate_max_drawdown(equity)
    
    # Win rate
    winning = (strategy_returns > 0).sum()
    total = (strategy_returns != 0).sum()
    win_rate = winning / total if total > 0 else 0
    
    # Count trades (signal changes)
    trades = (data['Signal'].diff() != 0).sum()
    
    return {
        'ema_short': ema_short,
        'ema_long': ema_long,
        'sharpe_ratio': sharpe,
        'total_return': total_return,
        'max_drawdown': max_dd,
        'win_rate': win_rate,
        'total_trades': int(trades),
    }

@app.route('/api/optimize', methods=['POST', 'OPTIONS'])
def run_optimization():
    """Run parameter optimization for EMA crossover strategy"""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200
    
    try:
        data = request.get_json()
        symbol = data.get('symbol', 'BTC-USD')
        interval = data.get('interval', '1d')
        years = data.get('years', [2023, 2022])  # Array of years to test
        sample_type = data.get('sample_type', 'in_sample')  # 'in_sample' or 'out_sample'
        max_ema_short = int(data.get('max_ema_short', 20))
        max_ema_long = int(data.get('max_ema_long', 50))
        position_type = data.get('position_type', 'both')  # 'long_only', 'short_only', or 'both'
        risk_free_rate = float(data.get('risk_free_rate', 0))  # Annualized risk-free rate
        
        # Ensure years is a list
        if isinstance(years, (int, float)):
            years = [int(years)]
        
        # Sort years
        years = sorted(years)
        
        logger.info(f"Running {sample_type} optimization for {symbol}, interval: {interval}")
        logger.info(f"Years: {years}")
        logger.info(f"EMA range: Short 3-{max_ema_short}, Long 10-{max_ema_long}")
        
        if not years:
            return jsonify({'error': 'No years selected'}), 400
        
        # Calculate date range
        min_year = min(years)
        max_year = max(years)
        
        start_date = datetime(min_year, 1, 1)
        end_date = datetime(max_year, 12, 31)
        
        # Fetch data
        ticker = yf.Ticker(symbol)
        df = ticker.history(start=start_date, end=end_date, interval=interval)
        
        if df.empty or len(df) < 50:
            return jsonify({'error': 'Failed to fetch sufficient data'}), 400
        
        df = df.reset_index()
        if 'Date' not in df.columns and 'Datetime' in df.columns:
            df['Date'] = df['Datetime']
        
        # Convert Date column to datetime if needed
        df['Date'] = pd.to_datetime(df['Date'])
        df['Year'] = df['Date'].dt.year
        
        # Filter data for selected years only
        sample_data = df[df['Year'].isin(years)].copy()
        
        logger.info(f"Sample data: {len(sample_data)} rows for years {years}")
        
        if len(sample_data) < 50:
            return jsonify({'error': f'Insufficient data for selected years. Only {len(sample_data)} data points found.'}), 400
        
        # Run optimization for all EMA combinations
        results = []
        
        # Generate all EMA combinations
        ema_short_range = range(3, min(max_ema_short + 1, max_ema_long))
        ema_long_range = range(10, max_ema_long + 1)
        
        combinations_tested = 0
        
        for ema_short in ema_short_range:
            for ema_long in ema_long_range:
                if ema_short >= ema_long:
                    continue
                
                combinations_tested += 1
                
                # Run backtest
                result = run_optimization_backtest(sample_data, ema_short, ema_long, position_type=position_type, risk_free_rate=risk_free_rate)
                if result:
                    results.append(result)
        
        # Sort results by Sharpe ratio (descending) by default
        results.sort(key=lambda x: x['sharpe_ratio'], reverse=True)
        
        # Get date ranges for display
        sample_start = sample_data.iloc[0]['Date'].strftime('%Y-%m-%d') if len(sample_data) > 0 else 'N/A'
        sample_end = sample_data.iloc[-1]['Date'].strftime('%Y-%m-%d') if len(sample_data) > 0 else 'N/A'
        
        # Format years for display
        years_str = ', '.join(map(str, years))
        
        return jsonify({
            'success': True,
            'symbol': symbol,
            'interval': interval,
            'sample_type': sample_type,
            'results': results,  # All combinations
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
        position_type = data.get('position_type', 'both')  # 'long_only', 'short_only', or 'both'
        risk_free_rate = float(data.get('risk_free_rate', 0))  # Annualized risk-free rate
        
        # Ensure years is a list
        if isinstance(years, (int, float)):
            years = [int(years)]
        
        years = sorted(years)
        
        logger.info(f"Running single validation for {symbol}, EMA {ema_short}/{ema_long}, position: {position_type}, rf: {risk_free_rate}")
        logger.info(f"Years: {years}")
        
        if not years:
            return jsonify({'error': 'No years selected'}), 400
        
        if ema_short >= ema_long:
            return jsonify({'error': 'Short EMA must be less than Long EMA'}), 400
        
        # Calculate date range
        min_year = min(years)
        max_year = max(years)
        
        start_date = datetime(min_year, 1, 1)
        end_date = datetime(max_year, 12, 31)
        
        # Fetch data
        ticker = yf.Ticker(symbol)
        df = ticker.history(start=start_date, end=end_date, interval=interval)
        
        if df.empty or len(df) < 30:
            return jsonify({'error': 'Failed to fetch sufficient data'}), 400
        
        df = df.reset_index()
        if 'Date' not in df.columns and 'Datetime' in df.columns:
            df['Date'] = df['Datetime']
        
        df['Date'] = pd.to_datetime(df['Date'])
        df['Year'] = df['Date'].dt.year
        
        # Filter data for selected years
        sample_data = df[df['Year'].isin(years)].copy()
        
        if len(sample_data) < 30:
            return jsonify({'error': f'Insufficient data. Only {len(sample_data)} data points found.'}), 400
        
        # Run single backtest
        result = run_optimization_backtest(sample_data, ema_short, ema_long, position_type=position_type, risk_free_rate=risk_free_rate)
        
        if not result:
            return jsonify({'error': 'Failed to run backtest'}), 400
        
        # Get date ranges for display
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


def run_combined_equity_backtest(data, ema_short, ema_long, initial_capital, in_sample_years, out_sample_years, position_type='both', risk_free_rate=0):
    """
    Run a single continuous backtest and mark each point as in-sample or out-sample
    
    position_type: 'long_only', 'short_only', or 'both'
    risk_free_rate: annualized risk-free rate (e.g., 0.02 = 2%)
    """
    if len(data) < max(ema_short, ema_long) + 10:
        return None, None, []
    
    data = data.copy()
    data['EMA_Short'] = data['Close'].ewm(span=ema_short, adjust=False).mean()
    data['EMA_Long'] = data['Close'].ewm(span=ema_long, adjust=False).mean()
    
    # Generate signals based on position type
    data['Signal'] = 0
    if position_type == 'long_only':
        # Only long positions: 1 when EMA_Short > EMA_Long, else 0
        data.loc[data['EMA_Short'] > data['EMA_Long'], 'Signal'] = 1
    elif position_type == 'short_only':
        # Only short positions: -1 when EMA_Short < EMA_Long, else 0
        data.loc[data['EMA_Short'] < data['EMA_Long'], 'Signal'] = -1
    else:  # 'both'
        # Both long and short positions
        data.loc[data['EMA_Short'] > data['EMA_Long'], 'Signal'] = 1
        data.loc[data['EMA_Short'] < data['EMA_Long'], 'Signal'] = -1
    
    # Calculate returns
    data['Returns'] = data['Close'].pct_change()
    data['Strategy_Returns'] = data['Signal'].shift(1) * data['Returns']
    
    data = data.dropna()
    
    if len(data) == 0:
        return None, None, []
    
    # Mark each row as in_sample or out_sample
    data['Sample_Type'] = data['Year'].apply(
        lambda y: 'in_sample' if y in in_sample_years else ('out_sample' if y in out_sample_years else 'none')
    )
    
    # Calculate equity curve
    equity = initial_capital * (1 + data['Strategy_Returns']).cumprod()
    
    # Build equity curve data with sample type
    equity_curve = []
    prev_sample_type = None
    segment_id = 0
    
    for idx, row in data.iterrows():
        sample_type = row['Sample_Type']
        year = int(row['Year'])
        
        # Detect segment change
        if prev_sample_type is not None and sample_type != prev_sample_type:
            segment_id += 1
        prev_sample_type = sample_type
        
        equity_curve.append({
            'date': row['Date'].strftime('%Y-%m-%d'),
            'equity': float(equity.loc[idx]),
            'year': year,
            'sample_type': sample_type,
            'segment_id': segment_id,
        })
    
    # Calculate metrics for in-sample
    in_sample_mask = data['Sample_Type'] == 'in_sample'
    in_sample_returns = data.loc[in_sample_mask, 'Strategy_Returns']
    in_sample_equity = equity[in_sample_mask]
    
    in_sample_metrics = None
    if len(in_sample_returns) > 0:
        in_sample_total_return = (in_sample_equity.iloc[-1] / initial_capital) - 1 if len(in_sample_equity) > 0 else 0
        in_sample_metrics = {
            'sharpe_ratio': calculate_sharpe_ratio(in_sample_returns, risk_free_rate),
            'total_return': in_sample_total_return,
            'max_drawdown': calculate_max_drawdown(in_sample_equity) if len(in_sample_equity) > 0 else 0,
            'win_rate': (in_sample_returns > 0).sum() / max(1, (in_sample_returns != 0).sum()),
            'total_trades': int((data.loc[in_sample_mask, 'Signal'].diff() != 0).sum()),
            'final_equity': float(in_sample_equity.iloc[-1]) if len(in_sample_equity) > 0 else initial_capital,
        }
    
    # Calculate metrics for out-sample
    out_sample_mask = data['Sample_Type'] == 'out_sample'
    out_sample_returns = data.loc[out_sample_mask, 'Strategy_Returns']
    out_sample_equity = equity[out_sample_mask]
    
    out_sample_metrics = None
    if len(out_sample_returns) > 0:
        # For out-sample, calculate return from where in-sample ended
        out_sample_start_equity = in_sample_metrics['final_equity'] if in_sample_metrics else initial_capital
        out_sample_total_return = (out_sample_equity.iloc[-1] / out_sample_start_equity) - 1 if len(out_sample_equity) > 0 else 0
        out_sample_metrics = {
            'sharpe_ratio': calculate_sharpe_ratio(out_sample_returns, risk_free_rate),
            'total_return': out_sample_total_return,
            'max_drawdown': calculate_max_drawdown(out_sample_equity) if len(out_sample_equity) > 0 else 0,
            'win_rate': (out_sample_returns > 0).sum() / max(1, (out_sample_returns != 0).sum()),
            'total_trades': int((data.loc[out_sample_mask, 'Signal'].diff() != 0).sum()),
            'final_equity': float(out_sample_equity.iloc[-1]) if len(out_sample_equity) > 0 else out_sample_start_equity,
        }
    
    return in_sample_metrics, out_sample_metrics, equity_curve


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
        ema_short = int(data.get('ema_short', 12))
        ema_long = int(data.get('ema_long', 26))
        initial_capital = float(data.get('initial_capital', 10000))
        position_type = data.get('position_type', 'both')  # 'long_only', 'short_only', or 'both'
        risk_free_rate = float(data.get('risk_free_rate', 0))  # Annualized risk-free rate
        
        # Ensure years are lists
        if isinstance(in_sample_years, (int, float)):
            in_sample_years = [int(in_sample_years)]
        if isinstance(out_sample_years, (int, float)):
            out_sample_years = [int(out_sample_years)]
        
        in_sample_years = sorted(in_sample_years)
        out_sample_years = sorted(out_sample_years)
        
        logger.info(f"Running equity backtest for {symbol}, EMA {ema_short}/{ema_long}, position: {position_type}, rf: {risk_free_rate}")
        logger.info(f"In-sample years: {in_sample_years}, Out-sample years: {out_sample_years}")
        logger.info(f"Initial capital: ${initial_capital}")
        
        if ema_short >= ema_long:
            return jsonify({'error': 'Short EMA must be less than Long EMA'}), 400
        
        # Get all years needed
        all_years = sorted(set(in_sample_years + out_sample_years))
        if not all_years:
            return jsonify({'error': 'No years selected'}), 400
            
        min_year = min(all_years)
        max_year = max(all_years)
        
        start_date = datetime(min_year, 1, 1)
        end_date = datetime(max_year, 12, 31)
        
        # Fetch data
        ticker = yf.Ticker(symbol)
        df = ticker.history(start=start_date, end=end_date, interval=interval)
        
        if df.empty or len(df) < 50:
            return jsonify({'error': 'Failed to fetch sufficient data'}), 400
        
        df = df.reset_index()
        if 'Date' not in df.columns and 'Datetime' in df.columns:
            df['Date'] = df['Datetime']
        
        df['Date'] = pd.to_datetime(df['Date'])
        df['Year'] = df['Date'].dt.year
        
        # Filter to only include selected years
        df = df[df['Year'].isin(all_years)].copy()
        
        if len(df) < 50:
            return jsonify({'error': 'Insufficient data for selected years'}), 400
        
        # Run combined backtest
        in_sample_metrics, out_sample_metrics, equity_curve = run_combined_equity_backtest(
            df, ema_short, ema_long, initial_capital, in_sample_years, out_sample_years, position_type, risk_free_rate
        )
        
        # Get segment boundaries for the chart
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
        
        # Format periods
        in_sample_dates = df[df['Year'].isin(in_sample_years)]
        out_sample_dates = df[df['Year'].isin(out_sample_years)]
        
        in_sample_start = in_sample_dates.iloc[0]['Date'].strftime('%Y-%m-%d') if len(in_sample_dates) > 0 else 'N/A'
        in_sample_end = in_sample_dates.iloc[-1]['Date'].strftime('%Y-%m-%d') if len(in_sample_dates) > 0 else 'N/A'
        out_sample_start = out_sample_dates.iloc[0]['Date'].strftime('%Y-%m-%d') if len(out_sample_dates) > 0 else 'N/A'
        out_sample_end = out_sample_dates.iloc[-1]['Date'].strftime('%Y-%m-%d') if len(out_sample_dates) > 0 else 'N/A'
        
        return jsonify({
            'success': True,
            'symbol': symbol,
            'interval': interval,
            'ema_short': ema_short,
            'ema_long': ema_long,
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
        })
        
    except Exception as e:
        logger.error(f"Error running equity optimization: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


# ============================================================================
# BACKGROUND TASKS
# ============================================================================

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
                                # Position will be handled by frontend
        except Exception as e:
            logger.error(f"Error updating positions: {e}", exc_info=True)
            time.sleep(60)

# ============================================================================
# MAIN
# ============================================================================

import os

# Get port from environment (Railway sets this)
port = int(os.environ.get('PORT', 5001))
is_production = os.environ.get('RAILWAY_ENVIRONMENT') or os.environ.get('RENDER')

# Start background thread for position updates (works with both Flask dev server and gunicorn)
def start_background_thread():
    update_thread = threading.Thread(target=update_open_positions, daemon=True)
    update_thread.start()
    logger.info('Started background position update thread (updates every 60 seconds)')

# Start background thread when module loads (for gunicorn)
start_background_thread()

if __name__ == '__main__':
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
    
    # Use debug=False in production
    debug_mode = not is_production
    logger.info(f'Debug mode: {debug_mode}, Production: {is_production}')
    
    app.run(host='0.0.0.0', port=port, debug=debug_mode, threaded=True)
