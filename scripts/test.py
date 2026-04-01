import yfinance as yf
import pandas as pd

def get_sp500_weekly_ohlc():
    # The ticker symbol for the S&P 500 index in Yahoo Finance
    ticker_symbol = "^GSPC"
    
    print(f"Fetching weekly data for {ticker_symbol} from Jan 2023...\n")
    
    # Download data starting from Jan 1, 2023, with a weekly interval
    # '1wk' automatically groups the OHLC data by week
    sp500 = yf.download(ticker_symbol, start="2023-01-01", interval="1wk")
    
    # yfinance sometimes returns a MultiIndex column structure, 
    # so we'll flatten it to just grab the core columns we need
    if isinstance(sp500.columns, pd.MultiIndex):
        sp500.columns = sp500.columns.get_level_values(0)
        
    # Isolate the Open, High, Low, and Close columns
    ohlc_data = sp500[['Open', 'High', 'Low', 'Close']]
    
    # Drop any NaN rows that might pop up for incomplete weeks
    ohlc_data = ohlc_data.dropna()
    
    # Round the values to two decimal places for a cleaner look
    ohlc_data = ohlc_data.round(2)
    
    # Print the resulting DataFrame
    print(ohlc_data.to_string())
    
    return ohlc_data

if __name__ == "__main__":
    df = get_sp500_weekly_ohlc()