"""
Data fetching module with caching to avoid redundant API calls
"""
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import time
import requests
import logging
from functools import lru_cache
import hashlib
import re

logger = logging.getLogger(__name__)

# Cache for ticker data - stores dataframes by cache key
# Cache TTL: 5 minutes (300 seconds) - adjust as needed
_data_cache = {}
_cache_timestamps = {}
CACHE_TTL = 300  # 5 minutes

def _generate_cache_key(symbol, yf_symbol, interval, days_back=None, start_date=None, end_date=None):
    """Generate a cache key for the data request"""
    key_parts = [str(symbol), str(yf_symbol), str(interval)]
    if start_date and end_date:
        key_parts.append(f"{start_date}_{end_date}")
    elif days_back:
        key_parts.append(f"days_{days_back}")
    else:
        key_parts.append("default")
    return hashlib.md5("_".join(key_parts).encode()).hexdigest()

def _get_cached_data(cache_key):
    """Get cached data if it exists and hasn't expired"""
    if cache_key in _data_cache:
        if cache_key in _cache_timestamps:
            age = time.time() - _cache_timestamps[cache_key]
            if age < CACHE_TTL:
                logger.debug(f"Cache hit for key: {cache_key[:8]}... (age: {age:.1f}s)")
                return _data_cache[cache_key].copy()  # Return a copy to avoid mutations
            else:
                logger.debug(f"Cache expired for key: {cache_key[:8]}... (age: {age:.1f}s)")
                del _data_cache[cache_key]
                del _cache_timestamps[cache_key]
    return None

def _set_cached_data(cache_key, data):
    """Store data in cache"""
    _data_cache[cache_key] = data.copy()
    _cache_timestamps[cache_key] = time.time()
    logger.debug(f"Cached data for key: {cache_key[:8]}...")
    
    # Cleanup old cache entries (keep last 100 entries)
    if len(_data_cache) > 100:
        # Remove oldest entries
        sorted_keys = sorted(_cache_timestamps.items(), key=lambda x: x[1])
        for old_key, _ in sorted_keys[:len(_data_cache) - 100]:
            del _data_cache[old_key]
            del _cache_timestamps[old_key]

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

def _parse_date(date_value):
    """Parse date inputs (YYYY-MM-DD or datetime) to naive datetime."""
    if date_value is None:
        return None
    if isinstance(date_value, datetime):
        return date_value
    if isinstance(date_value, str):
        # FE sends YYYY-MM-DD
        return datetime.strptime(date_value, '%Y-%m-%d')
    return None

def _looks_like_binance_crypto_symbol(symbol: str) -> bool:
    """
    Heuristic: our crypto assets use Binance-style symbols like BTCUSDT.
    Avoid matching stocks like BRK-B, commodities like GC=F, etc.
    """
    if not symbol or not isinstance(symbol, str):
        return False
    if '-' in symbol or '=' in symbol or '/' in symbol:
        return False
    return re.match(r'^[A-Z0-9]{3,20}USDT$', symbol) is not None

def _map_interval_to_binance(interval: str) -> str | None:
    """Map app intervals to Binance kline intervals."""
    interval_map = {
        '1m': '1m',
        '5m': '5m',
        '15m': '15m',
        '30m': '30m',
        '1h': '1h',
        '2h': '2h',
        '4h': '4h',
        '1d': '1d',
        '1w': '1w',
        '1wk': '1w',
        '1W': '1w',
        '1M': '1M',
        '1mo': '1M',
    }
    return interval_map.get(interval)

