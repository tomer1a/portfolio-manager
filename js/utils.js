// =====================================================================
// utils.js — Shared Utility Functions
// =====================================================================
// Pure helper functions used across the portfolio application:
//   • getPositionStats  — aggregate a position's transaction data
//   • getJaggedNoise    — deterministic noise for realistic chart lines
// =====================================================================

/**
 * Compute aggregated statistics from a position's transactions array.
 * Handles legacy flat positions (no transactions array) by wrapping them.
 *
 * @param {Object} pos — a position object from the portfolio
 * @returns {Object} — { totalShares, totalCost, avgPrice, earliestDate, totalDividends, transactions }
 */
window.getPositionStats = function (pos) {
    // Legacy support: if the position has no transactions array, create one from flat fields
    var txns = pos.transactions || [{
        id:     't_legacy',
        shares: pos.shares || 0,
        price:  pos.purchasePrice || 0,
        date:   pos.purchaseDate || ''
    }];

    var totalShares = txns.reduce(function (sum, t) { return sum + t.shares; }, 0);
    var totalCommission = txns.reduce(function (sum, t) { return sum + (t.commission || 0); }, 0);
    var totalCost   = txns.reduce(function (sum, t) { return sum + t.shares * t.price; }, 0) + totalCommission;
    var avgPrice    = totalShares > 0 ? totalCost / totalShares : 0;

    // Find the earliest transaction date
    var earliestDate = txns.reduce(function (min, t) {
        return (t.date && t.date < min) ? t.date : min;
    }, txns[0].date || '');

    // Sum all dividend payments
    var totalDividends = (pos.dividends || []).reduce(function (sum, d) {
        return sum + (d.totalAmount || d.amount || 0);
    }, 0);

    return {
        totalShares:    totalShares,
        totalCost:      totalCost,
        avgPrice:       avgPrice,
        earliestDate:   earliestDate,
        totalDividends: totalDividends,
        transactions:   txns
    };
};

/**
 * Generate deterministic "jagged" noise for a given timestamp.
 * Used to add realistic micro-variation to interpolated chart lines
 * instead of smooth sine-wave curves.
 *
 * @param {number} timestamp  — millisecond timestamp
 * @param {number} seedOffset — per-series seed to avoid identical noise across lines
 * @returns {number} — a fixed pseudo-random value between -0.5 and +0.5
 */
window.getJaggedNoise = function (timestamp, seedOffset) {
    var day = Math.floor(timestamp / 86400000) + seedOffset;
    var x   = Math.sin(day * 12.3456) * 10000;
    return (x - Math.floor(x)) - 0.5;
};
