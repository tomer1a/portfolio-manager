// =====================================================================
// config.js — Firebase Configuration, Constants & Symbol Aliases
// =====================================================================
// Contains the Firebase project settings, ticker-symbol rename mapping,
// and fallback demo positions used when no cloud data is available.
// =====================================================================

// ---------- Firebase Project Settings ----------
window.firebaseConfig = {
    apiKey:            "AIzaSyAM82mpazO9jUiZQnEmr0JYf2ILb1quT2A",
    authDomain:        "stock-portfolio-app-3f66d.firebaseapp.com",
    projectId:         "stock-portfolio-app-3f66d",
    storageBucket:     "stock-portfolio-app-3f66d.firebasestorage.app",
    messagingSenderId: "102254290072",
    appId:             "1:102254290072:web:a700108bdb296f788fdced",
    measurementId:     "G-880D4G96TQ"
};

// ---------- Symbol Alias Map ----------
// Maps old ticker symbols to their current names.
// Example: SPLG was renamed to SPYM on October 31, 2025.
window.SYMBOL_ALIASES = {
    'SPLG': 'SPYM',
};

/**
 * Normalize a ticker symbol by applying known aliases.
 * @param {string} sym — raw ticker string
 * @returns {string} — canonical upper-case ticker
 */
window.normalizeSymbol = function (sym) {
    var upper = (sym || '').toUpperCase().trim();
    return window.SYMBOL_ALIASES[upper] || upper;
};

// ---------- S&P 500 Historical Data (fallback) ----------
// Actual data is loaded from Firebase by loadSp500WeeklyData() in api.js.
// This empty object ensures window.spyHistoricalData exists before anything reads it.
window.spyHistoricalData = {};

// ---------- Fallback Demo Positions ----------
// Used when cloud data is unavailable (first-time users / offline mode).
window.initialPositions = [
    {
        id: 1,
        symbol: 'AAPL',
        transactions: [{ id: 't1', shares: 50, price: 140.50, date: '2023-03-15' }],
        currentPrice: 185.20,
        dividends: []
    },
    {
        id: 2,
        symbol: 'MSFT',
        transactions: [{ id: 't2', shares: 30, price: 240.00, date: '2023-05-20' }],
        currentPrice: 380.50,
        dividends: []
    }
];
