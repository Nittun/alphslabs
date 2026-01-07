"""
Global stores and thread locks for shared state
"""
import threading

# Global stores
open_positions_store = {}
position_lock = threading.Lock()
latest_backtest_store = {}
backtest_lock = threading.Lock()

