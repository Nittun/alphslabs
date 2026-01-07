"""
Configuration constants and asset definitions
"""

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

