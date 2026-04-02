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
                )
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
                var dailyPct = pos.dailyChangePercent;
                var dailyVal = pos.dailyChange !== undefined && pos.dailyChange !== null ? pos.dailyChange * stats.totalShares * rateNow : null;

                return h('div', { key: pos.id, className: 'bg-gray-800/40 rounded-xl p-4 border border-gray-700/40' },
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
                    // Row 2: Daily + Profit
                    h('div', { className: 'flex items-center justify-between text-xs' },
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
                    ),
                    // Weight bar
                    h('div', { className: 'mt-2.5 w-full h-1 bg-gray-700/40 rounded-full overflow-hidden' },
                        h('div', { className: 'h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all', style: { width: weight + '%' } })
                    ),
                    // Actions
                    h('div', { className: 'flex items-center justify-end gap-3 mt-2 pt-2 border-t border-gray-700/30' },
                        h('button', { onClick: function () { ctx.startEditingStock(pos); }, className: 'text-xs text-gray-500 hover:text-portfolio flex items-center gap-1' }, h(window.IconEdit), ' ערוך'),
                        h('button', { onClick: function () { ctx.removePosition(pos.id); }, className: 'text-xs text-gray-500 hover:text-red-400 flex items-center gap-1' }, h(window.IconTrash), ' מחק')
                    )
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
                    h('div', { className: 'flex flex-col ' + (pos.dailyChange !== undefined && pos.dailyChange !== null ? (pos.dailyChange >= 0 ? 'text-green-400' : 'text-red-400') : 'text-gray-500'), dir: 'ltr' },
                        h('span', { className: 'font-medium text-right' }, pos.dailyChange !== undefined && pos.dailyChange !== null ? (pos.dailyChange >= 0 ? '+' : '') + fm(pos.dailyChange * stats.totalShares * rateNow) : '-'),
                        h('span', { className: 'text-xs text-right' }, pos.dailyChangePercent !== undefined && pos.dailyChangePercent !== null ? (pos.dailyChangePercent >= 0 ? '+' : '') + pos.dailyChangePercent.toFixed(2) + '%' : '-')
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

        ctx.positions.forEach(function (pos) {
            var stats = ctx.getPositionStats(pos);
            var rateAtPurchase = ctx.currency === 'ILS' ? ctx.getRateAtDate(stats.earliestDate, ctx.exchangeRate) : 1;
            var cost = stats.totalCost * rateAtPurchase;
            var value = stats.totalShares * pos.currentPrice * rateNow;
            totalValue += value;
            totalCost += cost;
            totalProfit += (value - cost);
            if (pos.dailyChange !== undefined && pos.dailyChange !== null) {
                totalDailyChange += pos.dailyChange * stats.totalShares * rateNow;
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
