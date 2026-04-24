// =====================================================================
// renderTable.js — Positions Table (mobile + desktop) & Add-Position Form
// =====================================================================
// Renders the main portfolio holdings in two responsive layouts:
//   - Mobile:  card-based view with compact stats per position
//   - Desktop: full HTML table with sortable columns, inline editing,
//              expandable transaction/dividend sub-rows
//
// Also provides the "Add Position" form and Excel import button.
//
// All functions receive a `ctx` object containing the React state values,
// setters, and helper functions (formatMoney, getPositionStats, etc.).
// =====================================================================
(function () {
    var h = React.createElement;

    // =====================================================================
    // Mobile Card View
    // =====================================================================

    /**
     * Render the mobile card-based positions list.
     * Includes a cash card at the top, one card per position sorted by
     * value, and a totals card at the bottom.
     *
     * @param {Object} ctx — app context containing:
     *   positions, cash, currency, exchangeRate, formatMoney,
     *   getPositionStats, getRateAtDate, sortDirection,
     *   isEditingCash, isAddingCash, setIsEditingCash, setIsAddingCash,
     *   tempCash, setTempCash, tempCashRate, setTempCashRate,
     *   tempAddCash, setTempAddCash, tempAddCashRate, setTempAddCashRate,
     *   tempAddCashDate, setTempAddCashDate,
     *   startEditingStock, removePosition
     * @returns {ReactElement}
     */
    window.renderMobilePositions = function (ctx) {
        var rateNow = ctx.currency === 'ILS' ? ctx.exchangeRate : 1;
        var cashValue = ctx.currency === 'ILS' ? ctx.cash * ctx.exchangeRate : ctx.cash;
        var allPositions = ctx.positions.filter(function (pos) { return ctx.getPositionStats(pos).totalShares > 0; });
        var totalPortValue = allPositions.reduce(function (sum, pos) { return sum + ctx.getPositionStats(pos).totalShares * pos.currentPrice * rateNow; }, 0) + cashValue;
        var fm = ctx.formatMoney;

        return h('div', { className: 'p-3 space-y-3' },
            // Cash Card
            h('div', { className: 'bg-gray-800/40 rounded-xl p-4 border border-gray-700/40' },
                h('div', { className: 'flex items-center justify-between' },
                    h('div', { className: 'flex items-center gap-3' },
                        h('div', { className: 'w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm' },
                            ctx.currency === 'USD' ? '$' : '₪'),
                        h('div', null,
                            h('span', { className: 'font-semibold text-gray-200 text-sm' }, 'מזומן'),
                            h('div', { className: 'text-xs text-gray-500' }, totalPortValue > 0 ? ((cashValue / totalPortValue) * 100).toFixed(1) + '% מהתיק' : '')
                        )
                    ),
                    h('div', { className: 'text-left' },
                        h('div', { className: 'font-bold text-white text-sm' }, fm(cashValue)),
                        !ctx.isEditingCash && !ctx.isAddingCash && h('div', { className: 'flex items-center gap-2 mt-1 justify-end' },
                            h('button', { onClick: function () { ctx.setIsAddingCash(true); ctx.setTempAddCash(''); ctx.setTempAddCashRate(ctx.exchangeRate.toString()); ctx.setTempAddCashDate(''); }, className: 'text-emerald-400 text-xs' }, '+ הוסף'),
                            h('button', { onClick: function () { ctx.setIsEditingCash(true); ctx.setTempCash(ctx.cash.toString()); ctx.setTempCashRate(ctx.cashRate !== null ? ctx.cashRate.toString() : ctx.exchangeRate.toString()); }, className: 'text-portfolio text-xs' }, 'ערוך')
                        )
                    )
                ),
                // Mobile cash edit form
                ctx.isEditingCash && h('div', { className: 'mt-3 pt-3 border-t border-gray-700/30' },
                    h('div', { className: 'flex items-center gap-2', dir: 'ltr' },
                        h('input', { type: 'number', step: 'any', value: ctx.tempCash, placeholder: '$', onChange: function (e) { ctx.setTempCash(e.target.value); }, className: 'flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-portfolio', autoFocus: true }),
                        h('span', { className: 'text-gray-500 text-xs' }, '@'),
                        h('input', { type: 'number', step: 'any', value: ctx.tempCashRate, placeholder: '₪ Rate', onChange: function (e) { ctx.setTempCashRate(e.target.value); }, className: 'w-20 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-portfolio' })
                    ),
                    h('div', { className: 'flex items-center justify-end gap-3 mt-2' },
                        h('button', { onClick: function () { ctx.setIsEditingCash(false); }, className: 'text-xs text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg border border-red-400/30' }, '✕ בטל'),
                        h('button', { onClick: function () { ctx.saveToDb(undefined, parseFloat(ctx.tempCash) || 0, undefined, undefined, parseFloat(ctx.tempCashRate) || ctx.exchangeRate, undefined); ctx.setIsEditingCash(false); }, className: 'text-xs text-green-400 hover:text-green-300 px-3 py-1.5 rounded-lg border border-green-400/30' }, '✓ שמור')
                    )
                ),
                // Mobile cash add form
                ctx.isAddingCash && h('div', { className: 'mt-3 pt-3 border-t border-gray-700/30' },
                    h('div', { className: 'flex items-center gap-2', dir: 'ltr' },
                        h('span', { className: 'text-emerald-400 font-bold' }, '+'),
                        h('input', { type: 'number', step: 'any', value: ctx.tempAddCash, placeholder: '$ amount', onChange: function (e) { ctx.setTempAddCash(e.target.value); }, className: 'flex-1 bg-gray-900 border border-emerald-500/50 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-emerald-400', autoFocus: true })
                    ),
                    h('div', { className: 'flex items-center gap-2 mt-2', dir: 'ltr' },
                        h('input', { type: 'date', value: ctx.tempAddCashDate, onChange: function (e) { ctx.setTempAddCashDate(e.target.value); }, className: 'flex-1 bg-gray-900 border border-emerald-500/50 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-emerald-400', style: { colorScheme: 'dark' }, title: 'תאריך להשגת השער, או השאר ריק להזנה ידנית' }),
                        h('span', { className: 'text-gray-500 text-xs' }, '@'),
                        h('input', { type: 'number', step: 'any', value: ctx.tempAddCashRate, placeholder: '₪ Rate', onChange: function (e) { ctx.setTempAddCashRate(e.target.value); }, className: 'w-20 bg-gray-900 border border-emerald-500/50 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-emerald-400' })
                    ),
                    h('div', { className: 'flex items-center justify-end gap-3 mt-2' },
                        h('button', { onClick: function () { ctx.setIsAddingCash(false); }, className: 'text-xs text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg border border-red-400/30' }, '✕ בטל'),
                        h('button', { onClick: function () { ctx.handleAddCashSubmit(); }, className: 'text-xs text-green-400 hover:text-green-300 px-3 py-1.5 rounded-lg border border-green-400/30' }, '✓ הוסף')
                    )
                ),
                // Expand deposits button (mobile)
                ctx.cashDeposits && ctx.cashDeposits.length > 1 && !ctx.isEditingCash && !ctx.isAddingCash &&
                    h('button', {
                        onClick: function () { ctx.setExpandedCash(!ctx.expandedCash); },
                        className: 'mt-2 text-xs text-emerald-400 hover:text-emerald-300 w-full text-center'
                    }, ctx.expandedCash ? '▲ הסתר הפקדות' : '▼ ' + ctx.cashDeposits.length + ' הפקדות'),
                // Expanded deposit list (mobile)
                ctx.expandedCash && ctx.cashDeposits && ctx.cashDeposits.map(function (dep) {
                    var hasRealRate = !!dep.rateManual;
                    var depRate = hasRealRate ? dep.rate : null;
                    return h('div', { key: dep.id, className: 'mt-2 pt-2 border-t border-emerald-500/20 flex items-center justify-between text-xs' },
                        h('div', { className: 'flex items-center gap-2' },
                            h('span', { className: 'text-emerald-500' }, '↳'),
                            h('span', { className: 'text-gray-400' }, dep.date),
                            depRate && h('span', { className: 'text-gray-500' }, '@₪' + depRate.toFixed(2))
                        ),
                        h('div', { className: 'flex items-center gap-2' },
                            h('span', { className: dep.amount >= 0 ? 'text-green-400 font-medium' : 'text-red-400 font-medium' },
                                (dep.amount >= 0 ? '+' : '') + fm(dep.amount)),
                            ctx.cashDeposits.length > 1 && h('button', {
                                onClick: function () { ctx.removeCashDeposit(dep.id); },
                                className: 'text-gray-500 hover:text-red-400 mr-1', title: 'מחק הפקדה'
                            }, '✕')
                        )
                    );
                })
            ),

            // Position Cards
            allPositions.slice().sort(function (a, b) {
                var valA = ctx.getPositionStats(a).totalShares * a.currentPrice * rateNow;
                var valB = ctx.getPositionStats(b).totalShares * b.currentPrice * rateNow;
                return ctx.sortDirection === 'asc' ? valA - valB : valB - valA;
            }).map(function (pos) {
                var stats = ctx.getPositionStats(pos);
                var rateAtPurchase = ctx.currency === 'ILS' ? ctx.getRateAtDate(stats.earliestDate, ctx.exchangeRate) : 1;
                var cost = stats.totalCost * rateAtPurchase;
                var value = stats.totalShares * pos.currentPrice * rateNow;
                var profit = value - cost;
                var profitPct = cost > 0 ? (profit / cost) * 100 : 0;
                var weight = totalPortValue > 0 ? ((value / totalPortValue) * 100).toFixed(1) : '0.0';
                // Separate shares bought today from pre-existing shares
                var todayStrM = (function () { var d = new Date(); return d.toISOString().split('T')[0]; })();
                var sharesTodayM = 0, costTodayM = 0;
                stats.transactions.forEach(function (t) {
                    if (t.date && t.date.substring(0, 10) === todayStrM && t.shares > 0) {
                        sharesTodayM += t.shares;
                        costTodayM += t.shares * t.price;
                    }
                });
                var avgBuyTodayM = sharesTodayM > 0 ? costTodayM / sharesTodayM : 0;
                var sharesBeforeTodayM = stats.totalShares - sharesTodayM;

                var dailyPct = pos.dailyChangePercent;
                var dailyVal = null;
                if (pos.dailyChange !== undefined && pos.dailyChange !== null) {
                    dailyVal = pos.dailyChange * sharesBeforeTodayM * rateNow;
                    if (sharesTodayM > 0) dailyVal += (pos.currentPrice - avgBuyTodayM) * sharesTodayM * rateNow;
                    var prevValM = sharesBeforeTodayM * (pos.previousClose || pos.currentPrice) + sharesTodayM * avgBuyTodayM;
                    if (prevValM > 0) dailyPct = ((stats.totalShares * pos.currentPrice - prevValM) / prevValM) * 100;
                }

                // In ILS mode, recalculate daily % to include FX movement
                if (ctx.currency === 'ILS' && pos.previousClose && pos.previousClose > 0) {
                    var yd = new Date(); yd.setDate(yd.getDate() - 1);
                    var yStr = yd.getFullYear() + '-' + String(yd.getMonth() + 1).padStart(2, '0') + '-' + String(yd.getDate()).padStart(2, '0');
                    var prevFxRate = ctx.getRateAtDate(yStr, ctx.exchangeRate);
                    var valTodayILS = pos.currentPrice * ctx.exchangeRate;
                    var valYesterdayILS = pos.previousClose * prevFxRate;
                    dailyVal = (valTodayILS - valYesterdayILS) * sharesBeforeTodayM;
                    if (sharesTodayM > 0) dailyVal += (pos.currentPrice * ctx.exchangeRate - avgBuyTodayM * prevFxRate) * sharesTodayM;
                    var blendedPrevM = sharesBeforeTodayM * valYesterdayILS + sharesTodayM * avgBuyTodayM * prevFxRate;
                    if (blendedPrevM > 0) dailyPct = ((stats.totalShares * valTodayILS - blendedPrevM) / blendedPrevM) * 100;
                }

                var isEditing = ctx.editingStockId === pos.id;

                return h('div', { key: pos.id, className: 'bg-gray-800/40 rounded-xl p-4 border border-gray-700/40' + (isEditing ? ' border-portfolio/50' : '') },
                    // Row 1: Symbol + Value
                    h('div', { className: 'flex items-center justify-between mb-3' },
                        h('div', { className: 'flex items-center gap-2.5' },
                            h('img', {
                                src: 'https://logo.clearbit.com/' + pos.symbol.toLowerCase() + '.com',
                                className: 'stock-logo',
                                onError: function (e) { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; },
                                alt: pos.symbol
                            }),
                            h('div', { className: 'stock-logo-fallback', style: { display: 'none' } }, pos.symbol.substring(0, 2)),
                            h('div', null,
                                h('div', { className: 'font-bold text-white text-sm' }, pos.symbol),
                                h('div', { className: 'text-xs text-gray-500' }, stats.totalShares + ' מניות · ' + weight + '%')
                            )
                        ),
                        h('div', { className: 'text-left' },
                            h('div', { className: 'font-bold text-white text-sm' }, fm(value)),
                            h('div', { className: 'text-xs text-gray-500', dir: 'ltr' }, '@ ' + fm(pos.currentPrice * rateNow))
                        )
                    ),
                    // Edit form (mobile)
                    isEditing
                        ? h('div', { className: 'space-y-3 mb-3' },
                            h('div', { className: 'flex items-center gap-3' },
                                h('div', { className: 'flex-1' },
                                    h('label', { className: 'text-xs text-gray-500 block mb-1' }, 'כמות מניות'),
                                    h('input', { type: 'number', step: 'any', value: ctx.editStockData.shares, onChange: function (e) { ctx.setEditStockData({ shares: e.target.value, price: ctx.editStockData.price }); }, className: 'w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-portfolio' })
                                ),
                                h('div', { className: 'flex-1' },
                                    h('label', { className: 'text-xs text-gray-500 block mb-1' }, 'מחיר קנייה'),
                                    h('input', { type: 'number', step: 'any', value: ctx.editStockData.price, onChange: function (e) { ctx.setEditStockData({ shares: ctx.editStockData.shares, price: e.target.value }); }, className: 'w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-portfolio' })
                                )
                            ),
                            h('div', { className: 'flex items-center justify-end gap-3' },
                                h('button', { onClick: function () { ctx.cancelStockEdit(); }, className: 'text-xs text-red-400 hover:text-red-300 flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-400/30' }, '✕ בטל'),
                                h('button', { onClick: function () { ctx.saveStockEdit(pos.id, stats.earliestDate); }, className: 'text-xs text-green-400 hover:text-green-300 flex items-center gap-1 px-3 py-1.5 rounded-lg border border-green-400/30' }, '✓ שמור')
                            )
                        )
                        : null,
                    // Row 2: Daily + Profit (hidden when editing)
                    !isEditing ? h('div', { className: 'flex items-center justify-between text-xs' },
                        h('div', { className: 'flex items-center gap-4' },
                            h('div', null,
                                h('span', { className: 'text-gray-500 ml-1' }, 'יומי'),
                                h('span', { className: dailyVal !== null && dailyVal >= 0 ? 'text-green-400' : 'text-red-400', dir: 'ltr' },
                                    dailyPct !== undefined && dailyPct !== null ? (dailyPct >= 0 ? '+' : '') + dailyPct.toFixed(2) + '%' : '-')
                            ),
                            h('div', null,
                                h('span', { className: 'text-gray-500 ml-1' }, 'רווח'),
                                h('span', { className: profit >= 0 ? 'text-green-400 font-medium' : 'text-red-400 font-medium', dir: 'ltr' },
                                    (profit >= 0 ? '+' : '') + profitPct.toFixed(1) + '%')
                            )
                        ),
                        h('div', { className: 'font-semibold ' + (profit >= 0 ? 'text-green-400' : 'text-red-400'), dir: 'ltr' },
                            (profit >= 0 ? '+' : '') + fm(profit))
                    ) : null,
                    // Weight bar
                    !isEditing ? h('div', { className: 'mt-2.5 w-full h-1 bg-gray-700/40 rounded-full overflow-hidden' },
                        h('div', { className: 'h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all', style: { width: weight + '%' } })
                    ) : null,
                    // Dividends
                    !isEditing ? (function () {
                        var divTotal = stats.totalDividends || 0;
                        return h('div', { className: 'flex items-center justify-between mt-2 text-xs' },
                            h('div', { className: 'flex items-center gap-2' },
                                h('span', { className: 'text-gray-500' }, 'דיבידנדים'),
                                divTotal > 0
                                    ? h('span', { className: 'text-emerald-400 font-medium' }, '+' + fm(divTotal * rateNow))
                                    : h('span', { className: 'text-gray-500' }, '-')
                            ),
                            ctx.dividendForm === pos.id
                                ? null
                                : h('button', { onClick: function () { ctx.setDividendForm(pos.id); ctx.setTempDivAmount(''); ctx.setTempDivDate(''); }, className: 'text-emerald-400 hover:text-emerald-300' }, '+ הוסף')
                        );
                    })() : null,
                    // Dividend add form (mobile)
                    !isEditing && ctx.dividendForm === pos.id ? h('div', { className: 'mt-2 flex items-center gap-2', dir: 'ltr' },
                        h('input', { type: 'number', step: 'any', placeholder: 'Total $', value: ctx.tempDivAmount, onChange: function (e) { ctx.setTempDivAmount(e.target.value); }, className: 'flex-1 bg-gray-900 border border-emerald-500/50 rounded px-2 py-1.5 text-white text-sm focus:outline-none', autoFocus: true }),
                        h('input', { type: 'date', value: ctx.tempDivDate, onChange: function (e) { ctx.setTempDivDate(e.target.value); }, className: 'flex-1 bg-gray-900 border border-emerald-500/50 rounded px-2 py-1.5 text-white text-sm focus:outline-none', style: { colorScheme: 'dark' } }),
                        h('button', { onClick: function () { ctx.handleAddDividend(pos.id); }, className: 'text-green-400 hover:text-green-300 text-sm' }, '✓'),
                        h('button', { onClick: function () { ctx.setDividendForm(null); }, className: 'text-red-400 hover:text-red-300 text-sm' }, '✕')
                    ) : null,
                    // Actions (hidden when editing)
                    !isEditing ? h('div', { className: 'flex items-center justify-end gap-3 mt-2 pt-2 border-t border-gray-700/30' },
                        h('button', { onClick: function () { ctx.startEditingStock(pos); }, className: 'text-xs text-gray-500 hover:text-portfolio flex items-center gap-1' }, h(window.IconEdit), ' ערוך'),
                        h('button', { onClick: function () { ctx.removePosition(pos.id); }, className: 'text-xs text-gray-500 hover:text-red-400 flex items-center gap-1' }, h(window.IconTrash), ' מחק')
                    ) : null
                );
            }),

            // Totals Card
            (function () {
                var totalProfit = 0, totalCost = 0;
                allPositions.forEach(function (pos) {
                    var stats = ctx.getPositionStats(pos);
                    var rateAtPurchase = ctx.currency === 'ILS' ? ctx.getRateAtDate(stats.earliestDate, ctx.exchangeRate) : 1;
                    totalCost += stats.totalCost * rateAtPurchase;
                    totalProfit += (stats.totalShares * pos.currentPrice * rateNow) - (stats.totalCost * rateAtPurchase);
                });
                return h('div', { className: 'bg-gradient-to-r from-blue-500/10 to-purple-500/5 rounded-xl p-4 border-2 border-blue-500/20' },
                    h('div', { className: 'flex items-center justify-between' },
                        h('span', { className: 'font-bold text-white text-sm' }, 'סה"כ תיק'),
                        h('span', { className: 'font-bold text-white text-base' }, fm(totalPortValue))
                    ),
                    h('div', { className: 'flex items-center justify-between mt-1 text-xs' },
                        h('span', { className: 'text-gray-400' }, 'רווח כולל'),
                        h('span', { className: 'font-semibold ' + (totalProfit >= 0 ? 'text-green-400' : 'text-red-400'), dir: 'ltr' },
                            (totalProfit >= 0 ? '+' : '') + fm(totalProfit) + ' (' + (totalCost > 0 ? (totalProfit >= 0 ? '+' : '') + ((totalProfit / totalCost) * 100).toFixed(2) + '%' : '0%') + ')')
                    )
                );
            })()
        );
    };

    // =====================================================================
    // Desktop Table — Position Rows
    // =====================================================================

    /**
     * Render a single desktop table row for a position, plus expandable
     * sub-rows for individual transactions and dividends.
     * Supports inline editing of shares/price when ctx.editingStockId matches.
     *
     * @param {Object} pos — the position object (symbol, transactions, currentPrice, etc.)
     * @param {Object} ctx — app context containing:
     *   currency, exchangeRate, formatMoney, getPositionStats, getRateAtDate,
     *   editingStockId, editStockData, setEditStockData, expandedStocks,
     *   setExpandedStocks, portfolioCurrentDisplay,
     *   dividendForm, setDividendForm, tempDivAmount, setTempDivAmount,
     *   tempDivDate, setTempDivDate, handleAddDividend, removeDividend,
     *   startEditingStock, cancelStockEdit, saveStockEdit,
     *   removePosition, removeTransaction
     * @returns {ReactElement} — a React.Fragment containing the main <tr> and optional sub-rows
     */
    window.renderDesktopPositionRow = function (pos, ctx) {
        var h = React.createElement;
        var stats = ctx.getPositionStats(pos);
        var rateAtPurchase = ctx.currency === 'ILS' ? ctx.getRateAtDate(stats.earliestDate, ctx.exchangeRate) : 1;
        var rateNow = ctx.currency === 'ILS' ? ctx.exchangeRate : 1;
        var cost = stats.totalCost * rateAtPurchase;
        var value = stats.totalShares * pos.currentPrice * rateNow;
        var profit = value - cost;
        var profitPct = cost > 0 ? (profit / cost) * 100 : 0;
        var isEditing = ctx.editingStockId === pos.id;
        var isExpanded = ctx.expandedStocks[pos.id];
        var hasManyTxns = stats.transactions.length > 1;
        var divTotal = stats.totalDividends;
        var fm = ctx.formatMoney;

        // Compute daily change values (ILS-aware)
        // For shares bought today, daily change = currentPrice - purchasePrice (not previousClose)
        var todayStr = (function () { var d = new Date(); return d.toISOString().split('T')[0]; })();
        var sharesToday = 0;
        var costTodayPerShare = 0;
        stats.transactions.forEach(function (t) {
            if (t.date && t.date.substring(0, 10) === todayStr && t.shares > 0) {
                sharesToday += t.shares;
                costTodayPerShare += t.shares * t.price;
            }
        });
        if (sharesToday > 0) costTodayPerShare = costTodayPerShare / sharesToday;
        var sharesBeforeToday = stats.totalShares - sharesToday;

        var dailyPct = pos.dailyChangePercent;
        var dailyVal = null;
        if (pos.dailyChange !== undefined && pos.dailyChange !== null) {
            // dailyChange per share = currentPrice - previousClose
            dailyVal = pos.dailyChange * sharesBeforeToday * rateNow;
            // For today's purchases: change = currentPrice - buyPrice
            if (sharesToday > 0) {
                dailyVal += (pos.currentPrice - costTodayPerShare) * sharesToday * rateNow;
            }
            // Recalculate percentage based on blended previous value
            if (sharesBeforeToday > 0 || sharesToday > 0) {
                var prevVal = sharesBeforeToday * (pos.previousClose || pos.currentPrice) + sharesToday * costTodayPerShare;
                if (prevVal > 0) dailyPct = ((stats.totalShares * pos.currentPrice - prevVal) / prevVal) * 100;
            }
        }
        if (ctx.currency === 'ILS' && pos.previousClose && pos.previousClose > 0) {
            var yd = new Date(); yd.setDate(yd.getDate() - 1);
            var yStr = yd.getFullYear() + '-' + String(yd.getMonth() + 1).padStart(2, '0') + '-' + String(yd.getDate()).padStart(2, '0');
            var prevFxRate = ctx.getRateAtDate(yStr, ctx.exchangeRate);
            var valTodayILS = pos.currentPrice * ctx.exchangeRate;
            var valYesterdayILS = pos.previousClose * prevFxRate;
            // Blend: pre-today shares use previousClose, today's shares use buy price
            dailyVal = (valTodayILS - valYesterdayILS) * sharesBeforeToday;
            if (sharesToday > 0) {
                dailyVal += (pos.currentPrice * ctx.exchangeRate - costTodayPerShare * prevFxRate) * sharesToday;
            }
            var blendedPrevILS = sharesBeforeToday * valYesterdayILS + sharesToday * costTodayPerShare * prevFxRate;
            if (blendedPrevILS > 0) dailyPct = ((stats.totalShares * valTodayILS - blendedPrevILS) / blendedPrevILS) * 100;
        }

        return React.createElement(React.Fragment, { key: pos.id },
            // Main row
            h('tr', { className: 'hover:bg-gray-800/30 transition-colors' + (isExpanded ? ' bg-gray-800/20' : '') },
                // Symbol
                h('td', { className: 'px-2 py-3' },
                    h('div', { className: 'flex items-center gap-3' },
                        h('img', { src: 'https://logo.clearbit.com/' + pos.symbol.toLowerCase() + '.com', className: 'stock-logo', onError: function (e) { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }, alt: pos.symbol }),
                        h('div', { className: 'stock-logo-fallback', style: { display: 'none' } }, pos.symbol.substring(0, 2)),
                        h('div', { className: 'flex flex-col' },
                            h('span', { className: 'font-semibold text-gray-200' }, pos.symbol),
                            hasManyTxns && h('button', {
                                onClick: function () { ctx.setExpandedStocks(function (prev) { var n = {}; for (var k in prev) n[k] = prev[k]; n[pos.id] = !prev[pos.id]; return n; }); },
                                className: 'text-xs text-portfolio hover:text-blue-400 text-right'
                            }, isExpanded ? '▲ הסתר עסקאות' : '▼ ' + stats.transactions.length + ' עסקאות')
                        )
                    )
                ),
                // Date
                h('td', { className: 'px-2 py-3 text-gray-400' }, stats.earliestDate),
                // Shares
                h('td', { className: 'px-2 py-3 text-gray-300' },
                    isEditing
                        ? h('div', { dir: 'ltr', className: 'flex justify-end' },
                            h('input', { type: 'number', step: 'any', value: ctx.editStockData.shares, onChange: function (e) { ctx.setEditStockData({ shares: e.target.value, price: ctx.editStockData.price }); }, className: 'w-20 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-portfolio' }))
                        : stats.totalShares
                ),
                // Purchase price
                h('td', { className: 'px-2 py-3 text-gray-400' },
                    isEditing
                        ? h('div', { dir: 'ltr', className: 'flex justify-end' },
                            h('input', { type: 'number', step: 'any', value: ctx.editStockData.price, onChange: function (e) { ctx.setEditStockData({ shares: ctx.editStockData.shares, price: e.target.value }); }, className: 'w-24 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-portfolio' }))
                        : fm(stats.avgPrice * rateAtPurchase)
                ),
                // Current price
                h('td', { className: 'px-2 py-3 text-gray-200 font-medium' }, fm(pos.currentPrice * rateNow)),
                // Daily change
                h('td', { className: 'px-2 py-3' },
                    h('div', { className: 'flex flex-col ' + (dailyVal !== null ? (dailyVal >= 0 ? 'text-green-400' : 'text-red-400') : 'text-gray-500'), dir: 'ltr' },
                        h('span', { className: 'font-medium text-right' }, dailyVal !== null ? (dailyVal >= 0 ? '+' : '') + fm(dailyVal) : '-'),
                        h('span', { className: 'text-xs text-right' }, dailyPct !== undefined && dailyPct !== null ? (dailyPct >= 0 ? '+' : '') + dailyPct.toFixed(2) + '%' : '-')
                    )
                ),
                // YTD
                h('td', { className: 'px-2 py-3' },
                    h('div', { className: 'flex flex-col ' + (pos.ytdPrice ? (pos.currentPrice - pos.ytdPrice >= 0 ? 'text-green-400' : 'text-red-400') : 'text-gray-500'), dir: 'ltr' },
                        h('span', { className: 'font-medium text-right' }, pos.ytdPrice ? (pos.currentPrice - pos.ytdPrice >= 0 ? '+' : '') + fm((pos.currentPrice - pos.ytdPrice) * stats.totalShares * rateNow) : '-'),
                        h('span', { className: 'text-xs text-right' }, pos.ytdPrice > 0 ? (pos.currentPrice - pos.ytdPrice >= 0 ? '+' : '') + (((pos.currentPrice - pos.ytdPrice) / pos.ytdPrice) * 100).toFixed(2) + '%' : '-')
                    )
                ),
                // Dividends
                h('td', { className: 'px-2 py-3' },
                    h('div', { className: 'flex flex-col items-end' },
                        divTotal > 0 ? h('span', { className: 'text-emerald-400 font-medium' }, '+' + fm(divTotal * rateNow)) : h('span', { className: 'text-gray-500' }, '-'),
                        ctx.dividendForm === pos.id
                            ? h('div', { className: 'flex items-center gap-1 mt-1', dir: 'ltr' },
                                h('input', { type: 'number', step: 'any', placeholder: 'Total $', value: ctx.tempDivAmount, onChange: function (e) { ctx.setTempDivAmount(e.target.value); }, className: 'w-20 bg-gray-900 border border-emerald-500/50 rounded px-1 py-0.5 text-white text-xs focus:outline-none' }),
                                h('input', { type: 'date', value: ctx.tempDivDate, onChange: function (e) { ctx.setTempDivDate(e.target.value); }, className: 'w-24 bg-gray-900 border border-emerald-500/50 rounded px-1 py-0.5 text-white text-xs focus:outline-none', style: { colorScheme: 'dark' } }),
                                h('button', { onClick: function () { ctx.handleAddDividend(pos.id); }, className: 'text-green-400 hover:text-green-300 text-xs' }, '✓'),
                                h('button', { onClick: function () { ctx.setDividendForm(null); }, className: 'text-red-400 hover:text-red-300 text-xs' }, '✕'))
                            : h('button', {
                                onClick: function () { ctx.setDividendForm(pos.id); ctx.setTempDivAmount(''); ctx.setTempDivDate(''); },
                                className: 'text-xs text-emerald-400 hover:text-emerald-300 mt-0.5'
                            }, '+ הוסף')
                    )
                ),
                // Value
                h('td', { className: 'px-2 py-3 font-bold text-white' }, fm(value)),
                // Weight
                h('td', { className: 'px-2 py-3' },
                    h('div', { className: 'flex flex-col gap-1' },
                        h('span', { className: 'text-gray-300 font-medium text-xs' },
                            ctx.portfolioCurrentDisplay > 0 ? ((value / ctx.portfolioCurrentDisplay) * 100).toFixed(2) + '%' : '0.00%'),
                        h('div', { className: 'weight-bar-container' },
                            h('div', { className: 'weight-bar-fill', style: { width: (ctx.portfolioCurrentDisplay > 0 ? Math.min(((value / ctx.portfolioCurrentDisplay) * 100), 100) : 0) + '%' } }))
                    )
                ),
                // Profit
                h('td', { className: 'px-2 py-3' },
                    h('div', { className: 'flex flex-col ' + (profit >= 0 ? 'text-green-400' : 'text-red-400') },
                        h('span', { className: 'font-medium' }, (profit >= 0 ? '+' : '') + fm(profit)),
                        h('span', { className: 'text-xs' }, (profitPct >= 0 ? '+' : '') + profitPct.toFixed(2) + '%')
                    )
                ),
                // Actions
                h('td', { className: 'px-2 py-3 text-center' },
                    isEditing
                        ? h('div', { className: 'flex items-center justify-center gap-3' },
                            h('button', { onClick: function () { ctx.saveStockEdit(pos.id, stats.earliestDate); }, className: 'text-green-400 hover:text-green-300', title: 'שמור' }, '✓'),
                            h('button', { onClick: ctx.cancelStockEdit, className: 'text-red-400 hover:text-red-300', title: 'בטל' }, '✕'))
                        : h('div', { className: 'flex items-center justify-center gap-2' },
                            h('button', { onClick: function () { ctx.startEditingStock(pos); }, className: 'p-2 text-gray-500 hover:text-portfolio hover:bg-blue-500/10 rounded-lg transition-colors', title: 'ערוך' }, h(window.IconEdit)),
                            h('button', { onClick: function () { ctx.removePosition(pos.id); }, className: 'p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors', title: 'מחק' }, h(window.IconTrash)))
                )
            ),

            // Expanded transaction rows
            isExpanded && stats.transactions.map(function (txn) {
                var txnRateAtPurchase = ctx.currency === 'ILS' ? ctx.getRateAtDate(txn.date, ctx.exchangeRate) : 1;
                var txnCost = txn.shares * txn.price * txnRateAtPurchase;
                var txnValue = txn.shares * pos.currentPrice * rateNow;
                var txnProfit = txnValue - txnCost;
                return h('tr', { key: txn.id, className: 'bg-gray-800/40 border-r-2 border-portfolio/30' },
                    h('td', { className: 'px-2 py-2 text-xs text-gray-500' }, '↳ עסקה'),
                    h('td', { className: 'px-2 py-2 text-xs text-gray-500' }, txn.date),
                    h('td', { className: 'px-2 py-2 text-xs text-gray-400' }, txn.shares),
                    h('td', { className: 'px-2 py-2 text-xs text-gray-500' }, fm(txn.price * txnRateAtPurchase)),
                    h('td', { className: 'px-2 py-2 text-xs text-gray-500' }, '-'),
                    h('td', { className: 'px-2 py-2 text-xs text-gray-500' }, '-'),
                    h('td', { className: 'px-2 py-2 text-xs text-gray-500' }, '-'),
                    h('td', { className: 'px-2 py-2 text-xs text-gray-500' }, '-'),
                    h('td', { className: 'px-2 py-2 text-xs font-bold text-gray-300' }, fm(txnValue)),
                    h('td', { className: 'px-2 py-2 text-xs text-gray-500' }, '-'),
                    h('td', { className: 'px-2 py-2 text-xs' },
                        h('span', { className: txnProfit >= 0 ? 'text-green-400' : 'text-red-400' }, (txnProfit >= 0 ? '+' : '') + fm(txnProfit))),
                    h('td', { className: 'px-2 py-2 text-center' },
                        stats.transactions.length > 1
                            ? h('button', { onClick: function () { ctx.removeTransaction(pos.id, txn.id); }, className: 'text-xs text-gray-500 hover:text-red-400', title: 'מחק עסקה' }, '✕')
                            : null)
                );
            }),

            // Expanded dividend rows
            isExpanded && (pos.dividends || []).length > 0 && (pos.dividends || []).map(function (div) {
                return h('tr', { key: div.id, className: 'bg-emerald-900/10 border-r-2 border-emerald-500/30' },
                    h('td', { className: 'px-2 py-2 text-xs text-emerald-500', colSpan: 3 }, '💰 דיבידנד ' + div.date),
                    h('td', { className: 'px-2 py-2 text-xs text-emerald-400', colSpan: 2 }, div.amountPerShare ? ('$' + div.amountPerShare.toFixed(4) + '/share') : ('$' + (div.amount || 0).toFixed(2))),
                    h('td', { className: 'px-2 py-2 text-xs text-emerald-400 font-medium', colSpan: 5 }, '+' + fm((div.totalAmount || div.amount || 0) * rateNow)),
                    h('td', { className: 'px-2 py-2' }, ''),
                    h('td', { className: 'px-2 py-2 text-center' },
                        h('button', { onClick: function () { ctx.removeDividend(pos.id, div.id); }, className: 'text-xs text-gray-500 hover:text-red-400' }, '✕'))
                );
            })
        );
    };

    // =====================================================================
    // Desktop Table — Totals Row
    // =====================================================================

    /**
     * Render the bottom "totals" row of the desktop positions table.
     * Aggregates total value, daily change, and overall profit across
     * all positions plus cash.
     *
     * @param {Object} ctx — app context containing:
     *   positions, cash, currency, exchangeRate, formatMoney,
     *   getPositionStats, getRateAtDate
     * @returns {ReactElement} — a single <tr> with summary columns
     */
    window.renderDesktopTotalsRow = function (ctx) {
        var h = React.createElement;
        var rateNow = ctx.currency === 'ILS' ? ctx.exchangeRate : 1;
        var totalDailyChange = 0;
        var totalValue = ctx.currency === 'ILS' ? ctx.cash * ctx.exchangeRate : ctx.cash;
        var totalProfit = 0;
        var totalCost = 0;
        var fm = ctx.formatMoney;

        var prevFxRate = rateNow;
        if (ctx.currency === 'ILS') {
            var yd2 = new Date(); yd2.setDate(yd2.getDate() - 1);
            var yStr2 = yd2.getFullYear() + '-' + String(yd2.getMonth() + 1).padStart(2, '0') + '-' + String(yd2.getDate()).padStart(2, '0');
            prevFxRate = ctx.getRateAtDate(yStr2, ctx.exchangeRate);
        }

        var todayStr2 = (function () { var d = new Date(); return d.toISOString().split('T')[0]; })();
        ctx.positions.forEach(function (pos) {
            var stats = ctx.getPositionStats(pos);
            var rateAtPurchase = ctx.currency === 'ILS' ? ctx.getRateAtDate(stats.earliestDate, ctx.exchangeRate) : 1;
            var cost = stats.totalCost * rateAtPurchase;
            var value = stats.totalShares * pos.currentPrice * rateNow;
            totalValue += value;
            totalCost += cost;
            totalProfit += (value - cost);

            // Separate shares bought today from pre-existing shares
            var sTod = 0, cTod = 0;
            stats.transactions.forEach(function (t) {
                if (t.date && t.date.substring(0, 10) === todayStr2 && t.shares > 0) {
                    sTod += t.shares;
                    cTod += t.shares * t.price;
                }
            });
            var sBefore = stats.totalShares - sTod;
            var avgBuyToday = sTod > 0 ? cTod / sTod : 0;

            if (ctx.currency === 'ILS' && pos.previousClose && pos.previousClose > 0) {
                totalDailyChange += (pos.currentPrice * ctx.exchangeRate - pos.previousClose * prevFxRate) * sBefore;
                if (sTod > 0) totalDailyChange += (pos.currentPrice * ctx.exchangeRate - avgBuyToday * prevFxRate) * sTod;
            } else if (pos.dailyChange !== undefined && pos.dailyChange !== null) {
                totalDailyChange += pos.dailyChange * sBefore * rateNow;
                if (sTod > 0) totalDailyChange += (pos.currentPrice - avgBuyToday) * sTod * rateNow;
            }
        });

        var cashVal = ctx.currency === 'ILS' ? ctx.cash * ctx.exchangeRate : ctx.cash;
        var stocksOnly = totalValue - cashVal;
        var dailyPct = stocksOnly > 0 ? ((totalDailyChange / (stocksOnly - totalDailyChange)) * 100).toFixed(2) + '%' : '';

        return h('tr', { className: 'totals-row font-bold' },
            h('td', { className: 'px-2 py-3 text-white text-base' }, '📊 סה"כ'),
            h('td', { className: 'px-2 py-3' }, ''),
            h('td', { className: 'px-2 py-3' }, ''),
            h('td', { className: 'px-2 py-3' }, ''),
            h('td', { className: 'px-2 py-3' }, ''),
            h('td', { className: 'px-2 py-3' },
                h('div', { className: 'flex flex-col ' + (totalDailyChange >= 0 ? 'text-green-400' : 'text-red-400'), dir: 'ltr' },
                    h('span', { className: 'font-bold text-right' }, (totalDailyChange >= 0 ? '+' : '') + fm(totalDailyChange)),
                    h('span', { className: 'text-xs text-right' }, dailyPct)
                )
            ),
            h('td', { className: 'px-2 py-3' }, ''),
            h('td', { className: 'px-2 py-3' }, ''),
            h('td', { className: 'px-2 py-3 text-white' }, fm(totalValue)),
            h('td', { className: 'px-2 py-3 text-gray-300' }, '100%'),
            h('td', { className: 'px-2 py-3' },
                h('div', { className: 'flex flex-col ' + (totalProfit >= 0 ? 'text-green-400' : 'text-red-400') },
                    h('span', { className: 'font-bold' }, (totalProfit >= 0 ? '+' : '') + fm(totalProfit)),
                    h('span', { className: 'text-xs' }, totalCost > 0 ? (totalProfit >= 0 ? '+' : '') + ((totalProfit / totalCost) * 100).toFixed(2) + '%' : '')
                )
            ),
            h('td', { className: 'px-2 py-3' }, '')
        );
    };

    // =====================================================================
    // Add Position Form + Excel Import
    // =====================================================================

    /**
     * Render the "Add new position" form and the Excel import button.
     * The form collects symbol, shares, purchase price, date, and
     * optional commission. The Excel import accepts .xlsx/.xls/.csv files.
     *
     * @param {Object} ctx — app context containing:
     *   currency, newSymbol, setNewSymbol, newShares, setNewShares,
     *   newPrice, setNewPrice, newDate, setNewDate,
     *   newCommission, setNewCommission,
     *   handleAddPosition, handleExcelImport
     * @returns {ReactElement}
     */
    window.renderAddPositionForm = function (ctx) {
        var h = React.createElement;
        var inputClass = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-portfolio text-sm';

        return h('div', { className: 'p-4 sm:p-6 bg-gray-900/50 border-t border-gray-800' },
            h('h3', { className: 'text-sm font-semibold text-gray-400 mb-4' }, 'הוסף נכס חדש'),
            h('form', { onSubmit: ctx.handleAddPosition, className: 'grid grid-cols-1 md:grid-cols-6 gap-4' },
                h('div', null, h('input', { required: true, type: 'text', placeholder: 'סמל (למשל AAPL)', value: ctx.newSymbol, onChange: function (e) { ctx.setNewSymbol(e.target.value); }, className: inputClass })),
                h('div', null, h('input', { required: true, type: 'number', step: 'any', placeholder: 'כמות מניות', value: ctx.newShares, onChange: function (e) { ctx.setNewShares(e.target.value); }, className: inputClass })),
                h('div', null, h('input', { required: true, type: 'number', step: 'any', placeholder: 'שער קנייה ב-' + ctx.currency, value: ctx.newPrice, onChange: function (e) { ctx.setNewPrice(e.target.value); }, className: inputClass })),
                h('div', null, h('input', { required: true, type: 'date', value: ctx.newDate, onChange: function (e) { ctx.setNewDate(e.target.value); }, className: inputClass + ' custom-date-input', style: { colorScheme: 'dark' } })),
                h('div', null, h('input', { type: 'number', step: 'any', min: '0', placeholder: 'עמלה ב-' + ctx.currency, value: ctx.newCommission, onChange: function (e) { ctx.setNewCommission(e.target.value); }, className: inputClass })),
                h('div', null, h('button', { type: 'submit', className: 'w-full bg-portfolio hover:bg-blue-600 text-white font-medium rounded-lg px-4 py-2.5 transition-colors shadow-lg shadow-blue-500/20' }, 'הוסף לתיק'))
            ),
            // Excel Import
            h('div', { className: 'mt-4 pt-4 border-t border-gray-700/50 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4' },
                h('label', { className: 'cursor-pointer flex items-center gap-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-lg px-4 py-2.5 transition-colors text-sm font-medium' },
                    h('span', null, '📥 ייבוא מאקסל'),
                    h('input', { type: 'file', accept: '.xlsx,.xls,.csv', onChange: ctx.handleExcelImport, className: 'hidden' })
                ),
                h('span', { className: 'text-xs text-gray-500' }, 'העלה קובץ XLSX עם פירוט תנועות (תאריך, סוג פעולה, שם הנייר, כמות, מחיר)')
            )
        );
    };
})();
