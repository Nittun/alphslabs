"""
Backtest engine - main execution logic for backtests and optimization
"""
import pandas as pd
import numpy as np
from datetime import datetime
import logging

# Import from our modules
from .indicators import calculate_ema, calculate_ma, calculate_rsi, calculate_cci, calculate_zscore
from .strategy import (
    check_entry_signal_indicator, check_entry_signal,
    check_exit_condition_indicator, check_exit_condition,
    calculate_stop_loss, calculate_support_resistance
)
from .metrics import calculate_sharpe_ratio, calculate_max_drawdown
from .data_fetcher import fetch_historical_data
from .config import AVAILABLE_ASSETS
from .stores import open_positions_store, position_lock

logger = logging.getLogger(__name__)

def run_backtest(data, initial_capital=10000, enable_short=True, interval='1d', strategy_mode='reversal', 
                 ema_fast=12, ema_slow=26, indicator_type='ema', indicator_params=None):
    """
    Clean backtest engine with multiple strategy modes and configurable indicators:
    - 'reversal': Always in market - exit and immediately enter opposite on signal
    - 'wait_for_next': Exit on signal, wait for NEXT signal to re-enter (flat periods)
    - 'long_only': Only Long trades
    - 'short_only': Only Short trades
    
    Indicator Parameters:
    - indicator_type: 'ema', 'ma', 'rsi', 'cci', 'zscore' (default 'ema')
    - indicator_params: dict with indicator-specific parameters
      - EMA/MA: {'fast': 12, 'slow': 26}
      - RSI: {'length': 14, 'top': 70, 'bottom': 30}
      - CCI: {'length': 20, 'top': 100, 'bottom': -100}
      - Z-Score: {'length': 20, 'top': 2, 'bottom': -2}
    
    Legacy Parameters (for backward compatibility):
    - ema_fast: Fast EMA period (default 12) - used if indicator_type='ema' and indicator_params not provided
    - ema_slow: Slow EMA period (default 26) - used if indicator_type='ema' and indicator_params not provided
    """
    if len(data) == 0:
        logger.warning('Empty data provided to backtest')
        return [], {}, None
    
    # Set default indicator params if not provided
    if indicator_params is None:
        if indicator_type == 'ema':
            if ema_fast >= ema_slow:
                ema_fast, ema_slow = ema_slow, ema_fast
            indicator_params = {'fast': ema_fast, 'slow': ema_slow}
        elif indicator_type == 'ma':
            if ema_fast >= ema_slow:
                ema_fast, ema_slow = ema_slow, ema_fast
            indicator_params = {'fast': ema_fast, 'slow': ema_slow}
        elif indicator_type == 'rsi':
            indicator_params = {'length': 14, 'top': 70, 'bottom': 30}
        elif indicator_type == 'cci':
            indicator_params = {'length': 20, 'top': 100, 'bottom': -100}
        elif indicator_type == 'zscore':
            indicator_params = {'length': 20, 'top': 2, 'bottom': -2}
    
    # Calculate indicators based on type
    if indicator_type == 'ema':
        fast_period = indicator_params.get('fast', ema_fast)
        slow_period = indicator_params.get('slow', ema_slow)
        if fast_period >= slow_period:
            fast_period, slow_period = slow_period, fast_period
        data[f'EMA{fast_period}'] = calculate_ema(data, fast_period)
        data[f'EMA{slow_period}'] = calculate_ema(data, slow_period)
        logger.info(f'Starting backtest: {len(data)} candles, capital: ${initial_capital:,.2f}, interval: {interval}, mode: {strategy_mode}, EMA({fast_period}/{slow_period})')
    elif indicator_type == 'ma':
        fast_period = indicator_params.get('fast', ema_fast)
        slow_period = indicator_params.get('slow', ema_slow)
        if fast_period >= slow_period:
            fast_period, slow_period = slow_period, fast_period
        data[f'MA{fast_period}'] = calculate_ma(data, fast_period)
        data[f'MA{slow_period}'] = calculate_ma(data, slow_period)
        logger.info(f'Starting backtest: {len(data)} candles, capital: ${initial_capital:,.2f}, interval: {interval}, mode: {strategy_mode}, MA({fast_period}/{slow_period})')
    elif indicator_type == 'rsi':
        period = indicator_params.get('length', indicator_params.get('period', 14))
        data[f'RSI{period}'] = calculate_rsi(data, period)
        logger.info(f'Starting backtest: {len(data)} candles, capital: ${initial_capital:,.2f}, interval: {interval}, mode: {strategy_mode}, RSI({period})')
    elif indicator_type == 'cci':
        period = indicator_params.get('length', indicator_params.get('period', 20))
        data[f'CCI{period}'] = calculate_cci(data, period)
        logger.info(f'Starting backtest: {len(data)} candles, capital: ${initial_capital:,.2f}, interval: {interval}, mode: {strategy_mode}, CCI({period})')
    elif indicator_type == 'zscore':
        period = indicator_params.get('length', indicator_params.get('period', 20))
        data[f'ZScore{period}'] = calculate_zscore(data, period)
        logger.info(f'Starting backtest: {len(data)} candles, capital: ${initial_capital:,.2f}, interval: {interval}, mode: {strategy_mode}, Z-Score({period})')
    else:
        logger.warning(f'Unknown indicator type: {indicator_type}, defaulting to EMA')
        indicator_type = 'ema'
        indicator_params = {'fast': ema_fast, 'slow': ema_slow}
        data[f'EMA{ema_fast}'] = calculate_ema(data, ema_fast)
        data[f'EMA{ema_slow}'] = calculate_ema(data, ema_slow)
    
    trades = []
    capital = initial_capital
    position = None
    just_exited_on_crossover = False
    
    # Process each candle one by one
    for i in range(1, len(data)):
        current_row = data.iloc[i]
        prev_row = data.iloc[i-1]
        
        current_date = current_row['Date']
        current_price = current_row['Close']
        current_high = current_row['High']
        current_low = current_row['Low']
        
        # Get current signal
        has_crossover, crossover_type, crossover_reason = check_entry_signal_indicator(
            current_row, prev_row, indicator_type, indicator_params
        )
        
        # Check exit conditions first (if position exists)
        if position is not None:
            should_exit, exit_reason, exit_price, stop_loss_hit = check_exit_condition_indicator(
                position, current_price, current_high, current_low, current_row, prev_row, indicator_type, indicator_params
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
                    'Indicator_Type': indicator_type,
                    'Indicator_Params': indicator_params,
                    'EMA_Fast_Period': indicator_params.get('fast') if indicator_type in ['ema', 'ma'] else None,
                    'EMA_Slow_Period': indicator_params.get('slow') if indicator_type in ['ema', 'ma'] else None,
                    'Entry_EMA_Fast': float(position.get('entry_ema_fast', 0)) if indicator_type == 'ema' else None,
                    'Entry_EMA_Slow': float(position.get('entry_ema_slow', 0)) if indicator_type == 'ema' else None,
                    'Entry_MA_Fast': float(position.get('entry_ma_fast', 0)) if indicator_type == 'ma' else None,
                    'Entry_MA_Slow': float(position.get('entry_ma_slow', 0)) if indicator_type == 'ma' else None,
                    'Exit_EMA_Fast': float(current_row.get(f"EMA{indicator_params.get('fast', ema_fast)}", 0)) if indicator_type == 'ema' and not pd.isna(current_row.get(f"EMA{indicator_params.get('fast', ema_fast)}", np.nan)) else None,
                    'Exit_EMA_Slow': float(current_row.get(f"EMA{indicator_params.get('slow', ema_slow)}", 0)) if indicator_type == 'ema' and not pd.isna(current_row.get(f"EMA{indicator_params.get('slow', ema_slow)}", np.nan)) else None,
                    'Exit_MA_Fast': float(current_row.get(f"MA{indicator_params.get('fast', ema_fast)}", 0)) if indicator_type == 'ma' and not pd.isna(current_row.get(f"MA{indicator_params.get('fast', ema_fast)}", np.nan)) else None,
                    'Exit_MA_Slow': float(current_row.get(f"MA{indicator_params.get('slow', ema_slow)}", 0)) if indicator_type == 'ma' and not pd.isna(current_row.get(f"MA{indicator_params.get('slow', ema_slow)}", np.nan)) else None,
                    'Strategy_Mode': strategy_mode,
                }
                trades.append(trade)
                
                if position['position_type'] == 'long':
                    capital = exit_value
                else:
                    capital = capital + pnl
                
                just_exited_on_crossover = not stop_loss_hit and has_crossover
                position = None
                logger.info(f"Exit: {exit_reason} at ${exit_price:.2f}, P&L: ${pnl:.2f} ({pnl_pct:.2f}%)")
        
        # Check entry signal (only if no position)
        if position is None and has_crossover and crossover_type:
            should_enter = False
            entry_decision_reason = ''
            
            if strategy_mode == 'reversal':
                should_enter = True
                entry_decision_reason = 'reversal mode - always enter on crossover'
            elif strategy_mode == 'wait_for_next':
                if not just_exited_on_crossover:
                    should_enter = True
                    entry_decision_reason = 'wait_for_next mode - this is a fresh crossover'
                else:
                    entry_decision_reason = 'wait_for_next mode - skipping (just exited on this crossover)'
            elif strategy_mode == 'long_only':
                if crossover_type == 'Long':
                    should_enter = True
                    entry_decision_reason = 'long_only mode - Golden Cross detected'
                else:
                    entry_decision_reason = 'long_only mode - skipping Short signal'
            elif strategy_mode == 'short_only':
                if crossover_type == 'Short':
                    should_enter = True
                    entry_decision_reason = 'short_only mode - Death Cross detected'
                else:
                    entry_decision_reason = 'short_only mode - skipping Long signal'
            
            if should_enter and crossover_type == 'Short' and not enable_short:
                should_enter = False
                entry_decision_reason = 'Short disabled in settings'
            
            if not should_enter and entry_decision_reason:
                logger.debug(f"Skipping entry: {entry_decision_reason}")
            
            if should_enter:
                support, resistance = calculate_support_resistance(data, i, lookback=50)
                stop_loss = calculate_stop_loss(crossover_type, current_price, support, resistance)
                shares = capital / current_price
                
                entry_indicator_values = {}
                if indicator_type == 'ema':
                    fast_period = indicator_params.get('fast', ema_fast)
                    slow_period = indicator_params.get('slow', ema_slow)
                    entry_indicator_values['entry_ema_fast'] = float(current_row.get(f'EMA{fast_period}', 0)) if not pd.isna(current_row.get(f'EMA{fast_period}', np.nan)) else 0.0
                    entry_indicator_values['entry_ema_slow'] = float(current_row.get(f'EMA{slow_period}', 0)) if not pd.isna(current_row.get(f'EMA{slow_period}', np.nan)) else 0.0
                elif indicator_type == 'ma':
                    fast_period = indicator_params.get('fast', ema_fast)
                    slow_period = indicator_params.get('slow', ema_slow)
                    entry_indicator_values['entry_ma_fast'] = float(current_row.get(f'MA{fast_period}', 0)) if not pd.isna(current_row.get(f'MA{fast_period}', np.nan)) else 0.0
                    entry_indicator_values['entry_ma_slow'] = float(current_row.get(f'MA{slow_period}', 0)) if not pd.isna(current_row.get(f'MA{slow_period}', np.nan)) else 0.0
                elif indicator_type == 'rsi':
                    period = indicator_params.get('length', indicator_params.get('period', 14))
                    entry_indicator_values['entry_rsi'] = float(current_row.get(f'RSI{period}', 50)) if not pd.isna(current_row.get(f'RSI{period}', np.nan)) else 50.0
                elif indicator_type == 'cci':
                    period = indicator_params.get('length', indicator_params.get('period', 20))
                    entry_indicator_values['entry_cci'] = float(current_row.get(f'CCI{period}', 0)) if not pd.isna(current_row.get(f'CCI{period}', np.nan)) else 0.0
                elif indicator_type == 'zscore':
                    period = indicator_params.get('length', indicator_params.get('period', 20))
                    entry_indicator_values['entry_zscore'] = float(current_row.get(f'ZScore{period}', 0)) if not pd.isna(current_row.get(f'ZScore{period}', np.nan)) else 0.0
                
                position = {
                    'entry_date': current_date,
                    'entry_price': current_price,
                    'shares': shares,
                    'position_type': crossover_type.lower(),
                    'stop_loss': stop_loss,
                    'entry_reason': crossover_reason,
                    'entry_interval': interval,
                    'indicator_type': indicator_type,
                    **entry_indicator_values
                }
                
                logger.info(f"Entry: {crossover_type} at ${current_price:.2f}, Stop Loss: ${stop_loss:.2f}, Reason: {crossover_reason}")
        
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

