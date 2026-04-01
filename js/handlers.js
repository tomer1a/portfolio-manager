// =====================================================================
// handlers.js — Form handlers for positions, dividends, cash, investments
// =====================================================================
// All functions accept a context object (ctx) containing needed state
// values and setters, plus a saveToDb callback function.
// =====================================================================

/**
 * Handle adding a new stock position.
 * @param {Event} e - Form submit event
 * @param {Object} ctx - { newSymbol, newShares, newPrice, newDate, currency, exchangeRate,
 *                         positions, cash, cashRate, apiKey, getRateAtDate, normalizeSymbol,
 *                         getPositionStats, saveToDb, setNewSymbol, setNewShares, setNewPrice, setNewDate }
 */
window.handleAddPositionLogic = async function (e, ctx) {
    e.preventDefault();
    if (!ctx.newSymbol || !ctx.newShares || !ctx.newPrice || !ctx.newDate) return;

    var rateAtAdd = ctx.currency === 'ILS' ? ctx.getRateAtDate(ctx.newDate, ctx.exchangeRate) : 1;
    var currentP = parseFloat(ctx.newPrice) / rateAtAdd;

    // Fetch live price from Finnhub
    if (ctx.apiKey) {
        try {
            var sym = ctx.normalizeSymbol(ctx.newSymbol);
            var res = await fetch('https://finnhub.io/api/v1/quote?symbol=' + sym + '&token=' + ctx.apiKey);
            if (res.ok) {
                var data = await res.json();
                if (data && data.c) currentP = data.c;
            }
        } catch (err) { console.error('Error fetching price:', err); }
    }

    var newTransaction = {
        id: 't_' + Date.now(),
        shares: parseFloat(ctx.newShares),
        price: parseFloat(ctx.newPrice) / rateAtAdd,
        date: ctx.newDate
    };

    // Check if a position already exists for this symbol
    var normalizedNewSymbol = ctx.normalizeSymbol(ctx.newSymbol);
    var existingIdx = ctx.positions.findIndex(function (p) { return ctx.normalizeSymbol(p.symbol) === normalizedNewSymbol; });

    var newPositions;
    if (existingIdx >= 0) {
        // Merge into existing position
        newPositions = ctx.positions.map(function (p, idx) {
            if (idx === existingIdx) {
                return Object.assign({}, p, {
                    transactions: (p.transactions || []).concat([newTransaction]),
                    currentPrice: currentP
                });
            }
            return p;
        });
    } else {
        var newPos = {
            id: Date.now(),
            symbol: normalizedNewSymbol,
            transactions: [newTransaction],
            currentPrice: currentP,
            dividends: []
        };
        newPositions = ctx.positions.concat([newPos]);
    }

    // Deduct from cash
    var totalCostUSD = newTransaction.shares * newTransaction.price;
    var currentCash = ctx.cash || 0;
    var newCash = currentCash - totalCostUSD;
    var newCashRate = ctx.cashRate;

    ctx.saveToDb(newPositions, newCash, undefined, undefined, newCashRate, undefined);
    ctx.setNewSymbol(''); ctx.setNewShares(''); ctx.setNewPrice(''); ctx.setNewDate('');
};

/**
 * Remove a position entirely.
 */
window.removePositionLogic = function (id, ctx) {
    var posToRemove = ctx.positions.find(function (p) { return p.id === id; });
    if (!posToRemove) return;

    // Refund the exact cost of all transactions back to cash
    var refundUSD = 0;
    var addedILS = 0;
    var txns = posToRemove.transactions || [{ shares: posToRemove.shares || 0, price: posToRemove.purchasePrice || 0, date: posToRemove.purchaseDate || '' }];
    txns.forEach(function (t) {
        var cost = t.shares * t.price;
        refundUSD += cost;
        var rDate = ctx.getRateAtDate(t.date, ctx.exchangeRate);
        addedILS += cost * rDate;
    });

    var currentCash = ctx.cash || 0;
    var newCash = currentCash + refundUSD;
    var refundRate = refundUSD > 0 ? (addedILS / refundUSD) : ctx.exchangeRate;
    var currentCashRate = ctx.cashRate !== null ? ctx.cashRate : ctx.exchangeRate;
    var newCashRate = newCash > 0 ? ((currentCash * currentCashRate) + (refundUSD * refundRate)) / newCash : ctx.exchangeRate;

    var updatedPositions = ctx.positions.filter(function (p) { return p.id !== id; });
    ctx.saveToDb(updatedPositions, newCash, undefined, undefined, newCashRate, undefined);
};

