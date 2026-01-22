"""
Strategy logic: entry signals, exit conditions, stop loss, support/resistance
"""
import pandas as pd
import numpy as np
import logging

logger = logging.getLogger(__name__)

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

def check_entry_signal_ma(data_row, prev_row, params=None):
    """Check for MA crossover signal"""
    if params is None:
        params = {'fast': 12, 'slow': 26}
    
    fast_period = params.get('fast', 12)
    slow_period = params.get('slow', 26)
    
    ma_fast_col = f'MA{fast_period}'
    ma_slow_col = f'MA{slow_period}'
    
    # Get MA values
    ma_fast_current = float(data_row.get(ma_fast_col, 0)) if not pd.isna(data_row.get(ma_fast_col, np.nan)) else 0.0
    ma_slow_current = float(data_row.get(ma_slow_col, 0)) if not pd.isna(data_row.get(ma_slow_col, np.nan)) else 0.0
    ma_fast_prev = float(prev_row.get(ma_fast_col, 0)) if not pd.isna(prev_row.get(ma_fast_col, np.nan)) else 0.0
    ma_slow_prev = float(prev_row.get(ma_slow_col, 0)) if not pd.isna(prev_row.get(ma_slow_col, np.nan)) else 0.0
    
    # Long signal: Fast MA crosses above Slow MA
    if ma_fast_prev <= ma_slow_prev and ma_fast_current > ma_slow_current:
        return True, 'Long', f'Golden Cross: MA{fast_period} crossed above MA{slow_period}'
    # Short signal: Fast MA crosses below Slow MA
    elif ma_fast_prev >= ma_slow_prev and ma_fast_current < ma_slow_current:
        return True, 'Short', f'Death Cross: MA{fast_period} crossed below MA{slow_period}'
    
    return False, None, None

def check_entry_signal_ema(data_row, prev_row, params=None):
    """Check for EMA crossover signal"""
    if params is None:
        params = {'fast': 12, 'slow': 26}
    
    fast_period = params.get('fast', 12)
    slow_period = params.get('slow', 26)
    
    ema_fast_col = f'EMA{fast_period}'
    ema_slow_col = f'EMA{slow_period}'
    
    # Get EMA values
    ema_fast_current = float(data_row.get(ema_fast_col, 0)) if not pd.isna(data_row.get(ema_fast_col, np.nan)) else 0.0
    ema_slow_current = float(data_row.get(ema_slow_col, 0)) if not pd.isna(data_row.get(ema_slow_col, np.nan)) else 0.0
    ema_fast_prev = float(prev_row.get(ema_fast_col, 0)) if not pd.isna(prev_row.get(ema_fast_col, np.nan)) else 0.0
    ema_slow_prev = float(prev_row.get(ema_slow_col, 0)) if not pd.isna(prev_row.get(ema_slow_col, np.nan)) else 0.0
    
    # Long signal: Fast EMA crosses above Slow EMA
    if ema_fast_prev <= ema_slow_prev and ema_fast_current > ema_slow_current:
        return True, 'Long', f'Golden Cross: EMA{fast_period} crossed above EMA{slow_period}'
    # Short signal: Fast EMA crosses below Slow EMA
    elif ema_fast_prev >= ema_slow_prev and ema_fast_current < ema_slow_current:
        return True, 'Short', f'Death Cross: EMA{fast_period} crossed below EMA{slow_period}'
    
    return False, None, None

def check_entry_signal_rsi(data_row, prev_row, params=None):
    """Check for RSI overbought/oversold signal (mean reversion: buy oversold, sell overbought)"""
    if params is None:
        params = {'length': 14, 'top': 70, 'bottom': 30}
    
    period = params.get('length', params.get('period', 14))
    overbought = params.get('top', params.get('overbought', 70))
    oversold = params.get('bottom', params.get('oversold', 30))
    
    rsi_col = f'RSI{period}'
    rsi_current = float(data_row.get(rsi_col, 50)) if not pd.isna(data_row.get(rsi_col, np.nan)) else 50.0
    
    # Mean reversion logic: buy when oversold, sell when overbought
    # Long signal: RSI is in oversold zone (expect bounce up)
    if rsi_current <= oversold:
        return True, 'Long', f'RSI({period}) hit oversold ({rsi_current:.1f} <= {oversold}) - Buy signal'
    # Short signal: RSI is in overbought zone (expect pullback)
    elif rsi_current >= overbought:
        return True, 'Short', f'RSI({period}) hit overbought ({rsi_current:.1f} >= {overbought}) - Sell signal'
    
    return False, None, None

def check_entry_signal_cci(data_row, prev_row, params=None):
    """Check for CCI overbought/oversold signal (mean reversion: buy oversold, sell overbought)"""
    if params is None:
        params = {'length': 20, 'top': 100, 'bottom': -100}
    
    period = params.get('length', params.get('period', 20))
    overbought = params.get('top', params.get('overbought', 100))
    oversold = params.get('bottom', params.get('oversold', -100))
    
    cci_col = f'CCI{period}'
    cci_current = float(data_row.get(cci_col, 0)) if not pd.isna(data_row.get(cci_col, np.nan)) else 0.0
    
    # Mean reversion logic: buy when oversold, sell when overbought
    # Long signal: CCI is in oversold zone (expect bounce up)
    if cci_current <= oversold:
        return True, 'Long', f'CCI({period}) hit oversold ({cci_current:.1f} <= {oversold}) - Buy signal'
    # Short signal: CCI is in overbought zone (expect pullback)
    elif cci_current >= overbought:
        return True, 'Short', f'CCI({period}) hit overbought ({cci_current:.1f} >= {overbought}) - Sell signal'
    
    return False, None, None