def analyze_current_market(asset, interval, days_back=365, enable_short=True, initial_capital=10000):
    """
    Analyze current market - fetch real-time data and check for signals
    Only enters on closed candles
    """
    if asset not in AVAILABLE_ASSETS:
        return None, None, None
    
    asset_info = AVAILABLE_ASSETS[asset]
    
    df = fetch_historical_data(
        asset_info['symbol'],
        asset_info['yf_symbol'],
        interval,
        days_back
    )
    
    if df.empty or len(df) < 2:
        return None, None, None
    
    df['EMA12'] = calculate_ema(df, 12)
    df['EMA26'] = calculate_ema(df, 26)
    
    latest_closed_idx = len(df) - 2 if len(df) >= 2 else len(df) - 1
    latest_closed = df.iloc[latest_closed_idx]
    prev_closed = df.iloc[latest_closed_idx - 1] if latest_closed_idx > 0 else None
    
    has_signal, signal_type, entry_reason = check_entry_signal(latest_closed, prev_closed)
    
    if has_signal and signal_type == 'Short' and not enable_short:
        has_signal = False
    
    current_position = None
    with position_lock:
        positions = list(open_positions_store.values())
        if positions:
            current_position = positions[-1]
    
    entry_signal = None
    if has_signal and signal_type and current_position is None:
        support, resistance = calculate_support_resistance(df, latest_closed_idx, lookback=50)
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