def _fetch_binance_klines(symbol: str, interval: str, days_back=None, start_date=None, end_date=None) -> pd.DataFrame:
    """
    Fetch OHLCV candles from Binance public API.
    Returns DataFrame with columns: Date, Open, High, Low, Close, Volume.
    """
    binance_interval = _map_interval_to_binance(interval)
    if not binance_interval:
        return pd.DataFrame()

    start_dt = _parse_date(start_date)
    end_dt = _parse_date(end_date)

    if start_dt and end_dt:
        # Make end inclusive by adding one day (match yfinance semantics used elsewhere)
        end_dt = end_dt + timedelta(days=1)
    else:
        if days_back is None:
            days_back = 730
        end_dt = datetime.utcnow()
        start_dt = end_dt - timedelta(days=int(days_back))

    start_ms = int(start_dt.timestamp() * 1000)
    end_ms = int(end_dt.timestamp() * 1000)

    # Public endpoints (binance.com is sometimes geo-blocked; vision mirror helps)
    base_urls = [
        "https://api.binance.com",
        "https://data-api.binance.vision",
    ]

    all_rows = []
    next_start_ms = start_ms
    safety_iters = 0

    while next_start_ms < end_ms and safety_iters < 50:
        safety_iters += 1
        params = {
            "symbol": symbol,
            "interval": binance_interval,
            "startTime": next_start_ms,
            "endTime": end_ms,
            "limit": 1000,
        }

        last_err = None
        klines = None
        for base in base_urls:
            try:
                resp = requests.get(
                    f"{base}/api/v3/klines",
                    params=params,
                    headers={"User-Agent": "alphalabs-backtest/1.0"},
                    timeout=30,
                )
                if resp.status_code in (418, 429):
                    # Rate limited / banned by Binance
                    last_err = f"Binance rate limited ({resp.status_code}): {resp.text[:200]}"
                    continue
                resp.raise_for_status()
                klines = resp.json()
                break
            except Exception as e:
                last_err = str(e)
                continue

        if klines is None:
            logger.warning(f"Binance klines fetch failed for {symbol} {interval}: {last_err}")
            break

        if not klines:
            break

        all_rows.extend(klines)

        last_open_time = klines[-1][0]
        # Prevent infinite loops if API returns same last candle
        if last_open_time < next_start_ms:
            break
        next_start_ms = int(last_open_time) + 1

        # If we received less than max, we're done
        if len(klines) < 1000:
            break

        # Be polite to API
        time.sleep(0.1)

    if not all_rows:
        return pd.DataFrame()

    # Columns: [
    #  0 open_time, 1 open, 2 high, 3 low, 4 close, 5 volume,
    #  6 close_time, 7 quote_asset_volume, 8 number_of_trades,
    #  9 taker_buy_base, 10 taker_buy_quote, 11 ignore
    # ]
    df = pd.DataFrame(all_rows, columns=[
        "open_time", "Open", "High", "Low", "Close", "Volume",
        "close_time", "quote_asset_volume", "number_of_trades",
        "taker_buy_base", "taker_buy_quote", "ignore"
    ])
    df["Date"] = pd.to_datetime(df["open_time"], unit="ms", utc=True).dt.tz_convert(None)
    df["Open"] = pd.to_numeric(df["Open"], errors="coerce")
    df["High"] = pd.to_numeric(df["High"], errors="coerce")
    df["Low"] = pd.to_numeric(df["Low"], errors="coerce")
    df["Close"] = pd.to_numeric(df["Close"], errors="coerce")
    df["Volume"] = pd.to_numeric(df["Volume"], errors="coerce")
    df = df[["Date", "Open", "High", "Low", "Close", "Volume"]].dropna(subset=["Close"]).sort_values("Date")

    # Filter again just in case (treat end_dt as exclusive)
    df = df[(df["Date"] >= start_dt) & (df["Date"] < end_dt)]
    return df.reset_index(drop=True)

