// =====================================================================
// renderPanels.js — Settings Panel, Summary Cards & Tax Section (no JSX)
// =====================================================================
// Three top-level UI sections rendered above the positions table:
//   1. Settings Panel   — API key, exchange rate, anonymous-user import
//   2. Summary Cards    — 4-card row (portfolio value, daily P&L, total
//                         profit, YTD return)
//   3. Tax Section      — collapsible panel showing estimated dividend
//                         withholding tax and realized capital-gains tax
//
// All functions receive a `ctx` object containing the React state values,
// setters, and helper functions they need (formatMoney, exchangeRate, etc.).
// =====================================================================
(function () {
    var h = React.createElement;

    // ---- Backup restore section (own component so React hooks work) ----
    function BackupSection(props) {
        var ctx = props.ctx;
        var stateLatest = React.useState(null);
        var latest = stateLatest[0], setLatest = stateLatest[1];
        var stateLoading = React.useState(false);
        var loading = stateLoading[0], setLoading = stateLoading[1];
        var stateConfirm = React.useState(false);
        var confirmRestore = stateConfirm[0], setConfirmRestore = stateConfirm[1];
        var stateStatus = React.useState(null);
        var status = stateStatus[0], setStatus = stateStatus[1];

        var checkLatest = async function () {
            setLoading(true); setStatus(null);
            try {
                var result = await window.loadLatestBackupFallback(
                    { user: ctx.user, dbInstance: ctx.dbInstance },
                    window.__app_id || 'default-app-id'
                );
                if (result) {
                    setLatest({
                        weekKey: result.weekKey,
                        positions: (result.data && result.data.positions) ? result.data.positions.length : 0
                    });
                } else {
                    setLatest({ empty: true });
                }
            } catch (e) {
                setStatus({ ok: false, message: String((e && e.message) || e) });
            }
            setLoading(false);
        };

        var doRestore = async function () {
            setLoading(true); setConfirmRestore(false);
            try {
                await window.restoreMainFromLatestBackup({ commit: true });
                setStatus({ ok: true, message: 'הגיבוי שוחזר. הדף ייטען מחדש...' });
                setTimeout(function () { window.location.reload(); }, 1200);
            } catch (e) {
                setStatus({ ok: false, message: String((e && e.message) || e) });
                setLoading(false);
            }
        };

        return h('div', { className: 'mt-4 border-t border-gray-700 pt-4' },
            h('label', { className: 'block text-sm text-gray-400 mb-1' }, 'שחזור מגיבוי שבועי'),
            h('p', { className: 'text-xs text-gray-500 mb-2' }, 'אם נתוני התיק נפגמו, שחזר מהגיבוי השבועי האחרון (גיבוי מלא — עסקאות, הפקדות, כל הנתונים).'),
            h('div', { className: 'flex gap-2 items-center flex-wrap' },
                h('button', {
                    onClick: checkLatest,
                    disabled: loading || !ctx.user,
                    className: 'bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white px-3 py-2 rounded-lg transition-colors text-sm whitespace-nowrap'
                }, loading ? 'טוען...' : 'בדוק גיבוי אחרון'),
                latest && !latest.empty && !confirmRestore && h('button', {
                    onClick: function () { setConfirmRestore(true); },
                    className: 'bg-yellow-600 hover:bg-yellow-500 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium whitespace-nowrap'
                }, 'שחזר'),
                confirmRestore && h('div', { className: 'flex gap-1' },
                    h('button', {
                        onClick: doRestore,
                        disabled: loading,
                        className: 'bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white px-3 py-2 rounded-lg transition-colors text-sm font-medium whitespace-nowrap'
                    }, loading ? 'משחזר...' : 'אשר שחזור'),
                    h('button', {
                        onClick: function () { setConfirmRestore(false); },
                        className: 'bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded-lg transition-colors text-sm'
                    }, 'ביטול')
                )
            ),
            latest && !latest.empty && h('p', { className: 'text-xs text-gray-400 mt-2' },
                'גיבוי אחרון: ' + latest.weekKey + ' (' + latest.positions + ' פוזיציות)'),
            latest && latest.empty && h('p', { className: 'text-xs text-yellow-400 mt-2' },
                'אין גיבויים זמינים. הם נוצרים אוטומטית בשמירה הראשונה של כל שבוע.'),
            confirmRestore && h('p', { className: 'text-xs text-yellow-400 mt-1' },
                '⚠️ פעולה זו תדרוס את נתוני main הנוכחיים.'),
            status && h('p', { className: 'text-xs mt-1 ' + (status.ok ? 'text-emerald-400' : 'text-red-400') },
                (status.ok ? '✓' : '✗') + ' ' + status.message)
        );
    }

    // =====================================================================
    // Settings Panel
    // =====================================================================

    /**
     * Render the advanced-settings panel (API key, exchange rate, portfolio import).
     *
     * @param {Object} ctx — app context containing:
     *   tempApiKey, setTempApiKey, saveToDb, apiError,
     *   exchangeRate, setExchangeRate,
     *   importUid, setImportUid, importConfirm, setImportConfirm,
     *   importLoading, setImportLoading, importStatus, setImportStatus,
     *   user, dbInstance
     * @returns {ReactElement}
     */
    window.renderSettingsPanel = function (ctx) {
        return h('div', { className: 'bg-gray-850 p-4 rounded-xl border border-gray-700 shadow-md animate-fade-in' },
            h('h3', { className: 'text-lg font-semibold mb-3 text-gray-200' }, 'הגדרות מתקדמות'),
            h('div', { className: 'grid grid-cols-1 md:grid-cols-2 gap-4' },
                // API Key
                h('div', null,
                    h('label', { className: 'block text-sm text-gray-400 mb-1' }, 'Finnhub API Key (לנתוני אמת)'),
                    h('div', { className: 'flex gap-2' },
                        h('input', {
                            type: 'password', value: ctx.tempApiKey,
                            onChange: function (e) { ctx.setTempApiKey(e.target.value.trim()); },
                            placeholder: 'הכנס מפתח API כאן...',
                            className: 'w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-portfolio transition-colors'
                        }),
                        h('button', {
                            onClick: function () { ctx.saveToDb(undefined, undefined, ctx.tempApiKey, undefined, undefined, undefined, undefined, { manualUpdate: false }); },
                            className: 'bg-portfolio hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium whitespace-nowrap'
                        }, 'שמור והתחבר')
                    ),
                    ctx.apiError
                        ? h('p', { className: 'text-xs text-red-400 mt-1' }, ctx.apiError)
                        : h('p', { className: 'text-xs text-gray-500 mt-1' }, 'ללא מפתח יוצגו נתוני דמה (Mock Data) להמחשה. המפתח נשמר בחשבון הענן שלך.')
                ),
                // Exchange rate
                h('div', null,
                    h('label', { className: 'block text-sm text-gray-400 mb-1' }, 'שער דולר נוכחי (לחישוב שווי יומי)'),
                    h('input', {
                        type: 'number', step: '0.001', value: ctx.exchangeRate,
                        onChange: function (e) { var val = parseFloat(e.target.value); if (!isNaN(val)) ctx.setExchangeRate(val); },
                        className: 'w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-portfolio transition-colors'
                    }),
                    h('p', { className: 'text-xs text-gray-500 mt-1' }, 'נמשך אוטומטית בהתחלה, אך ניתן לדייק ידנית.')
                )
            ),

            // Import from Anonymous User
            h('div', { className: 'mt-4 border-t border-gray-700 pt-4' },
                h('label', { className: 'block text-sm text-gray-400 mb-1' }, 'ייבוא תיק מחשבון אנונימי'),
                h('p', { className: 'text-xs text-gray-500 mb-2' }, 'הדבק את ה-UID של החשבון האנונימי (מ-Firebase Console) כדי לייבא את נתוני התיק לחשבונך הנוכחי. הפעולה תדרוס את הנתונים הקיימים בחשבון הנוכחי.'),
                h('div', { className: 'flex gap-2' },
                    h('input', {
                        type: 'text', value: ctx.importUid,
                        onChange: function (e) { ctx.setImportUid(e.target.value.trim()); ctx.setImportStatus(null); ctx.setImportConfirm(false); },
                        placeholder: 'הדבק User UID כאן...',
                        className: 'w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-yellow-500 transition-colors font-mono',
                        dir: 'ltr'
                    }),
                    !ctx.importConfirm
                        ? h('button', {
                            onClick: function () { if (ctx.importUid) ctx.setImportConfirm(true); },
                            disabled: !ctx.importUid || ctx.importLoading,
                            className: 'bg-yellow-600 hover:bg-yellow-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium whitespace-nowrap'
                        }, 'ייבא')
                        : h('div', { className: 'flex gap-1' },
                            h('button', {
                                onClick: function () {
                                    ctx.setImportLoading(true);
                                    ctx.setImportConfirm(false);
                                    window.importFromAnonymousUser({ user: ctx.user, dbInstance: ctx.dbInstance }, ctx.importUid).then(function (result) {
                                        ctx.setImportStatus(result);
                                        ctx.setImportLoading(false);
                                        if (result.ok) ctx.setImportUid('');
                                    });
                                },
                                disabled: ctx.importLoading,
                                className: 'bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white px-3 py-2 rounded-lg transition-colors text-sm font-medium whitespace-nowrap'
                            }, ctx.importLoading ? 'מייבא...' : 'אשר'),
                            h('button', {
                                onClick: function () { ctx.setImportConfirm(false); },
                                className: 'bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded-lg transition-colors text-sm'
                            }, 'ביטול')
                        )
                ),
                ctx.importConfirm && h('p', { className: 'text-xs text-yellow-400 mt-1' }, '⚠️ פעולה זו תדרוס את כל הנתונים בחשבון הנוכחי. לחץ "אשר" להמשך.'),
                ctx.importStatus && h('p', { className: 'text-xs mt-1 ' + (ctx.importStatus.ok ? 'text-emerald-400' : 'text-red-400') },
                    (ctx.importStatus.ok ? '✓' : '✗') + ' ' + ctx.importStatus.message
                )
            ),

            // Restore from weekly backup
            h(BackupSection, { ctx: ctx })
        );
    };

    // =====================================================================
    // Summary Cards (4 cards row)
    // =====================================================================

    /**
     * Render the 4-card summary row: portfolio value, daily change,
     * total profit, and year-to-date return.
     *
     * @param {Object} ctx — app context containing:
     *   formatMoney, formatPercent, portfolioCurrentDisplay, exchangeRate,
     *   portfolioDailyProfit, portfolioDailyProfitPercent,
     *   portfolioProfitDisplay, portfolioProfitPercentDisplay,
     *   portfolioYtdProfit, portfolioYtdProfitPercent
     * @returns {ReactElement}
     */
    window.renderSummaryCards = function (ctx) {
        var fm = ctx.formatMoney;
        var fp = ctx.formatPercent;

        var makeCard = function (label, icon, value, subValue, valueClass, subClass, cardClass) {
            return h('div', { className: 'summary-card ' + cardClass },
                h('div', { className: 'flex items-center justify-between mb-3' },
                    h('span', { className: 'text-sm text-gray-400 font-medium' }, label),
                    h('div', { className: 'card-icon' }, icon)
                ),
                h('div', { className: 'text-lg sm:text-2xl font-bold ' + valueClass }, value),
                h('div', { className: 'text-xs mt-1 ' + subClass }, subValue)
            );
        };

        return h('div', { className: 'grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in-up' },
            // Total Value
            makeCard('שווי תיק', '💼',
                fm(ctx.portfolioCurrentDisplay),
                'שער: ₪' + ctx.exchangeRate.toFixed(2),
                'text-white', 'text-gray-500', 'card-value'),
            // Daily P&L
            makeCard('שינוי יומי',
                ctx.portfolioDailyProfit >= 0 ? '📈' : '📉',
                (ctx.portfolioDailyProfit >= 0 ? '+' : '') + fm(ctx.portfolioDailyProfit),
                fp(ctx.portfolioDailyProfitPercent),
                ctx.portfolioDailyProfit >= 0 ? 'text-green-400' : 'text-red-400',
                ctx.portfolioDailyProfitPercent >= 0 ? 'text-green-500' : 'text-red-500',
                'card-daily' + (ctx.portfolioDailyProfit < 0 ? ' negative' : '')),
            // Total Profit
            makeCard('רווח כולל',
                ctx.portfolioProfitDisplay >= 0 ? '🏆' : '📊',
                (ctx.portfolioProfitDisplay >= 0 ? '+' : '') + fm(ctx.portfolioProfitDisplay),
                fp(ctx.portfolioProfitPercentDisplay),
                ctx.portfolioProfitDisplay >= 0 ? 'text-green-400' : 'text-red-400',
                ctx.portfolioProfitPercentDisplay >= 0 ? 'text-green-500' : 'text-red-500',
                'card-total' + (ctx.portfolioProfitDisplay < 0 ? ' negative' : '')),
            // YTD
            makeCard('מתחילת שנה', '📅',
                (ctx.portfolioYtdProfit >= 0 ? '+' : '') + fm(ctx.portfolioYtdProfit),
                fp(ctx.portfolioYtdProfitPercent),
                ctx.portfolioYtdProfit >= 0 ? 'text-green-400' : 'text-red-400',
                ctx.portfolioYtdProfitPercent >= 0 ? 'text-green-500' : 'text-red-500',
                'card-ytd' + (ctx.portfolioYtdProfit < 0 ? ' negative' : ''))
        );
    };

    // =====================================================================
    // Tax Summary Section
    // =====================================================================

    /**
     * Render the collapsible tax-summary panel.
     * Shows estimated dividend withholding tax (25% US) and realised
     * capital-gains tax (25% Israeli), broken down per position.
     * Returns null if the portfolio has no dividends and no sales.
     *
     * @param {Object} ctx — app context containing:
     *   calculateTaxSummary, formatMoney, currency,
     *   showTaxSection, setShowTaxSection
     * @returns {ReactElement|null}
     */
    window.renderTaxSection = function (ctx) {
        var tax = ctx.calculateTaxSummary();
        var hasDividends = tax.dividends.grossUSD > 0;
        var hasSales = tax.capitalGains.details.length > 0;
        if (!hasDividends && !hasSales) return null;

        var fm = ctx.formatMoney;
        var currency = ctx.currency;
        var fmt = function (usd, ils) { return currency === 'ILS' ? fm(ils) : fm(usd); };

        return h('div', { className: 'tax-card relative', style: { position: 'relative' } },
            // Header (clickable)
            h('div', {
                className: 'tax-card-header flex items-center justify-between p-5',
                onClick: function () { ctx.setShowTaxSection(!ctx.showTaxSection); }
            },
                h('div', { className: 'flex items-center gap-3' },
                    h('div', { style: { width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(99, 102, 241, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' } }, '🏛️'),
                    h('div', null,
                        h('h3', { className: 'text-lg font-bold text-white', style: { margin: 0 } }, 'סיכום מסים'),
                        h('p', { className: 'text-xs text-gray-400', style: { margin: 0 } }, 'מס דיבידנדים ורווחי הון ממומשים')
                    )
                ),
                h('div', { className: 'flex items-center gap-4' },
                    h('div', { className: 'flex flex-col items-end' },
                        h('span', { className: 'text-xs text-gray-400' }, 'סה״כ מס משוער'),
                        h('span', { className: 'text-lg font-bold', style: { color: '#a78bfa' } }, fmt(tax.totalTaxUSD, tax.totalTaxILS))
                    ),
                    h('span', { className: 'text-gray-500 text-lg transition-transform', style: { transform: ctx.showTaxSection ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s' } }, '▼')
                )
            ),

            // Expanded content
            ctx.showTaxSection && h('div', { className: 'tax-content-enter px-5 pb-5' },
                // Dividend Tax
                hasDividends && h('div', { className: 'mb-4' },
                    h('div', { className: 'flex items-center gap-2 mb-3' },
                        h('span', { style: { fontSize: '14px' } }, '💰'),
                        h('h4', { className: 'text-sm font-semibold text-indigo-300' }, 'מס על דיבידנדים (ניכוי במקור ארה״ב 25%)')
                    ),
                    h('div', { style: { background: 'rgba(30, 41, 59, 0.5)', borderRadius: '12px', padding: '16px' } },
                        tax.dividends.details.map(function (d, i) {
                            return h('div', { key: i, className: 'tax-row' },
                                h('div', { className: 'flex items-center gap-2' },
                                    h('span', { className: 'text-xs font-semibold text-gray-300', style: { minWidth: '50px' } }, d.symbol),
                                    h('span', { className: 'text-xs text-gray-500' }, d.date)
                                ),
                                h('div', { className: 'flex items-center gap-4', dir: 'ltr' },
                                    h('span', { className: 'text-xs text-gray-400' }, 'ברוטו: ', h('span', { className: 'text-gray-200' }, fmt(d.grossUSD, d.grossILS))),
                                    h('span', { className: 'text-xs text-red-400' }, 'מס: -', fmt(d.withheldUSD, d.withheldILS)),
                                    h('span', { className: 'text-xs text-emerald-400 font-medium' }, 'נטו: ', fmt(d.netUSD, d.netILS))
                                )
                            );
                        }),
                        // Dividends total
                        h('div', { className: 'tax-row', style: { borderTop: '1px solid rgba(99, 102, 241, 0.2)', marginTop: '8px', paddingTop: '12px' } },
                            h('span', { className: 'text-xs font-semibold text-gray-300' }, 'סה״כ דיבידנדים'),
                            h('div', { className: 'flex items-center gap-4', dir: 'ltr' },
                                h('span', { className: 'text-xs text-gray-300' }, 'ברוטו: ', h('span', { className: 'font-semibold text-white' }, fmt(tax.dividends.grossUSD, tax.dividends.grossILS))),
                                h('span', { className: 'text-xs font-semibold text-red-400' }, 'מס: -', fmt(tax.dividends.withheldUSD, tax.dividends.withheldILS)),
                                h('span', { className: 'text-xs font-semibold text-emerald-400' }, 'נטו: ', fmt(tax.dividends.netUSD, tax.dividends.netILS))
                            )
                        )
                    )
                ),

                // Capital Gains Tax
                hasSales && h('div', { className: 'mb-4' },
                    h('div', { className: 'flex items-center gap-2 mb-3' },
                        h('span', { style: { fontSize: '14px' } }, '📊'),
                        h('h4', { className: 'text-sm font-semibold text-indigo-300' }, 'מס רווחי הון ממומשים (25%)')
                    ),
                    h('div', { style: { background: 'rgba(30, 41, 59, 0.5)', borderRadius: '12px', padding: '16px' } },
                        tax.capitalGains.details.map(function (s, i) {
                            var isGain = (currency === 'ILS' ? s.gainILS : s.gainUSD) >= 0;
                            return h('div', { key: i, className: 'tax-row' },
                                h('div', { className: 'flex items-center gap-2' },
                                    h('span', { className: 'text-xs font-semibold text-gray-300', style: { minWidth: '50px' } }, s.symbol),
                                    h('span', { className: 'text-xs text-gray-500' }, s.date),
                                    h('span', { className: 'text-xs text-gray-500' }, '(' + s.shares + ' מניות)')
                                ),
                                h('div', { className: 'flex items-center gap-4', dir: 'ltr' },
                                    h('span', { className: 'text-xs text-gray-400' }, 'תמורה: ', h('span', { className: 'text-gray-200' }, fmt(s.proceedsUSD, s.proceedsILS))),
                                    h('span', { className: 'text-xs text-gray-400' }, 'עלות: ', h('span', { className: 'text-gray-200' }, fmt(s.costBasisUSD, s.costBasisILS))),
                                    h('span', { className: 'text-xs font-medium ' + (isGain ? 'text-emerald-400' : 'text-red-400') },
                                        (isGain ? 'רווח' : 'הפסד') + ': ' + ((currency === 'ILS' ? s.gainILS : s.gainUSD) >= 0 ? '+' : '') + fmt(s.gainUSD, s.gainILS))
                                )
                            );
                        }),
                        // Capital gains total
                        h('div', { className: 'tax-row', style: { borderTop: '1px solid rgba(99, 102, 241, 0.2)', marginTop: '8px', paddingTop: '12px' } },
                            h('span', { className: 'text-xs font-semibold text-gray-300' }, 'סה״כ רווח ממומש'),
                            h('div', { className: 'flex items-center gap-4', dir: 'ltr' },
                                h('span', { className: 'text-xs font-semibold ' + ((currency === 'ILS' ? tax.capitalGains.gainILS : tax.capitalGains.gainUSD) >= 0 ? 'text-emerald-400' : 'text-red-400') },
                                    ((currency === 'ILS' ? tax.capitalGains.gainILS : tax.capitalGains.gainUSD) >= 0 ? '+' : '') + fmt(tax.capitalGains.gainUSD, tax.capitalGains.gainILS)),
                                h('span', { className: 'text-xs font-semibold text-red-400' }, 'מס: ', fmt(tax.capitalGains.taxUSD, tax.capitalGains.taxILS))
                            )
                        )
                    )
                ),

                // Total Tax
                h('div', { className: 'tax-total-row' },
                    h('div', { className: 'flex items-center justify-between' },
                        h('div', { className: 'flex items-center gap-2' },
                            h('span', { style: { fontSize: '16px' } }, '🏛️'),
                            h('span', { className: 'text-sm font-bold text-white' }, 'סה״כ חבות מס משוערת')
                        ),
                        h('div', { className: 'flex items-center gap-3' },
                            h('span', { className: 'text-lg font-bold', style: { color: '#a78bfa' } }, fmt(tax.totalTaxUSD, tax.totalTaxILS)),
                            currency === 'USD' && h('span', { className: 'text-xs text-gray-500' },
                                '(₪' + tax.totalTaxILS.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ')'),
                            currency === 'ILS' && h('span', { className: 'text-xs text-gray-500' },
                                '($' + tax.totalTaxUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ')')
                        )
                    )
                )
            )
        );
    };
})();
