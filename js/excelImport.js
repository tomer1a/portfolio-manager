// =====================================================================
// excelImport.js — Excel (XLSX/CSV) Import Logic
// =====================================================================
// Parses an uploaded Excel file, identifies header columns, extracts
// buy/sell/deposit/dividend transactions, and returns structured data.
// The actual file-picker and Firebase save are handled in the App
// component; this function focuses on parsing and data extraction.
// =====================================================================

/**
 * Parse an uploaded Excel file and extract portfolio transactions.
 *
 * @param {File}   file           — the File object from an <input type="file">
 * @param {string} apiKey         — Finnhub API key (used to fetch current prices)
 * @param {Function} normalizeSymbol — ticker alias resolver
 * @returns {Promise<Object|null>} — parsed data or null if user cancelled / error
 *   Resolved Object shape:
 *   {
 *     newPositions:   Array<Object>,
 *     finalCash:      number|null,
 *     totalDeposits:  number,
 *     depositEvents:  Array<{id, amount, date}>,
 *     summary:        string   // user-facing confirmation message
 *   }
 */
window.parseExcelFile = async function (file, apiKey, normalizeSymbol) {
    // Helper: parse a cell that might contain currency symbols, dashes, or blanks
    var parseNum = function (val) {
        if (val === undefined || val === null || val === '' || val === '-') return 0;
        var cleaned = val.toString().replace(/[\$,₪\s]/g, '').trim();
        if (cleaned === '' || cleaned === '-') return 0;
        return parseFloat(cleaned) || 0;
    };

    var fileData = await file.arrayBuffer();
    var workbook = XLSX.read(fileData, { type: 'array' });
    var sheet    = workbook.Sheets[workbook.SheetNames[0]];
    var allRows  = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    // ---------- Find header row dynamically ----------
    var headerIdx = -1;
    var colMap = {};
    for (var i = 0; i < Math.min(allRows.length, 10); i++) {
        var row = allRows[i];
        if (!row) continue;
        var cells = Array.from(row, function (c) {
            return (c === undefined || c === null ? '' : c).toString().trim();
        });
        var hasDate   = cells.findIndex(function (c) { return c === 'תאריך'; });
        var hasAction = cells.findIndex(function (c) { return c.includes('סוג'); });
        if (hasDate >= 0 && hasAction >= 0) {
            headerIdx = i;
            cells.forEach(function (c, j) {
                if (c === 'תאריך')              colMap.date   = j;
                else if (c.includes('סוג'))     colMap.action = j;
                else if (c.includes('נייר'))    colMap.symbol = j;
                else if (c === 'כמות' || c === 'במות') colMap.qty = j;
                else if (c.includes('מחיר'))    colMap.price  = j;
                else if (c.includes('סכום'))    colMap.amount = j;
                else if (c.includes('עמלה'))    colMap.fee    = j;
                else if (c.includes('יתר'))     colMap.cash   = j;
            });
            break;
        }
    }

    if (headerIdx < 0) {
        throw new Error('Header row not found.\nRequired columns: date, action type, stock name, quantity, price');
    }

    console.log('Excel: header row', headerIdx, colMap);
    var dataRows = allRows.slice(headerIdx + 1).filter(function (r) { return r && r.length > 0; });
    if (dataRows.length === 0) throw new Error('No data rows found in the file');

    // ---------- Process each row ----------
    var posMap        = {};
    var finalCash     = null;
    var totalDeposits = 0;
    var depositEvents = [];
    var buyCount = 0, sellCount = 0, divCount = 0, depositCount = 0;

    dataRows.forEach(function (row, idx) {
        var action  = colMap.action !== undefined ? (row[colMap.action] || '').toString().trim() : '';
        var symbol  = colMap.symbol !== undefined ? normalizeSymbol((row[colMap.symbol] || '').toString().trim()) : '';
        var qty     = colMap.qty    !== undefined ? parseNum(row[colMap.qty]) : 0;
        var price   = colMap.price  !== undefined ? parseNum(row[colMap.price]) : 0;
        var amount  = colMap.amount !== undefined ? parseNum(row[colMap.amount]) : 0;
        var cashBal = colMap.cash   !== undefined ? parseNum(row[colMap.cash]) : NaN;
        var dateRawVal = colMap.date !== undefined ? row[colMap.date] : '';

        // --- Normalize date ---
        var dateStr = '';
        if (dateRawVal instanceof Date) {
            dateStr = dateRawVal.toISOString().split('T')[0];
        } else if (typeof dateRawVal === 'number' && dateRawVal > 30000) {
            // Excel serial date number (days since 1900-01-01)
            var excelEpoch = new Date(1899, 11, 30);
            var jsDate = new Date(excelEpoch.getTime() + dateRawVal * 86400000);
            dateStr = jsDate.toISOString().split('T')[0];
        } else if (dateRawVal) {
            var raw = dateRawVal.toString().trim();
            var parts = raw.split(/[.\\/\-]/);
            if (parts.length === 3) {
                var a = parts[0], b = parts[1], c = parts[2];
                if (a.length === 4) {
                    dateStr = a + '-' + b.padStart(2, '0') + '-' + c.padStart(2, '0');
                } else {
                    dateStr = c + '-' + b.padStart(2, '0') + '-' + a.padStart(2, '0');
                }
            }
        }

        // Track latest cash balance from the spreadsheet
        if (!isNaN(cashBal) && cashBal !== 0) finalCash = cashBal;

        // Classify the row
        if (action === 'קנייה' && symbol && qty > 0) {
            if (!posMap[symbol]) posMap[symbol] = { transactions: [], dividends: [] };
            posMap[symbol].transactions.push({ id: 't_imp_' + idx, shares: qty, price: price, date: dateStr });
            buyCount++;
        } else if (action === 'מכירה' && symbol && qty > 0) {
            if (!posMap[symbol]) posMap[symbol] = { transactions: [], dividends: [] };
            posMap[symbol].transactions.push({ id: 't_imp_' + idx, shares: -qty, price: price, date: dateStr });
            sellCount++;
        } else if (action === 'הפקדה') {
            var depAmt = Math.abs(amount);
            totalDeposits += depAmt;
            depositEvents.push({ id: 'dep_imp_' + idx, amount: depAmt, date: dateStr });
            depositCount++;
        } else if (action === 'דיבידנד' && symbol) {
            if (!posMap[symbol]) posMap[symbol] = { transactions: [], dividends: [] };
            var divAmt = Math.abs(amount);
            posMap[symbol].dividends.push({ id: 'div_imp_' + idx, amount: divAmt, totalAmount: divAmt, date: dateStr });
            divCount++;
        }
    });

    // ---------- Build result ----------
    var symbolList = Object.keys(posMap);
    var summary = 'Found ' + symbolList.length + ' stocks:\n' +
        symbolList.join(', ') + '\n\n' +
        buyCount + ' buys, ' + sellCount + ' sells, ' + divCount + ' dividends, ' + depositCount + ' deposits\n' +
        (finalCash !== null ? 'Cash balance: $' + finalCash.toFixed(2) + '\n' : '') +
        'Total deposits: $' + totalDeposits.toFixed(2) + '\n\n' +
        'Import this data? (This will replace the current portfolio)';

    if (!confirm(summary)) return null;

    // Fetch current prices from API for each symbol
    var newPositions = [];
    for (var si = 0; si < symbolList.length; si++) {
        var sym = symbolList[si];
        var pd  = posMap[sym];
        var totalShares = pd.transactions.reduce(function (s, t) { return s + t.shares; }, 0);
        if (totalShares < 0) continue; // skip invalid negatives, but keep fully sold (0 shares)

        var currentPrice = 0;
        if (apiKey && totalShares > 0) {
            try {
                var res = await fetch('https://finnhub.io/api/v1/quote?symbol=' + sym + '&token=' + apiKey);
                if (res.ok) {
                    var q = await res.json();
                    if (q && q.c) currentPrice = q.c;
                }
                await new Promise(function (r) { setTimeout(r, 200); });
            } catch (err) {
                console.error('Price fetch error for', sym, err);
            }
        }

        newPositions.push({
            id: Date.now() + Math.random(),
            symbol: sym,
            transactions: pd.transactions,
            dividends: pd.dividends,
            currentPrice: currentPrice
        });
    }

    return {
        newPositions:  newPositions,
        finalCash:     finalCash,
        totalDeposits: totalDeposits,
        depositEvents: depositEvents,
        summary:       'Successfully imported ' + newPositions.length + ' stocks!\nPrices will refresh on next load.'
    };
};