def check_entry_signal_zscore(data_row, prev_row, params=None):
    """Check for Z-Score threshold signal (mean reversion: buy oversold, sell overbought)"""
    if params is None:
        params = {'length': 20, 'top': 2, 'bottom': -2}
    
    period = params.get('length', params.get('period', 20))
    upper = params.get('top', params.get('upper', 2))
    lower = params.get('bottom', params.get('lower', -2))
    
    zscore_col = f'ZScore{period}'
    zscore_current = float(data_row.get(zscore_col, 0)) if not pd.isna(data_row.get(zscore_col, np.nan)) else 0.0
    
    # Mean reversion logic: buy when oversold (negative z-score), sell when overbought (positive z-score)
    # Long signal: Z-Score is in oversold zone (price below mean, expect reversion up)
    if zscore_current <= lower:
        return True, 'Long', f'Z-Score({period}) hit oversold ({zscore_current:.2f} <= {lower}) - Buy signal'
    # Short signal: Z-Score is in overbought zone (price above mean, expect reversion down)
    elif zscore_current >= upper:
        return True, 'Short', f'Z-Score({period}) hit overbought ({zscore_current:.2f} >= {upper}) - Sell signal'
    
    return False, None, None

def check_entry_signal_indicator(data_row, prev_row, indicator_type='ema', indicator_params=None):
    """
    Check for entry signal based on selected indicator
    Returns: (has_signal, signal_type, entry_reason)
    - has_signal: bool
    - signal_type: 'Long' or 'Short' or None
    - entry_reason: str
    
    Supported indicators:
    - 'ema': EMA crossover (params: {'fast': 12, 'slow': 26})
    - 'ma': MA crossover (params: {'fast': 12, 'slow': 26})
    - 'rsi': RSI overbought/oversold (params: {'length': 14, 'top': 70, 'bottom': 30})
    - 'cci': CCI overbought/oversold (params: {'length': 20, 'top': 100, 'bottom': -100})
    - 'zscore': Z-Score threshold (params: {'length': 20, 'top': 2, 'bottom': -2})
    """
    if prev_row is None:
        return False, None, None
    
    if indicator_params is None:
        indicator_params = {}
    
    if indicator_type == 'ema':
        return check_entry_signal_ema(data_row, prev_row, indicator_params)
    elif indicator_type == 'ma':
        return check_entry_signal_ma(data_row, prev_row, indicator_params)
    elif indicator_type == 'rsi':
        return check_entry_signal_rsi(data_row, prev_row, indicator_params)
    elif indicator_type == 'cci':
        return check_entry_signal_cci(data_row, prev_row, indicator_params)
    elif indicator_type == 'zscore':
        return check_entry_signal_zscore(data_row, prev_row, indicator_params)
    else:
        return False, None, None

# Legacy function for backward compatibility
def check_entry_signal(data_row, prev_row, ema_fast_col='EMA12', ema_slow_col='EMA26'):
    """Legacy EMA crossover signal check - kept for backward compatibility"""
    if prev_row is None:
        return False, None, None
    
    ema_fast_current = float(data_row.get(ema_fast_col, 0)) if not pd.isna(data_row.get(ema_fast_col, np.nan)) else 0.0
    ema_slow_current = float(data_row.get(ema_slow_col, 0)) if not pd.isna(data_row.get(ema_slow_col, np.nan)) else 0.0
    ema_fast_prev = float(prev_row.get(ema_fast_col, 0)) if not pd.isna(prev_row.get(ema_fast_col, np.nan)) else 0.0
    ema_slow_prev = float(prev_row.get(ema_slow_col, 0)) if not pd.isna(prev_row.get(ema_slow_col, np.nan)) else 0.0
    
    fast_period = ema_fast_col.replace('EMA', '')
    slow_period = ema_slow_col.replace('EMA', '')
    
    if ema_fast_prev <= ema_slow_prev and ema_fast_current > ema_slow_current:
        return True, 'Long', f'EMA{fast_period} crossed above EMA{slow_period} (Golden Cross) - EMA{fast_period}: {ema_fast_current:.2f}, EMA{slow_period}: {ema_slow_current:.2f}'
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

def check_exit_condition_indicator(position, current_price, current_high, current_low, current_row=None, prev_row=None, 
                                     indicator_type='ema', indicator_params=None):
    """
    Check if position should exit based on indicator signals
    1. Stop loss hit
    2. Opposite signal from indicator (exit Long on Short signal, exit Short on Long signal)
    3. For oscillators: exit when indicator crosses neutral zone (take profit)
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
    
    # Check for opposite signal exit
    if current_row is not None and prev_row is not None:
        has_signal, signal_type, signal_reason = check_entry_signal_indicator(
            current_row, prev_row, indicator_type, indicator_params
        )
        
        if has_signal:
            if position_type == 'long' and signal_type == 'Short':
                return True, f'Exit Signal: {signal_reason}', current_price, False
            elif position_type == 'short' and signal_type == 'Long':
                return True, f'Exit Signal: {signal_reason}', current_price, False
        
        # For oscillators, exit when indicator reaches the opposite zone (position flip)
        # This is handled by check_entry_signal_indicator returning the opposite signal above
        # No additional neutral-zone exit needed with zone-based logic
    
    return False, None, current_price, False

# Legacy function for backward compatibility
def check_exit_condition(position, current_price, current_high, current_low, current_row=None, prev_row=None, ema_fast_col='EMA12', ema_slow_col='EMA26'):
    """
    Legacy exit condition check - kept for backward compatibility
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

