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
    'SHIB/USDT': {'symbol': 'SHIBUSDT', 'yf_symbol': 'SHIB-USD', 'name': 'Shiba Inu', 'type': 'crypto'},
    'PEPE/USDT': {'symbol': 'PEPEUSDT', 'yf_symbol': 'PEPE-USD', 'name': 'Pepe', 'type': 'crypto'},
    'NEAR/USDT': {'symbol': 'NEARUSDT', 'yf_symbol': 'NEAR-USD', 'name': 'NEAR Protocol', 'type': 'crypto'},
    'SUI/USDT': {'symbol': 'SUIUSDT', 'yf_symbol': 'SUI-USD', 'name': 'Sui', 'type': 'crypto'},
    
    # Top 20+ US Stocks
    'AAPL': {'symbol': 'AAPL', 'yf_symbol': 'AAPL', 'name': 'Apple', 'type': 'stock'},
    'MSFT': {'symbol': 'MSFT', 'yf_symbol': 'MSFT', 'name': 'Microsoft', 'type': 'stock'},
    'GOOGL': {'symbol': 'GOOGL', 'yf_symbol': 'GOOGL', 'name': 'Alphabet', 'type': 'stock'},
    'AMZN': {'symbol': 'AMZN', 'yf_symbol': 'AMZN', 'name': 'Amazon', 'type': 'stock'},
    'NVDA': {'symbol': 'NVDA', 'yf_symbol': 'NVDA', 'name': 'NVIDIA', 'type': 'stock'},
    'TSLA': {'symbol': 'TSLA', 'yf_symbol': 'TSLA', 'name': 'Tesla', 'type': 'stock'},
    'META': {'symbol': 'META', 'yf_symbol': 'META', 'name': 'Meta', 'type': 'stock'},
    'BRK-B': {'symbol': 'BRK-B', 'yf_symbol': 'BRK-B', 'name': 'Berkshire Hathaway B', 'type': 'stock'},
    'JPM': {'symbol': 'JPM', 'yf_symbol': 'JPM', 'name': 'JPMorgan Chase', 'type': 'stock'},
    'V': {'symbol': 'V', 'yf_symbol': 'V', 'name': 'Visa', 'type': 'stock'},
    'JNJ': {'symbol': 'JNJ', 'yf_symbol': 'JNJ', 'name': 'Johnson & Johnson', 'type': 'stock'},
    'WMT': {'symbol': 'WMT', 'yf_symbol': 'WMT', 'name': 'Walmart', 'type': 'stock'},
    'PG': {'symbol': 'PG', 'yf_symbol': 'PG', 'name': 'Procter & Gamble', 'type': 'stock'},
    'UNH': {'symbol': 'UNH', 'yf_symbol': 'UNH', 'name': 'UnitedHealth', 'type': 'stock'},
    'HD': {'symbol': 'HD', 'yf_symbol': 'HD', 'name': 'Home Depot', 'type': 'stock'},
    'MA': {'symbol': 'MA', 'yf_symbol': 'MA', 'name': 'Mastercard', 'type': 'stock'},
    'BAC': {'symbol': 'BAC', 'yf_symbol': 'BAC', 'name': 'Bank of America', 'type': 'stock'},
    'XOM': {'symbol': 'XOM', 'yf_symbol': 'XOM', 'name': 'Exxon Mobil', 'type': 'stock'},
    'CVX': {'symbol': 'CVX', 'yf_symbol': 'CVX', 'name': 'Chevron', 'type': 'stock'},
    'KO': {'symbol': 'KO', 'yf_symbol': 'KO', 'name': 'Coca-Cola', 'type': 'stock'},
    'PEP': {'symbol': 'PEP', 'yf_symbol': 'PEP', 'name': 'PepsiCo', 'type': 'stock'},
    'DIS': {'symbol': 'DIS', 'yf_symbol': 'DIS', 'name': 'Disney', 'type': 'stock'},
    'NFLX': {'symbol': 'NFLX', 'yf_symbol': 'NFLX', 'name': 'Netflix', 'type': 'stock'},
    'AMD': {'symbol': 'AMD', 'yf_symbol': 'AMD', 'name': 'AMD', 'type': 'stock'},
    'INTC': {'symbol': 'INTC', 'yf_symbol': 'INTC', 'name': 'Intel', 'type': 'stock'},
    'CRM': {'symbol': 'CRM', 'yf_symbol': 'CRM', 'name': 'Salesforce', 'type': 'stock'},
    'ORCL': {'symbol': 'ORCL', 'yf_symbol': 'ORCL', 'name': 'Oracle', 'type': 'stock'},
    'CSCO': {'symbol': 'CSCO', 'yf_symbol': 'CSCO', 'name': 'Cisco', 'type': 'stock'},
    'ADBE': {'symbol': 'ADBE', 'yf_symbol': 'ADBE', 'name': 'Adobe', 'type': 'stock'},
    
    # ETFs & Indices
    'SPY': {'symbol': 'SPY', 'yf_symbol': 'SPY', 'name': 'S&P 500 ETF', 'type': 'etf'},
    'QQQ': {'symbol': 'QQQ', 'yf_symbol': 'QQQ', 'name': 'Nasdaq 100 ETF', 'type': 'etf'},
    'DIA': {'symbol': 'DIA', 'yf_symbol': 'DIA', 'name': 'Dow Jones ETF', 'type': 'etf'},
    'IWM': {'symbol': 'IWM', 'yf_symbol': 'IWM', 'name': 'Russell 2000 ETF', 'type': 'etf'},
    'VTI': {'symbol': 'VTI', 'yf_symbol': 'VTI', 'name': 'Total Stock Market ETF', 'type': 'etf'},
    
    # Commodities (Gold & Silver)
    'GC=F': {'symbol': 'GC=F', 'yf_symbol': 'GC=F', 'name': 'Gold Futures', 'type': 'commodity'},
    'GLD': {'symbol': 'GLD', 'yf_symbol': 'GLD', 'name': 'Gold ETF (SPDR)', 'type': 'commodity'},
    'SI=F': {'symbol': 'SI=F', 'yf_symbol': 'SI=F', 'name': 'Silver Futures', 'type': 'commodity'},
    'SLV': {'symbol': 'SLV', 'yf_symbol': 'SLV', 'name': 'Silver ETF (iShares)', 'type': 'commodity'},
    'CL=F': {'symbol': 'CL=F', 'yf_symbol': 'CL=F', 'name': 'Crude Oil Futures', 'type': 'commodity'},
    'USO': {'symbol': 'USO', 'yf_symbol': 'USO', 'name': 'US Oil Fund', 'type': 'commodity'},
}