def fetch_historical_data(symbol, yf_symbol, interval, days_back=None, max_retries=3, start_date=None, end_date=None):
    """Fetch historical data with proper interval handling and retry logic
    
    Can use either:
    - start_date and end_date (preferred)
    - days_back (legacy, calculates from today)
    
    Special handling for TOTAL-USD (uses CoinGecko API)
    
    Includes caching to avoid redundant API calls.
    """
    
    # Generate cache key
    cache_key = _generate_cache_key(symbol, yf_symbol, interval, days_back, start_date, end_date)
    
    # Check cache first
    cached_data = _get_cached_data(cache_key)
    if cached_data is not None:
        logger.info(f"Using cached data for {yf_symbol}, interval: {interval}")
        return cached_data
    
    # Special case: TOTAL market cap uses CoinGecko
    if yf_symbol == 'TOTAL-USD':
        df = fetch_total_marketcap_coingecko(interval, days_back, start_date, end_date)
        if not df.empty:
            _set_cached_data(cache_key, df)
        return df

    # Crypto pairs (e.g. BTCUSDT) are more reliable via Binance than yfinance on servers.
    # Try Binance first, then fall back to yfinance for any edge cases.
    if _looks_like_binance_crypto_symbol(symbol):
        try:
            df = _fetch_binance_klines(symbol, interval, days_back=days_back, start_date=start_date, end_date=end_date)
            if not df.empty:
                logger.info(f"Fetched {len(df)} rows from Binance for {symbol}, interval: {interval}")
                _set_cached_data(cache_key, df)
                return df
            logger.warning(f"Binance returned empty data for {symbol}, interval: {interval}; falling back to yfinance")
        except Exception as e:
            logger.warning(f"Binance fetch failed for {symbol}, falling back to yfinance: {e}")
    
    interval_map = {
        '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
        '1h': '60m', '2h': '60m', '4h': '60m',  # Use 60m for hourly intervals and resample
        '1d': '1d', '1w': '1wk', '1wk': '1wk', '1W': '1wk', '1M': '1mo', '1mo': '1mo'
    }
    
    yf_interval = interval_map.get(interval, '1d')
    is_hourly_resample = interval in ['1h', '2h', '4h'] or yf_interval == '60m'
    
    # Handle date range - prefer explicit dates over days_back
    if start_date and end_date:
        # Use explicit date range
        if isinstance(start_date, str):
            start_date = datetime.strptime(start_date, '%Y-%m-%d')
        if isinstance(end_date, str):
            end_date = datetime.strptime(end_date, '%Y-%m-%d')
        
        # Cap end_date to today if it's in the future (yfinance can't fetch future data)
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        if end_date > today:
            logger.warning(f"End date {end_date.date()} is in the future. Capping to today {today.date()}")
            end_date = today
        
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

        # yfinance has a ~730 day limit for intraday ("60m") data. Since we fetch 60m
        # and resample for 1h/2h/4h, hard-cap the lookback to avoid empty responses.
        if is_hourly_resample:
            max_days_back = 729
            if days_back > max_days_back:
                logger.warning(
                    f"Hourly data limited to {max_days_back} days. "
                    f"Capping days_back from {days_back} to {max_days_back} for interval {interval}."
                )
                days_back = max_days_back
        
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
                if is_hourly_resample:
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
                # For intraday/hourly data, avoid period strings like "2y" which often
                # return empty due to provider limits. Use explicit date range instead.
                if is_hourly_resample:
                    calc_end_date = datetime.now()
                    calc_start_date = calc_end_date - timedelta(days=days_back)
                    logger.info(
                        f"Calling yfinance hourly with start={calc_start_date}, end={calc_end_date}, interval={yf_interval}"
                    )
                    data = ticker.history(start=calc_start_date, end=calc_end_date, interval=yf_interval)
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
            
            # Cache the result
            _set_cached_data(cache_key, data)
            
            return data
            
        except getattr(yf, "exceptions", object()).__dict__.get("YFRateLimitError", Exception) as e:
            # If yfinance is rate-limiting and this is a crypto pair, try Binance as fallback.
            logger.warning(f"yfinance rate-limited for {yf_symbol} (attempt {attempt + 1}): {e}")
            if _looks_like_binance_crypto_symbol(symbol):
                df = _fetch_binance_klines(symbol, interval, days_back=days_back, start_date=start_date, end_date=end_date)
                if not df.empty:
                    logger.info(f"Recovered via Binance for {symbol}, interval: {interval}")
                    _set_cached_data(cache_key, df)
                    return df
            if attempt < max_retries - 1:
                time.sleep(2 * (attempt + 1))
            continue
        except Exception as e:
            logger.error(f"Error fetching data (attempt {attempt + 1}): {e}")
            if attempt < max_retries - 1:
                time.sleep(2 * (attempt + 1))
            continue
    
    logger.error(f"Failed to fetch data for {yf_symbol} after {max_retries} attempts")
    return pd.DataFrame()