def run_optimization_backtest(data, ema_short, ema_long, initial_capital=10000, position_type='both', risk_free_rate=0):
    """
    Run a simple backtest for optimization - returns metrics only
    
    position_type: 'long_only', 'short_only', or 'both'
    risk_free_rate: annualized risk-free rate (e.g., 0.02 = 2%)
    """
    if len(data) < max(ema_short, ema_long) + 10:
        return None
    
    data = data.copy()
    data['EMA_Short'] = calculate_ema(data, ema_short)
    data['EMA_Long'] = calculate_ema(data, ema_long)
    
    data['Signal'] = 0
    if position_type == 'long_only':
        data.loc[data['EMA_Short'] > data['EMA_Long'], 'Signal'] = 1
    elif position_type == 'short_only':
        data.loc[data['EMA_Short'] < data['EMA_Long'], 'Signal'] = -1
    else:  # 'both'
        data.loc[data['EMA_Short'] > data['EMA_Long'], 'Signal'] = 1
        data.loc[data['EMA_Short'] < data['EMA_Long'], 'Signal'] = -1
    
    data['Returns'] = data['Close'].pct_change()
    data['Strategy_Returns'] = data['Signal'].shift(1) * data['Returns']
    data = data.dropna()
    
    if len(data) == 0:
        return None
    
    strategy_returns = data['Strategy_Returns']
    equity = initial_capital * (1 + strategy_returns).cumprod()
    total_return = (equity.iloc[-1] / initial_capital) - 1 if len(equity) > 0 else 0
    sharpe = calculate_sharpe_ratio(strategy_returns, risk_free_rate)
    max_dd = calculate_max_drawdown(equity)
    winning = (strategy_returns > 0).sum()
    total = (strategy_returns != 0).sum()
    win_rate = winning / total if total > 0 else 0
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

