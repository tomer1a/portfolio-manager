// =====================================================================
// spData.js — S&P 500 Weekly Data
// =====================================================================
// Historical weekly data is now stored in Firebase under:
//   artifacts/{projectId}/global_market_data/sp500_weekly
// and is loaded automatically on startup by loadSp500WeeklyData() in api.js.
//
// This empty object serves as a fallback in case Firebase is unreachable.
// =====================================================================

window.spyHistoricalData = {};