/**
 * Remove a single transaction from a position.
 */
window.removeTransactionLogic = function (posId, txnId, ctx) {
    var pos = ctx.positions.find(function (p) { return p.id === posId; });
    if (!pos) return;
    var txn = (pos.transactions || []).find(function (t) { return t.id === txnId; });
    if (!txn) return;

    var updatedPositions;
    var remainingTxns = pos.transactions.filter(function (t) { return t.id !== txnId; });
    if (remainingTxns.length === 0) {
        updatedPositions = ctx.positions.filter(function (p) { return p.id !== posId; });
    } else {
        updatedPositions = ctx.positions.map(function (p) {
            return p.id === posId ? Object.assign({}, p, { transactions: remainingTxns }) : p;
        });
    }

    // Refund this transaction's cost to cash
    var refundUSD = txn.shares * txn.price;
    var rDate = ctx.getRateAtDate(txn.date, ctx.exchangeRate);
    var refundILS = refundUSD * rDate;
    var currentCash = ctx.cash || 0;
    var newCash = currentCash + refundUSD;
    var refundRate = refundUSD > 0 ? (refundILS / refundUSD) : ctx.exchangeRate;
    var currentCashRate = ctx.cashRate !== null ? ctx.cashRate : ctx.exchangeRate;
    var newCashRate = newCash > 0 ? ((currentCash * currentCashRate) + (refundUSD * refundRate)) / newCash : ctx.exchangeRate;

    ctx.saveToDb(updatedPositions, newCash, undefined, undefined, newCashRate, undefined);
};

/**
 * Save an edited stock position.
 */
window.saveStockEditLogic = function (id, originalDate, ctx) {
    var rateAtPurchase = ctx.currency === 'ILS' ? ctx.getRateAtDate(originalDate, ctx.exchangeRate) : 1;
    var editedShares = parseFloat(ctx.editStockData.shares);
    var editedPriceUSD = parseFloat(ctx.editStockData.price) / rateAtPurchase;

    if (isNaN(editedShares) || isNaN(editedPriceUSD)) return;

    var updatedPositions = ctx.positions.map(function (p) {
        return p.id === id ? Object.assign({}, p, { transactions: [{ id: 't_' + Date.now(), shares: editedShares, price: editedPriceUSD, date: originalDate }] }) : p;
    });
    ctx.saveToDb(updatedPositions, undefined, undefined, undefined, undefined, undefined);
    ctx.setEditingStockId(null);
};

/**
 * Add a dividend to a position.
 */
window.handleAddDividendLogic = function (posId, ctx) {
    var amount = parseFloat(ctx.tempDivAmount);
    if (!amount || !ctx.tempDivDate) return;
    var pos = ctx.positions.find(function (p) { return p.id === posId; });
    if (!pos) return;
    var stats = ctx.getPositionStats(pos);

    var divTotalUSD = amount; // User enters total dividend amount directly
    var amountPerShare = stats.totalShares > 0 ? amount / stats.totalShares : 0;
    var newDiv = { id: 'd_' + Date.now(), amountPerShare: amountPerShare, totalAmount: divTotalUSD, date: ctx.tempDivDate };

    var updatedPositions = ctx.positions.map(function (p) {
        return p.id === posId ? Object.assign({}, p, { dividends: (p.dividends || []).concat([newDiv]) }) : p;
    });

    // Add dividend to cash (net after 25% US withholding tax)
    var TAX_RATE_DIV = 0.25;
    var divNetUSD = divTotalUSD * (1 - TAX_RATE_DIV);
    var currentCash = ctx.cash || 0;
    var newCash = currentCash + divNetUSD;
    var newCashRate = ctx.cashRate !== null ? ctx.cashRate : ctx.exchangeRate;
    var rRate = ctx.currency === 'ILS' ? ctx.getRateAtDate(ctx.tempDivDate, ctx.exchangeRate) : 1;

    if (newCash > 0 && divNetUSD > 0) {
        newCashRate = ((currentCash * newCashRate) + (divNetUSD * rRate)) / newCash;
    }

    ctx.saveToDb(updatedPositions, newCash, undefined, undefined, newCashRate, undefined);
    ctx.setDividendForm(null);
    ctx.setTempDivAmount('');
    ctx.setTempDivDate('');
};

