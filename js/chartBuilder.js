// =====================================================================
// chartBuilder.js — Performance Chart Data Generator
// =====================================================================
// Builds the chart data array used by the Recharts performance graph.
// This is the heavy computation that powers the portfolio vs S&P 500
// comparison chart. Extracted from the React useMemo callback.
// =====================================================================

/**
 * Build an array of data points for the performance chart.
 *
 * Each point contains percentage returns vs cost basis for the portfolio
 * (USD and ILS) and S&P 500 (USD and ILS), plus absolute values for
 * tooltip display.
 *
 * @param {Object} params — all required inputs:
 *   positions, cash, cashRate, exchangeRate, initialInvestment,
 *   investmentRate, spyData, cashDeposits, historicalFX,
 *   getRateAtDate, getPositionStats, getJaggedNoise
 * @returns {Array<Object>} — chart data points
 */
window.buildChartData = function (params) {
    var positions         = params.positions;
    var cash              = params.cash;
    var cashRate          = params.cashRate;
    var exchangeRate      = params.exchangeRate;
    var initialInvestment = params.initialInvestment;
    var investmentRate    = params.investmentRate;
    var spyData           = params.spyData;
    var cashDeposits      = params.cashDeposits;
    var getRateAtDate     = params.getRateAtDate;
    var getPositionStats  = params.getPositionStats || window.getPositionStats;
    var getJaggedNoise    = params.getJaggedNoise || window.getJaggedNoise;
    var spyHistoricalData = window.spyHistoricalData || {};

    if (!positions || positions.length === 0) return [];

    var today = new Date();

    // Determine the earliest transaction date across all positions
    var dates = positions.flatMap(function (p) {
        var stats = getPositionStats(p);
        return stats.transactions.map(function (t) { return new Date(t.date).getTime(); });
    }).filter(function (t) { return !isNaN(t); });

    var earliestDate = dates.length > 0
        ? new Date(Math.min.apply(null, dates))
        : new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    var data = [];
    var ONE_DAY   = 24 * 60 * 60 * 1000;
    var totalDays = (today.getTime() - earliestDate.getTime()) / ONE_DAY;
    var baseStep  = Math.max(1, Math.floor(totalDays / 90));

    // Build set of timestamps to evaluate (evenly spaced + key boundaries)
    var timestamps = new Set();
    for (var t = earliestDate.getTime(); t <= today.getTime(); t += baseStep * ONE_DAY) {
        timestamps.add(t);
    }
    // Add exact range boundaries for precise YTD/1M/3M/6M/1Y anchors
    var yearStart = new Date(today.getFullYear(), 0, 1).getTime();
    timestamps.add(yearStart);
    timestamps.add(today.getTime() - 30 * ONE_DAY);
    timestamps.add(today.getTime() - 90 * ONE_DAY);
    timestamps.add(today.getTime() - 180 * ONE_DAY);
    timestamps.add(today.getTime() - 365 * ONE_DAY);
    timestamps.add(today.getTime());

    var sortedTimestamps = Array.from(timestamps)
        .filter(function (t) { return t >= earliestDate.getTime(); })
        .sort(function (a, b) { return a - b; });

    // Calculate the "base cost" from all positions (used as denominator for % return)
    var finalDynCostUSD = cash;
    var finalDynCostILS = cash * (cashRate !== null ? cashRate : exchangeRate);
    positions.forEach(function (p) {
        var stats = getPositionStats(p);
        stats.transactions.forEach(function (t) {
            finalDynCostUSD += t.shares * t.price;
            finalDynCostILS += t.shares * t.price * getRateAtDate(t.date, exchangeRate);
        });
    });

    var globalBaseCostUSD = initialInvestment !== null ? initialInvestment : finalDynCostUSD;
    var globalBaseCostILS = initialInvestment !== null
        ? initialInvestment * (investmentRate !== null ? investmentRate : exchangeRate)
        : finalDynCostILS;

    // Find the S&P 500 index level at the earliest date (for tooltip display)
    var startSp500Index = null;
    var spIdxLookup = new Date(earliestDate);
    for (var ssi = 0; ssi < 14; ssi++) {
        var sy = spIdxLookup.getFullYear();
        var sm = (spIdxLookup.getMonth() + 1).toString().padStart(2, '0');
        var sd = spIdxLookup.getDate().toString().padStart(2, '0');
        var sk = sy + '-' + sm + '-' + sd;
        if (spyHistoricalData[sk]) {
            var swk = spyHistoricalData[sk];
            var sDaysIn = (earliestDate.getTime() - spIdxLookup.getTime()) / 86400000;
            var sProg = Math.min(1, Math.max(0, sDaysIn / 7));
            startSp500Index = (swk.open + (swk.close - swk.open) * sProg) * 10;
            break;
        }
        spIdxLookup.setDate(spIdxLookup.getDate() - 1);
    }
    if (startSp500Index === null) startSp500Index = 5700; // fallback

    // The FX rate at portfolio inception — used as the denominator for S&P ILS
    // returns.  Mirrors the portfolio cost-basis logic: prefer the user-supplied
    // investmentRate, then try the historical FX lookup, and finally fall back
    // to the current live rate.
    var spStartFXRate = investmentRate !== null
        ? investmentRate
        : getRateAtDate(earliestDate, exchangeRate);

    var cumulativeSpGrowth = 0;
    var lastRealSpyPrice   = null;
    var previousT          = null;

    // ---------- Main loop: compute each chart point ----------
    for (var si = 0; si < sortedTimestamps.length; si++) {
        var t = sortedTimestamps[si];
        var currentDate    = new Date(t);
        var isFirstPoint   = previousT === null;
        var currentStepSize = isFirstPoint ? baseStep : (t - previousT) / ONE_DAY;
        previousT = t;

        // --- Portfolio value at time t ---
        // Calculate cash deposited up to time t from deposit events
        var cashAtT = 0;
        if (cashDeposits && cashDeposits.length > 0) {
            cashDeposits.forEach(function (dep) {
                var depTime = new Date(dep.date).getTime();
                if (!isNaN(depTime) && t >= depTime) {
                    cashAtT += dep.amount;
                }
            });
        } else {
            cashAtT = cash; // fallback: use current cash if no deposit events
        }

        var currentDynCostUSD = cashAtT;
        var currentDynValUSD  = cashAtT;
        // Use the SAME rate for cash on both cost and value sides.
        // This ensures cash cancels out (like in USD mode) while the
        // stock component still captures real FX impact.
        var cashILSRate       = cashRate !== null ? cashRate : exchangeRate;
        var currentDynCostILS = cashAtT * cashILSRate;
        var currentDynValILS  = cashAtT * cashILSRate;

        positions.forEach(function (pos) {
            var stats = getPositionStats(pos);
            // Sort transactions by date to use as price anchor points
            var sortedTxns = stats.transactions.slice()
                .filter(function (txn) { return txn.date && !isNaN(new Date(txn.date).getTime()); })
                .sort(function (a, b) { return new Date(a.date).getTime() - new Date(b.date).getTime(); });

            if (sortedTxns.length === 0) return;

            // Check if we have real historical price data for this symbol
            var stockHistory = (window.stockHistoryCache && window.stockHistoryCache[pos.symbol]) || null;

            // Build price anchor timeline from transactions + current price
            var anchors = sortedTxns.map(function (txn) {
                return { time: new Date(txn.date).getTime(), price: Math.abs(txn.price) };
            });
            anchors.push({ time: today.getTime(), price: pos.currentPrice });

            // Remove duplicate times, keep last price at each time
            var uniqueAnchors = [];
            anchors.forEach(function (a) {
                var existing = uniqueAnchors.find(function (u) { return Math.abs(u.time - a.time) < 86400000; });
                if (existing) { existing.price = a.price; }
                else { uniqueAnchors.push({ time: a.time, price: a.price }); }
            });
            uniqueAnchors.sort(function (a, b) { return a.time - b.time; });

            // Look up real historical close price for a given timestamp
            var lookupRealPrice = function (time) {
                if (!stockHistory) return null;
                var searchDate = new Date(time);
                // Search backward up to 5 days to find nearest trading day
                for (var di = 0; di < 5; di++) {
                    var dk = searchDate.toISOString().split('T')[0];
                    if (stockHistory[dk] !== undefined) return stockHistory[dk];
                    searchDate.setDate(searchDate.getDate() - 1);
                }
                return null;
            };

            // Estimate price: use real historical data when available, fall back to interpolation
            var estimatePrice = function (time) {
                // Try real historical price first
                var realPrice = lookupRealPrice(time);
                if (realPrice !== null) return realPrice;

                // Fallback: piecewise interpolation between transaction anchors
                if (time <= uniqueAnchors[0].time) return uniqueAnchors[0].price;
                if (time >= uniqueAnchors[uniqueAnchors.length - 1].time) return uniqueAnchors[uniqueAnchors.length - 1].price;

                for (var i = 0; i < uniqueAnchors.length - 1; i++) {
                    if (time >= uniqueAnchors[i].time && time < uniqueAnchors[i + 1].time) {
                        var segDuration  = uniqueAnchors[i + 1].time - uniqueAnchors[i].time;
                        var segElapsed   = time - uniqueAnchors[i].time;
                        var segProgress  = segDuration > 0 ? segElapsed / segDuration : 1;
                        var basePrice    = uniqueAnchors[i].price + (uniqueAnchors[i + 1].price - uniqueAnchors[i].price) * segProgress;
                        // Add subtle noise (1.5% amplitude, decays near anchors)
                        var distFromEdge = Math.min(segProgress, 1 - segProgress) * 2;
                        var noise        = getJaggedNoise(time, i + (pos.id || 0)) * basePrice * 0.015 * distFromEdge;
                        return basePrice + noise;
                    }
                }
                return pos.currentPrice;
            };

            var estPrice = estimatePrice(t);

            // Calculate cumulative shares held at time t
            var sharesAtT = 0;
            var costAtT   = 0;
            sortedTxns.forEach(function (txn) {
                if (t >= new Date(txn.date).getTime()) {
                    sharesAtT += txn.shares;
                    costAtT   += txn.shares * txn.price;
                }
            });

            if (sharesAtT > 0 || costAtT !== 0) {
                var rateAtEarliest = getRateAtDate(sortedTxns[0].date, exchangeRate);
                var rateAtT        = getRateAtDate(t, exchangeRate);
                currentDynCostUSD += costAtT;
                currentDynCostILS += costAtT * rateAtEarliest;
                currentDynValUSD  += sharesAtT * estPrice;
                currentDynValILS  += sharesAtT * estPrice * rateAtT;
            }
        });

        var activeProfitUSD = currentDynValUSD - currentDynCostUSD;
        var activeProfitILS = currentDynValILS - currentDynCostILS;
        var absoluteValUSD  = globalBaseCostUSD + activeProfitUSD;
        var absoluteValILS  = globalBaseCostILS + activeProfitILS;

        // --- S&P 500 growth at time t ---
        var dailyGrowth = 0;
        if (!isFirstPoint) {
            var foundRealPrice = null;
            var searchDate     = new Date(t);
            // Look back up to 7 days for the nearest business day with data
            for (var di = 0; di < 7; di++) {
                var dk = searchDate.toISOString().split('T')[0];
                if (spyData && spyData.map && spyData.map[dk]) {
                    foundRealPrice = spyData.map[dk];
                    break;
                }
                searchDate.setDate(searchDate.getDate() - 1);
            }

            if (foundRealPrice !== null) {
                // Real API data available — use actual S&P growth
                if (lastRealSpyPrice !== null && lastRealSpyPrice !== foundRealPrice) {
                    var ratio = foundRealPrice / lastRealSpyPrice;
                    // Sanity check for index/ETF boundary crossovers
                    if (ratio > 2.0 && foundRealPrice / 10 < lastRealSpyPrice * 2.0) ratio = (foundRealPrice / 10) / lastRealSpyPrice;
                    else if (ratio < 0.5 && (foundRealPrice * 10) > lastRealSpyPrice * 0.5) ratio = (foundRealPrice * 10) / lastRealSpyPrice;

                    if (ratio < 0.5 || ratio > 2.0) {
                        dailyGrowth = 0.0003 * currentStepSize; // ignore impossibly large jumps
                    } else {
                        dailyGrowth = ratio - 1;
                    }
                } else if (lastRealSpyPrice === null) {
                    dailyGrowth = 0.0003 * currentStepSize; // soft connect to first real point
                }
                lastRealSpyPrice = foundRealPrice;
            } else {
                // No API data — use hardcoded weekly historical values
                var d   = new Date(t);
                var now = new Date();
                var weekData   = null;
                var weekStartD = new Date(d);
                // Search backward up to 8 days in the weekly data
                for (var wi = 0; wi < 8; wi++) {
                    var y  = weekStartD.getFullYear();
                    var m  = (weekStartD.getMonth() + 1).toString().padStart(2, '0');
                    var dd = weekStartD.getDate().toString().padStart(2, '0');
                    var weekKey = y + '-' + m + '-' + dd;
                    if (spyHistoricalData[weekKey]) {
                        weekData = spyHistoricalData[weekKey];
                        break;
                    }
                    weekStartD.setDate(weekStartD.getDate() - 1);
                }

                var projectedPrice = 4000;
                var spread = 0.04;
                var daysInPeriod = 7;

                if (weekData) {
                    spread = Math.abs((weekData.high / weekData.low) - 1) || 0.04;
                    var effectiveDays = 7;
                    if (now.getTime() - weekStartD.getTime() < 7 * 86400000) {
                        effectiveDays = Math.max(1, Math.floor((now.getTime() - weekStartD.getTime()) / 86400000));
                    }
                    var elapsedDays = (d.getTime() - weekStartD.getTime()) / 86400000;
                    var progress    = Math.min(1, Math.max(0, elapsedDays / effectiveDays));
                    projectedPrice  = weekData.open + (weekData.close - weekData.open) * progress;
                } else {
                    // Fallback if no weekly data exists
                    projectedPrice = lastRealSpyPrice !== null ? lastRealSpyPrice * 1.0003 : 4000;
                }

                var exactVolScaling = Math.max(0.001, (spread / daysInPeriod));
                var vol = getJaggedNoise(t, 99) * exactVolScaling * Math.sqrt(currentStepSize);
                var simulatedPriceWithNoise = projectedPrice * (1 + vol);

                if (lastRealSpyPrice === null) {
                    dailyGrowth = 0.0003 * currentStepSize;
                } else {
                    var ratio2 = simulatedPriceWithNoise / lastRealSpyPrice;
                    if (ratio2 > 2.0 && simulatedPriceWithNoise / 10 < lastRealSpyPrice * 2.0) ratio2 = (simulatedPriceWithNoise / 10) / lastRealSpyPrice;
                    else if (ratio2 < 0.5 && (simulatedPriceWithNoise * 10) > lastRealSpyPrice * 0.5) ratio2 = (simulatedPriceWithNoise * 10) / lastRealSpyPrice;

                    if (ratio2 < 0.5 || ratio2 > 2.0) {
                        dailyGrowth = 0.0003 * currentStepSize;
                    } else {
                        dailyGrowth = ratio2 - 1;
                    }
                }
                lastRealSpyPrice = simulatedPriceWithNoise;
            }

            cumulativeSpGrowth = (1 + cumulativeSpGrowth) * (1 + dailyGrowth) - 1;
        }

        var spGrowthBase = cumulativeSpGrowth * 100;
        var rateAtTPt    = getRateAtDate(t, exchangeRate);
        var spGrowthILS  = isFirstPoint ? 0 : (((1 + spGrowthBase / 100) * rateAtTPt) / spStartFXRate - 1) * 100;

        data.push({
            dateStr: currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }),
            timestamp: t,
            portfolioPercentUSD: globalBaseCostUSD > 0 ? parseFloat((((absoluteValUSD / globalBaseCostUSD) - 1) * 100).toFixed(2)) : 0,
            portfolioPercentILS: globalBaseCostILS > 0 ? parseFloat((((absoluteValILS / globalBaseCostILS) - 1) * 100).toFixed(2)) : 0,
            sp500PercentUSD: parseFloat(spGrowthBase.toFixed(2)),
            sp500PercentILS: parseFloat(spGrowthILS.toFixed(2)),
            absoluteValUSD: absoluteValUSD,
            absoluteValILS: absoluteValILS,
            sp500IndexValue: parseFloat((startSp500Index * (1 + cumulativeSpGrowth)).toFixed(2)),
            sp500IndexValueILS: parseFloat((startSp500Index * (1 + cumulativeSpGrowth) * rateAtTPt).toFixed(2))
        });
    }

    // ---------- Calibrate the final point (today) ----------
    if (data.length > 0) {
        var actualFinalValUSD = cash;
        var actualFinalValILS = cash * exchangeRate;

        positions.forEach(function (p) {
            var stats = getPositionStats(p);
            actualFinalValUSD += stats.totalShares * p.currentPrice;
            actualFinalValILS += stats.totalShares * p.currentPrice * exchangeRate;
        });

        // Only update absolute values for tooltip display.
        // Do NOT override portfolioPercent — the loop already computes correct
        // last-point percent using pos.currentPrice.
        data[data.length - 1].absoluteValUSD = actualFinalValUSD;
        data[data.length - 1].absoluteValILS = actualFinalValILS;

        // Calibrate S&P 500 to the latest real-time quote
        if (spyData && spyData.current && lastRealSpyPrice) {
            var finalRatio = spyData.current / lastRealSpyPrice;
            if (finalRatio > 2.0 && spyData.current / 10 < lastRealSpyPrice * 2.0) finalRatio = (spyData.current / 10) / lastRealSpyPrice;
            else if (finalRatio < 0.5 && (spyData.current * 10) > lastRealSpyPrice * 0.5) finalRatio = (spyData.current * 10) / lastRealSpyPrice;

            var finalGrowth = finalRatio - 1;
            if (finalRatio < 0.5 || finalRatio > 2.0) finalGrowth = 0;

            cumulativeSpGrowth = (1 + cumulativeSpGrowth) * (1 + finalGrowth) - 1;
            var finalSpGrowthBase = cumulativeSpGrowth * 100;
            var finalRateAtEnd    = getRateAtDate(today, exchangeRate);
            var finalSpGrowthILS  = (((1 + finalSpGrowthBase / 100) * finalRateAtEnd) / spStartFXRate - 1) * 100;

            data[data.length - 1].sp500PercentUSD = parseFloat(finalSpGrowthBase.toFixed(2));
            data[data.length - 1].sp500PercentILS = parseFloat(finalSpGrowthILS.toFixed(2));
            data[data.length - 1].sp500IndexValue = parseFloat((startSp500Index * (1 + cumulativeSpGrowth)).toFixed(2));
            data[data.length - 1].sp500IndexValueILS = parseFloat((startSp500Index * (1 + cumulativeSpGrowth) * finalRateAtEnd).toFixed(2));
        }
    }

    return data;
};
