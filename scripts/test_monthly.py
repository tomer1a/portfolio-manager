import yfinance as yf
import pandas as pd

def get_sp500_monthly_js():
    ticker_symbol = "^GSPC"
    sp500 = yf.download(ticker_symbol, start="2023-01-01", interval="1mo")
    if isinstance(sp500.columns, pd.MultiIndex):
        sp500.columns = sp500.columns.get_level_values(0)
    ohlc_data = sp500[['Open', 'High', 'Low', 'Close']].dropna().round(2)
    
    js = "const spyHistoricalData = {\n"
    for date, row in ohlc_data.iterrows():
        month_str = date.strftime('%Y-%m')
        js += f'    "{month_str}": {{ open: {row["Open"]:.2f}, high: {row["High"]:.2f}, low: {row["Low"]:.2f}, close: {row["Close"]:.2f} }},\n'
    js += "};"
    
    print(js)

if __name__ == "__main__":
    get_sp500_monthly_js()