def run_indicator_optimization_backtest(data, indicator_type, indicator_length, indicator_top, indicator_bottom, initial_capital=10000, position_type='both', risk_free_rate=0):
    """
    Run optimization backtest for RSI/CCI/Z-Score indicators
    
    indicator_type: 'rsi', 'cci', or 'zscore'
    indicator_length: Period for indicator calculation
    indicator_top: Top threshold (overbought)
    indicator_bottom: Bottom threshold (oversold)
    """
    if len(data) < indicator_length + 10:
        return None
    
    data = data.copy()
    
    # Calculate indicator
    if indicator_type == 'rsi':
        data[f'RSI{indicator_length}'] = calculate_rsi(data, indicator_length)
        indicator_col = f'RSI{indicator_length}'
    elif indicator_type == 'cci':
        data[f'CCI{indicator_length}'] = calculate_cci(data, indicator_length)
        indicator_col = f'CCI{indicator_length}'
    elif indicator_type == 'zscore':
        data[f'ZScore{indicator_length}'] = calculate_zscore(data, indicator_length)
        indicator_col = f'ZScore{indicator_length}'
    else:
        return None
    
    # Generate signals based on indicator crossovers
    data['Signal'] = 0
    
    for idx in range(indicator_length + 1, len(data)):
        current_val = data.loc[data.index[idx], indicator_col]
        prev_val = data.loc[data.index[idx - 1], indicator_col]
        
        if pd.isna(current_val) or pd.isna(prev_val):
            continue
        
        signal = 0
        
        # Long signal: crosses above bottom threshold
        if prev_val <= indicator_bottom and current_val > indicator_bottom:
            if position_type in ['both', 'long_only']:
                signal = 1
        
        # Short signal: crosses below top threshold
        elif prev_val >= indicator_top and current_val < indicator_top:
            if position_type in ['both', 'short_only']:
                signal = -1
        
        data.loc[data.index[idx], 'Signal'] = signal
    
    # For reversal mode: if signal changes, reverse position
    # For wait_for_next: only enter when signal appears
    # For optimization, we'll use reversal mode (always in market)
    data['Position'] = data['Signal'].replace(0, np.nan).ffill().fillna(0)
    
    data['Returns'] = data['Close'].pct_change()
    data['Strategy_Returns'] = data['Position'].shift(1) * data['Returns']
    data = data.dropna()
    
    if len(data) == 0:
        return None
    
    strategy_returns = data['Strategy_Returns']
    equity = initial_capital * (1 + strategy_returns).cumprod()
    total_return = (equity.iloc[-1] / initial_capital) - 1 if len(equity) > 0 else 0
    sharpe = calculate_sharpe_ratio(strategy_returns, risk_free_rate)
    max_dd = calculate_max_drawdown(equity)
    winning = (strategy_returns > 0).sum()
    total = (strategy_returns != 0).sum()
    win_rate = winning / total if total > 0 else 0
    trades = (data['Position'].diff().abs() > 0.5).sum()
    
    return {
        'indicator_length': indicator_length,
        'indicator_top': indicator_top,
        'indicator_bottom': indicator_bottom,
        'sharpe_ratio': sharpe,
        'total_return': total_return,
        'max_drawdown': max_dd,
        'win_rate': win_rate,
        'total_trades': int(trades),
    }