/**
 * Remove a dividend from a position.
 */
window.removeDividendLogic = function (posId, divId, ctx) {
    var divAmountToRemove = 0;
    var updatedPositions = ctx.positions.map(function (p) {
        if (p.id === posId) {
            var divToRemove = (p.dividends || []).find(function (d) { return d.id === divId; });
            if (divToRemove) divAmountToRemove = divToRemove.totalAmount;
            return Object.assign({}, p, { dividends: (p.dividends || []).filter(function (d) { return d.id !== divId; }) });
        }
        return p;
    });

    var currentCash = ctx.cash || 0;
    var newCash = currentCash - divAmountToRemove;
    var newCashRate = ctx.cashRate !== null ? ctx.cashRate : ctx.exchangeRate;
    ctx.saveToDb(updatedPositions, newCash, undefined, undefined, newCashRate, undefined);
};

/**
 * Handle adding cash.
 */
window.handleAddCashLogic = function (ctx) {
    var addedAmount = parseFloat(ctx.tempAddCash);
    var addedRate = parseFloat(ctx.tempAddCashRate);

    if (ctx.tempAddCashDate) {
        addedRate = ctx.getRateAtDate(ctx.tempAddCashDate, ctx.exchangeRate);
    } else if (isNaN(addedRate)) {
        addedRate = ctx.exchangeRate;
    }

    if (!isNaN(addedAmount) && addedAmount !== 0) {
        var currentCash = ctx.cash || 0;
        var currentCashRate = ctx.cashRate !== null ? ctx.cashRate : ctx.exchangeRate;
        var newCash = currentCash + addedAmount;
        var newCashRate = currentCashRate;

        if (newCash > 0) {
            if (addedAmount > 0) {
                newCashRate = ((currentCash * currentCashRate) + (addedAmount * addedRate)) / newCash;
            }
        } else { newCashRate = ctx.exchangeRate; }

        ctx.saveToDb(undefined, newCash, undefined, undefined, newCashRate, undefined);
    }
    ctx.setIsAddingCash(false);
};

/**
 * Handle adding investment.
 */
window.handleAddInvLogic = function (ctx) {
    var addedAmount = parseFloat(ctx.tempAddInv);
    var addedRate = parseFloat(ctx.tempAddInvRate);

    if (ctx.tempAddInvDate) {
        addedRate = ctx.getRateAtDate(ctx.tempAddInvDate, ctx.exchangeRate);
    } else if (isNaN(addedRate)) {
        addedRate = ctx.exchangeRate;
    }

    if (!isNaN(addedAmount) && addedAmount !== 0) {
        var currentInv = ctx.initialInvestment;
        var currentInvRate = ctx.investmentRate !== null ? ctx.investmentRate : ctx.exchangeRate;

        if (currentInv === null) {
            var dCostUSD = ctx.cash;
            var dCostILS = ctx.cash * (ctx.cashRate !== null ? ctx.cashRate : ctx.exchangeRate);
            ctx.positions.forEach(function (pos) {
                var rP = ctx.getRateAtDate(pos.purchaseDate, ctx.exchangeRate);
                dCostUSD += pos.shares * pos.purchasePrice;
                dCostILS += pos.shares * pos.purchasePrice * rP;
            });
            currentInv = dCostUSD;
            currentInvRate = dCostUSD > 0 ? (dCostILS / dCostUSD) : ctx.exchangeRate;
        }

        var newInv = currentInv + addedAmount;
        var newInvRate = currentInvRate;
        if (newInv > 0) {
            newInvRate = ((currentInv * currentInvRate) + (addedAmount * addedRate)) / newInv;
        } else { newInvRate = ctx.exchangeRate; }

        // Also add to cash
        var currentCash = ctx.cash || 0;
        var newCash = currentCash + addedAmount;
        var newCashRate = ctx.cashRate !== null ? ctx.cashRate : ctx.exchangeRate;
        if (newCash > 0 && addedAmount > 0) {
            newCashRate = ((currentCash * newCashRate) + (addedAmount * addedRate)) / newCash;
        }

        ctx.saveToDb(undefined, newCash, undefined, newInv, newCashRate, newInvRate);
    }
    ctx.setIsAddingInv(false);
};