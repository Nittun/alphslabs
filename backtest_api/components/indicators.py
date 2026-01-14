"""
Technical indicator calculations with caching
"""
import pandas as pd
import numpy as np
import hashlib
import logging

logger = logging.getLogger(__name__)

# Cache for indicator calculations
_indicator_cache = {}

def _generate_indicator_cache_key(data_hash, indicator_type, params):
    """Generate cache key for indicator calculation"""
    param_str = "_".join(f"{k}:{v}" for k, v in sorted(params.items())) if params else "default"
    key_str = f"{data_hash}_{indicator_type}_{param_str}"
    return hashlib.md5(key_str.encode()).hexdigest()

def _get_data_hash(data):
    """Generate a hash for the data to use as cache key"""
    # Use first/last date and length to create a unique identifier
    if len(data) == 0:
        return "empty"
    try:
        first_date = str(data['Date'].iloc[0])
        last_date = str(data['Date'].iloc[-1])
        length = len(data)
        first_close = float(data['Close'].iloc[0])
        last_close = float(data['Close'].iloc[-1])
        hash_str = f"{first_date}_{last_date}_{length}_{first_close}_{last_close}"
        return hashlib.md5(hash_str.encode()).hexdigest()
    except Exception:
        return hashlib.md5(str(data.shape).encode()).hexdigest()

def calculate_ma(data, period, use_cache=True):
    """Calculate Simple Moving Average (MA) with optional caching"""
    if use_cache:
        data_hash = _get_data_hash(data)
        cache_key = _generate_indicator_cache_key(data_hash, 'ma', {'period': period})
        
        if cache_key in _indicator_cache:
            logger.debug(f"Using cached MA({period})")
            # Return a copy to avoid mutations
            cached_result = _indicator_cache[cache_key]
            return cached_result.copy()
        
        result = data['Close'].rolling(window=period).mean()
        _indicator_cache[cache_key] = result.copy()
        logger.debug(f"Cached MA({period})")
        return result
    else:
        return data['Close'].rolling(window=period).mean()

def calculate_ema(data, period, use_cache=True):
    """Calculate Exponential Moving Average with optional caching"""
    if use_cache:
        data_hash = _get_data_hash(data)
        cache_key = _generate_indicator_cache_key(data_hash, 'ema', {'period': period})
        
        if cache_key in _indicator_cache:
            logger.debug(f"Using cached EMA({period})")
            cached_result = _indicator_cache[cache_key]
            return cached_result.copy()
        
        result = data['Close'].ewm(span=period, adjust=False).mean()
        _indicator_cache[cache_key] = result.copy()
        logger.debug(f"Cached EMA({period})")
        return result
    else:
        return data['Close'].ewm(span=period, adjust=False).mean()