def run_combined_equity_backtest(data, ema_short, ema_long, initial_capital, in_sample_years, out_sample_years, position_type='both', risk_free_rate=0):
    """
    Run a single continuous backtest and mark each point as in-sample or out-sample
    
    position_type: 'long_only', 'short_only', or 'both'
    risk_free_rate: annualized risk-free rate (e.g., 0.02 = 2%)
    """
    if len(data) < max(ema_short, ema_long) + 10:
        return None, None, []
    
    data = data.copy()
    data['EMA_Short'] = calculate_ema(data, ema_short)
    data['EMA_Long'] = calculate_ema(data, ema_long)
    
    data['Signal'] = 0
    if position_type == 'long_only':
        data.loc[data['EMA_Short'] > data['EMA_Long'], 'Signal'] = 1
    elif position_type == 'short_only':
        data.loc[data['EMA_Short'] < data['EMA_Long'], 'Signal'] = -1
    else:  # 'both'
        data.loc[data['EMA_Short'] > data['EMA_Long'], 'Signal'] = 1
        data.loc[data['EMA_Short'] < data['EMA_Long'], 'Signal'] = -1
    
    data['Returns'] = data['Close'].pct_change()
    data['Strategy_Returns'] = data['Signal'].shift(1) * data['Returns']
    data = data.dropna()
    
    if len(data) == 0:
        return None, None, []
    
    data['Sample_Type'] = data['Year'].apply(
        lambda y: 'in_sample' if y in in_sample_years else ('out_sample' if y in out_sample_years else 'none')
    )
    
    equity = initial_capital * (1 + data['Strategy_Returns']).cumprod()
    
    equity_curve = []
    prev_sample_type = None
    segment_id = 0
    
    for idx, row in data.iterrows():
        sample_type = row['Sample_Type']
        year = int(row['Year'])
        
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
    
    out_sample_mask = data['Sample_Type'] == 'out_sample'
    out_sample_returns = data.loc[out_sample_mask, 'Strategy_Returns']
    out_sample_equity = equity[out_sample_mask]
    
    out_sample_metrics = None
    if len(out_sample_returns) > 0:
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

