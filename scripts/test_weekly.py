import yfinance as yf
import pandas as pd

def get_sp500_weekly_js():
    ticker_symbol = "^GSPC"
    sp500 = yf.download(ticker_symbol, start="2023-01-01", interval="1wk")
    if isinstance(sp500.columns, pd.MultiIndex):
        sp500.columns = sp500.columns.get_level_values(0)
    ohlc_data = sp500[['Open', 'High', 'Low', 'Close']].dropna().round(2)
    
    js = "const spyHistoricalData = {\n"
    for date, row in ohlc_data.iterrows():
        week_str = date.strftime('%Y-%m-%d')
        js += f'    "{week_str}": {{ open: {row["Open"]:.2f}, high: {row["High"]:.2f}, low: {row["Low"]:.2f}, close: {row["Close"]:.2f} }},\n'
    js += "};"
    
    with open("spy_weekly.json", "w") as f:
        f.write(js)
    
    print("Weekly JS data saved to spy_weekly.json")

if __name__ == "__main__":
    get_sp500_weekly_js()
