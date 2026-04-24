// =====================================================================
// calculations.js — Portfolio Financial Calculations
// =====================================================================
// Pure functions for computing portfolio totals and tax summaries.
// Both functions receive all necessary data via parameters (no globals
// beyond window.getPositionStats and window.getRateAtDate which are
// set up in utils.js / the main app).
// =====================================================================

/**
 * Calculate portfolio totals: value, cost, profit, daily P&L, YTD P&L, dividends.
 *
 * @param {Object} params — all inputs destructured:
 *   positions, cash, cashRate, exchangeRate, initialInvestment, investmentRate,
 *   currency, getRateAtDate
 * @returns {Object} — { val, dynCost, cost, profit, profitPercent, dynCostUSD,
 *                        dailyProfit, dailyProfitPercent, ytdProfit, ytdProfitPercent,
 *                        totalDividends }
 */
window.calculateTotals = function (params) {
    var positions         = params.positions;
    var cash              = params.cash;
    var cashRate          = params.cashRate;
    var exchangeRate      = params.exchangeRate;
    var initialInvestment = params.initialInvestment;
    var investmentRate    = params.investmentRate;
    var currency          = params.currency;
    var getRateAtDate     = params.getRateAtDate;

    var cRate = cashRate !== null ? cashRate : exchangeRate;
    var dynCostUSD = cash;
    var dynCostILS = cash * cRate;
    var valUSD = cash;
    var valILS = cash * exchangeRate;
    var totalDividendsUSD = 0;

    positions.forEach(function (pos) {
        var stats = window.getPositionStats(pos);
        // Accumulate cost basis from every transaction
        stats.transactions.forEach(function (t) {
            var rP = getRateAtDate(t.date, exchangeRate);
            dynCostUSD += t.shares * t.price;
            dynCostILS += t.shares * t.price * rP;
        });
        valUSD += stats.totalShares * pos.currentPrice;
        valILS += stats.totalShares * pos.currentPrice * exchangeRate;
        totalDividendsUSD += stats.totalDividends;
    });

    var iRate   = investmentRate !== null ? investmentRate : exchangeRate;
    var costUSD = initialInvestment !== null ? initialInvestment : dynCostUSD;
    var costILS = initialInvestment !== null ? initialInvestment * iRate : dynCostILS;

    // Historical FX rates for accurate daily/YTD changes
    var today        = new Date();
    var yesterday    = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    var yesterdayStr  = yesterday.toISOString().split('T')[0];
    var ytdDateStr   = today.getFullYear() + '-01-01';
    var prevRate     = getRateAtDate(yesterdayStr, exchangeRate);
    var ytdRate      = getRateAtDate(ytdDateStr, exchangeRate);

    var prevValUSD = cash;
    var prevValILS = cash * prevRate;
    var ytdValUSD  = cash;
    var ytdValILS  = cash * ytdRate;

    var todayStr = today.toISOString().split('T')[0];
    positions.forEach(function (pos) {
        var stats     = window.getPositionStats(pos);
        var prevPrice = (pos.previousClose !== undefined && pos.previousClose !== null)
            ? pos.previousClose : pos.currentPrice;

        // Separate shares bought today from shares held before today.
        // For today's purchases, yesterday's "value" should be the purchase cost
        // (they weren't in the portfolio yesterday), not previousClose.
        var sharesToday = 0;
        var costToday = 0;
        stats.transactions.forEach(function (t) {
            if (t.date && t.date.substring(0, 10) === todayStr && t.shares > 0) {
                sharesToday += t.shares;
                costToday += t.shares * t.price;
            }
        });
        var sharesBeforeToday = stats.totalShares - sharesToday;

        prevValUSD += sharesBeforeToday * prevPrice + costToday;
        prevValILS += sharesBeforeToday * prevPrice * prevRate + costToday * prevRate;

        var ytdP = pos.ytdPrice ? pos.ytdPrice : pos.currentPrice;
        ytdValUSD += stats.totalShares * ytdP;
        ytdValILS += stats.totalShares * ytdP * ytdRate;
    });

    var cost    = currency === 'ILS' ? costILS : costUSD;
    var val     = currency === 'ILS' ? valILS : valUSD;
    var prevVal = currency === 'ILS' ? prevValILS : prevValUSD;
    var ytdVal  = currency === 'ILS' ? ytdValILS : ytdValUSD;
    var dynCost = currency === 'ILS' ? dynCostILS : dynCostUSD;
    var totalDividends = currency === 'ILS' ? totalDividendsUSD * exchangeRate : totalDividendsUSD;

    var profit        = val - cost;
    var profitPercent = cost > 0 ? (profit / cost) * 100 : 0;
    var dailyProfit   = val - prevVal;
    var dailyProfitPercent = prevVal > 0 ? (dailyProfit / prevVal) * 100 : 0;
    var ytdProfit     = val - ytdVal;
    var ytdProfitPercent = ytdVal > 0 ? (ytdProfit / ytdVal) * 100 : 0;

    return {
        val: val,
        dynCost: dynCost,
        cost: cost,
        profit: profit,
        profitPercent: profitPercent,
        dynCostUSD: dynCostUSD,
        dailyProfit: dailyProfit,
        dailyProfitPercent: dailyProfitPercent,
        ytdProfit: ytdProfit,
        ytdProfitPercent: ytdProfitPercent,
        totalDividends: totalDividends
    };
};


/**
 * Calculate tax summary: dividend withholding and realized capital gains tax.
 *
 * @param {Object} params — { positions, exchangeRate, currency, getRateAtDate }
 * @returns {Object} — { dividends: {...}, capitalGains: {...}, totalTaxUSD, totalTaxILS }
 */
