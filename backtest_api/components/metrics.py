"""
Performance metrics calculations (Sharpe ratio, max drawdown, etc.)
"""
import numpy as np
import pandas as pd
import logging

logger = logging.getLogger(__name__)

def calculate_sharpe_ratio(returns, risk_free_rate=0):
    """Calculate annualized Sharpe Ratio
    
    Args:
        returns: pandas Series or numpy array of daily returns
        risk_free_rate: annualized risk-free rate (e.g., 0.02 = 2%)
    
    Returns:
        float: Annualized Sharpe ratio
    """
    if len(returns) == 0 or returns.std() == 0:
        return 0.0
    
    excess_returns = returns - (risk_free_rate / 365)  # Daily risk-free rate
    return float(np.sqrt(365) * excess_returns.mean() / returns.std())

def calculate_max_drawdown(equity_curve):
    """Calculate maximum drawdown
    
    Args:
        equity_curve: pandas Series or numpy array of equity values
    
    Returns:
        float: Maximum drawdown as a positive percentage (e.g., 0.15 = 15%)
    """
    if len(equity_curve) == 0:
        return 0.0
    
    # Convert to Series if needed
    if isinstance(equity_curve, np.ndarray):
        equity_curve = pd.Series(equity_curve)
    
    peak = equity_curve.expanding(min_periods=1).max()
    drawdown = (equity_curve - peak) / peak
    return float(abs(drawdown.min()))

def calculate_win_rate(returns):
    """Calculate win rate from returns
    
    Args:
        returns: pandas Series or numpy array of returns
    
    Returns:
        float: Win rate as a percentage (0-100)
    """
    if len(returns) == 0:
        return 0.0
    
    winning = (returns > 0).sum()
    total = (returns != 0).sum()
    return (winning / total * 100) if total > 0 else 0.0

def calculate_total_return(initial_capital, final_capital):
    """Calculate total return percentage
    
    Args:
        initial_capital: Starting capital
        final_capital: Ending capital
    
    Returns:
        tuple: (total_return, total_return_pct)
            - total_return: Absolute return
            - total_return_pct: Percentage return
    """
    total_return = final_capital - initial_capital
    total_return_pct = (total_return / initial_capital * 100) if initial_capital > 0 else 0.0
    return float(total_return), float(total_return_pct)