def calculate_rsi(data, period=14, use_cache=True):
    """Calculate Relative Strength Index (RSI) with optional caching"""
    if use_cache:
        data_hash = _get_data_hash(data)
        cache_key = _generate_indicator_cache_key(data_hash, 'rsi', {'period': period})
        
        if cache_key in _indicator_cache:
            logger.debug(f"Using cached RSI({period})")
            cached_result = _indicator_cache[cache_key]
            return cached_result.copy()
        
        delta = data['Close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
        rs = gain / loss
        result = 100 - (100 / (1 + rs))
        _indicator_cache[cache_key] = result.copy()
        logger.debug(f"Cached RSI({period})")
        return result
    else:
        delta = data['Close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
        rs = gain / loss
        return 100 - (100 / (1 + rs))

def calculate_cci(data, period=20, use_cache=True):
    """Calculate Commodity Channel Index (CCI) with optional caching"""
    if use_cache:
        data_hash = _get_data_hash(data)
        cache_key = _generate_indicator_cache_key(data_hash, 'cci', {'period': period})
        
        if cache_key in _indicator_cache:
            logger.debug(f"Using cached CCI({period})")
            cached_result = _indicator_cache[cache_key]
            return cached_result.copy()
        
        # Typical Price
        tp = (data['High'] + data['Low'] + data['Close']) / 3
        # Simple Moving Average of Typical Price
        sma_tp = tp.rolling(window=period).mean()
        # Mean Deviation
        mean_deviation = tp.rolling(window=period).apply(
            lambda x: (x - x.mean()).abs().mean()
        )
        # CCI
        result = (tp - sma_tp) / (0.015 * mean_deviation)
        _indicator_cache[cache_key] = result.copy()
        logger.debug(f"Cached CCI({period})")
        return result
    else:
        tp = (data['High'] + data['Low'] + data['Close']) / 3
        sma_tp = tp.rolling(window=period).mean()
        mean_deviation = tp.rolling(window=period).apply(
            lambda x: (x - x.mean()).abs().mean()
        )
        return (tp - sma_tp) / (0.015 * mean_deviation)

def calculate_zscore(data, period=20, use_cache=True):
    """Calculate Z-Score (standardized price) with optional caching"""
    if use_cache:
        data_hash = _get_data_hash(data)
        cache_key = _generate_indicator_cache_key(data_hash, 'zscore', {'period': period})
        
        if cache_key in _indicator_cache:
            logger.debug(f"Using cached Z-Score({period})")
            cached_result = _indicator_cache[cache_key]
            return cached_result.copy()
        
        close = data['Close']
        mean = close.rolling(window=period).mean()
        std = close.rolling(window=period).std()
        result = (close - mean) / std
        _indicator_cache[cache_key] = result.copy()
        logger.debug(f"Cached Z-Score({period})")
        return result
    else:
        close = data['Close']
        mean = close.rolling(window=period).mean()
        std = close.rolling(window=period).std()
        return (close - mean) / std

def calculate_dema(data, period, use_cache=True):
    """Calculate Double Exponential Moving Average (DEMA) with optional caching"""
    if use_cache:
        data_hash = _get_data_hash(data)
        cache_key = _generate_indicator_cache_key(data_hash, 'dema', {'period': period})
        
        if cache_key in _indicator_cache:
            logger.debug(f"Using cached DEMA({period})")
            cached_result = _indicator_cache[cache_key]
            return cached_result.copy()
        
        ema1 = data['Close'].ewm(span=period, adjust=False).mean()
        ema2 = ema1.ewm(span=period, adjust=False).mean()
        result = 2 * ema1 - ema2
        _indicator_cache[cache_key] = result.copy()
        logger.debug(f"Cached DEMA({period})")
        return result
    else:
        ema1 = data['Close'].ewm(span=period, adjust=False).mean()
        ema2 = ema1.ewm(span=period, adjust=False).mean()
        return 2 * ema1 - ema2

def calculate_roll_std(data, period=20, use_cache=True):
    """Calculate Rolling Standard Deviation with optional caching"""
    if use_cache:
        data_hash = _get_data_hash(data)
        cache_key = _generate_indicator_cache_key(data_hash, 'roll_std', {'period': period})
        
        if cache_key in _indicator_cache:
            logger.debug(f"Using cached Roll_Std({period})")
            cached_result = _indicator_cache[cache_key]
            return cached_result.copy()
        
        result = data['Close'].rolling(window=period).std()
        _indicator_cache[cache_key] = result.copy()
        logger.debug(f"Cached Roll_Std({period})")
        return result
    else:
        return data['Close'].rolling(window=period).std()

def calculate_roll_median(data, period=20, use_cache=True):
    """Calculate Rolling Median with optional caching"""
    if use_cache:
        data_hash = _get_data_hash(data)
        cache_key = _generate_indicator_cache_key(data_hash, 'roll_median', {'period': period})
        
        if cache_key in _indicator_cache:
            logger.debug(f"Using cached Roll_Median({period})")
            cached_result = _indicator_cache[cache_key]
            return cached_result.copy()
        
        result = data['Close'].rolling(window=period).median()
        _indicator_cache[cache_key] = result.copy()
        logger.debug(f"Cached Roll_Median({period})")
        return result
    else:
        return data['Close'].rolling(window=period).median()

def calculate_roll_percentile(data, period=20, percentile=50, use_cache=True):
    """Calculate Rolling Percentile with optional caching"""
    if use_cache:
        data_hash = _get_data_hash(data)
        cache_key = _generate_indicator_cache_key(data_hash, 'roll_percentile', {'period': period, 'percentile': percentile})
        
        if cache_key in _indicator_cache:
            logger.debug(f"Using cached Roll_Percentile({period}, {percentile})")
            cached_result = _indicator_cache[cache_key]
            return cached_result.copy()
        
        # Calculate where current price sits in the percentile of the rolling window
        result = data['Close'].rolling(window=period).apply(
            lambda x: (x.iloc[-1] - x.min()) / (x.max() - x.min()) * 100 if x.max() != x.min() else 50
        )
        _indicator_cache[cache_key] = result.copy()
        logger.debug(f"Cached Roll_Percentile({period}, {percentile})")
        return result
    else:
        return data['Close'].rolling(window=period).apply(
            lambda x: (x.iloc[-1] - x.min()) / (x.max() - x.min()) * 100 if x.max() != x.min() else 50
        )

def clear_indicator_cache():
    """Clear the indicator cache (useful for memory management)"""
    _indicator_cache.clear()
    logger.info("Indicator cache cleared")