window.calculateTaxSummary = function (params) {
    var positions    = params.positions;
    var exchangeRate = params.exchangeRate;
    var getRateAtDate = params.getRateAtDate;

    var TAX_RATE_DIVIDEND_US    = 0.25; // US withholding on dividends
    var TAX_RATE_CAPITAL_GAINS  = 0.25; // Israeli capital gains tax

    // === Dividend Tax ===
    var totalDivGrossUSD = 0, totalDivGrossILS = 0;
    var totalDivWithheldUSD = 0, totalDivWithheldILS = 0;
    var divDetails = [];

    positions.forEach(function (pos) {
        (pos.dividends || []).forEach(function (div) {
            var grossUSD = div.totalAmount || div.amount || 0;
            if (grossUSD <= 0) return;
            var rateAtDiv    = getRateAtDate(div.date, exchangeRate);
            var grossILS     = grossUSD * rateAtDiv;
            var withheldUSD  = grossUSD * TAX_RATE_DIVIDEND_US;
            var withheldILS  = grossILS * TAX_RATE_DIVIDEND_US;

            totalDivGrossUSD    += grossUSD;
            totalDivGrossILS    += grossILS;
            totalDivWithheldUSD += withheldUSD;
            totalDivWithheldILS += withheldILS;

            divDetails.push({
                symbol: pos.symbol, date: div.date,
                grossUSD: grossUSD, grossILS: grossILS,
                withheldUSD: withheldUSD, withheldILS: withheldILS,
                netUSD: grossUSD - withheldUSD,
                netILS: grossILS - withheldILS
            });
        });
    });

    // === Capital Gains Tax (realized sales only) ===
    var totalRealizedGainUSD = 0, totalRealizedGainILS = 0;
    var totalSaleProceedsUSD = 0, totalSaleProceedsILS = 0;
    var totalCostBasisUSD = 0, totalCostBasisILS = 0;
    var saleDetails = [];

    positions.forEach(function (pos) {
        var txns = pos.transactions || [];
        // Sort by date to compute running weighted-average cost
        var sortedTxns = txns.slice().sort(function (a, b) {
            return (new Date(a.date).getTime() || 0) - (new Date(b.date).getTime() || 0);
        });

        var runningShares = 0, runningCostUSD = 0, runningCostILS = 0;

        sortedTxns.forEach(function (txn) {
            if (txn.shares > 0) {
                // Buy — accumulate cost basis
                var rateAtBuy = getRateAtDate(txn.date, exchangeRate);
                runningShares  += txn.shares;
                runningCostUSD += txn.shares * txn.price;
                runningCostILS += txn.shares * txn.price * rateAtBuy;
            } else if (txn.shares < 0) {
                // Sell — calculate realized gain/loss
                var soldShares   = Math.abs(txn.shares);
                var salePrice    = Math.abs(txn.price);
                var rateAtSale   = getRateAtDate(txn.date, exchangeRate);
                var proceedsUSD  = soldShares * salePrice;
                var proceedsILS  = proceedsUSD * rateAtSale;

                // Weighted average cost basis
                var avgCostUSD   = runningShares > 0 ? runningCostUSD / runningShares : 0;
                var avgCostILS   = runningShares > 0 ? runningCostILS / runningShares : 0;
                var costBasisUSD = soldShares * avgCostUSD;
                var costBasisILS = soldShares * avgCostILS;
                var gainUSD      = proceedsUSD - costBasisUSD;
                var gainILS      = proceedsILS - costBasisILS;

                totalSaleProceedsUSD += proceedsUSD;
                totalSaleProceedsILS += proceedsILS;
                totalCostBasisUSD    += costBasisUSD;
                totalCostBasisILS    += costBasisILS;
                totalRealizedGainUSD += gainUSD;
                totalRealizedGainILS += gainILS;

                saleDetails.push({
                    symbol: pos.symbol, date: txn.date, shares: soldShares,
                    proceedsUSD: proceedsUSD, proceedsILS: proceedsILS,
                    costBasisUSD: costBasisUSD, costBasisILS: costBasisILS,
                    gainUSD: gainUSD, gainILS: gainILS
                });

                // Reduce running totals
                runningCostUSD -= costBasisUSD;
                runningCostILS -= costBasisILS;
                runningShares  -= soldShares;
            }
        });
    });

    var capitalGainsTaxUSD = Math.max(0, totalRealizedGainUSD) * TAX_RATE_CAPITAL_GAINS;
    var capitalGainsTaxILS = Math.max(0, totalRealizedGainILS) * TAX_RATE_CAPITAL_GAINS;
    var totalTaxUSD = totalDivWithheldUSD + capitalGainsTaxUSD;
    var totalTaxILS = totalDivWithheldILS + capitalGainsTaxILS;

    return {
        dividends: {
            grossUSD: totalDivGrossUSD, grossILS: totalDivGrossILS,
            withheldUSD: totalDivWithheldUSD, withheldILS: totalDivWithheldILS,
            netUSD: totalDivGrossUSD - totalDivWithheldUSD,
            netILS: totalDivGrossILS - totalDivWithheldILS,
            details: divDetails
        },
        capitalGains: {
            proceedsUSD: totalSaleProceedsUSD, proceedsILS: totalSaleProceedsILS,
            costBasisUSD: totalCostBasisUSD, costBasisILS: totalCostBasisILS,
            gainUSD: totalRealizedGainUSD, gainILS: totalRealizedGainILS,
            taxUSD: capitalGainsTaxUSD, taxILS: capitalGainsTaxILS,
            details: saleDetails
        },
        totalTaxUSD: totalTaxUSD,
        totalTaxILS: totalTaxILS
    };
};
