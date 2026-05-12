// =====================================================================
// api.js — Firebase initialization, Cloud storage, Exchange rates, Prices
// =====================================================================
// All functions accept a context object (ctx) containing the React state
// values and setters they need.
// =====================================================================

/**
 * Initialize Firebase and set up auth state listener.
 * @param {Object} ctx - { firebaseConfig, setDbInstance, setUser, setAuthReady, setCloudError, setPositions, setDbReady, initialPositions }
 */
window.initFirebaseAuth = function (ctx) {
    var initFirebase = async function () {
        try {
            if (typeof window.firebase === 'undefined') {
                throw new Error("Firebase library didn't load from Google CDN.");
            }
            if (!window.firebase.apps.length) {
                window.firebase.initializeApp(ctx.firebaseConfig);
            }
            var auth = window.firebase.auth();
            var db = window.firebase.firestore();
            window.__app_id = ctx.firebaseConfig.projectId;
            ctx.setDbInstance(db);
            auth.onAuthStateChanged(function (u) {
                ctx.setUser(u);
                ctx.setAuthReady(true);
            });
        } catch (error) {
            console.error("Firebase init failed:", error);
            var errMsg = error.code || error.message || 'Unknown connection error';
            if (errMsg === 'auth/api-key-not-valid') errMsg = 'Invalid API Key (check Firebase)';
            ctx.setCloudError(errMsg);
            ctx.setPositions(ctx.initialPositions);
            ctx.setDbReady(true);
            ctx.setAuthReady(true);
        }
    };
    initFirebase();
};

/**
 * Sign in with email and password.
 * @param {string} email
 * @param {string} password
 * @returns {Promise}
 */
window.signInWithEmail = function (email, password) {
    return window.firebase.auth().signInWithEmailAndPassword(email, password);
};

/**
 * Register a new account with email and password.
 * @param {string} email
 * @param {string} password
 * @returns {Promise}
 */
window.registerWithEmail = function (email, password) {
    return window.firebase.auth().createUserWithEmailAndPassword(email, password);
};

/**
 * Sign in with Google popup.
 * @returns {Promise}
 */
window.signInWithGoogle = function () {
    var provider = new window.firebase.auth.GoogleAuthProvider();
    return window.firebase.auth().signInWithPopup(provider);
};

/**
 * Sign out the current user.
 * @returns {Promise}
 */
window.signOutUser = function () {
    return window.firebase.auth().signOut();
};

/**
 * Import portfolio data from an anonymous user account into the current user's account.
 * Reads the anonymous user's portfolio/main document and writes it to the current user's document.
 * Also copies all daily snapshots found under the anonymous user.
 *
 * @param {Object} ctx - { user, dbInstance }
 * @param {string} anonymousUid - the UID of the anonymous user to import from
 * @returns {Promise<{ok: boolean, message: string}>}
 */
window.importFromAnonymousUser = async function (ctx, anonymousUid) {
    if (!ctx.user || !ctx.dbInstance) return { ok: false, message: 'לא מחובר לענן' };
    if (!anonymousUid || !anonymousUid.trim()) return { ok: false, message: 'יש להזין UID' };

    var db = ctx.dbInstance;
    var appId = window.__app_id || 'default-app-id';
    var srcUid = anonymousUid.trim();
    var dstUid = ctx.user.uid;

    if (srcUid === dstUid) return { ok: false, message: 'ה-UID זהה לחשבון הנוכחי' };

    try {
        // Read source portfolio
        var srcRef = db.collection('artifacts').doc(appId)
            .collection('users').doc(srcUid).collection('portfolio').doc('main');
        var srcSnap = await srcRef.get();

        if (!srcSnap.exists) {
            return { ok: false, message: 'לא נמצא תיק השקעות עבור ה-UID שהוזן' };
        }

        var rawPortfolioData = srcSnap.data();

        // Decrypt source data (may have been encrypted with the source user's key)
        var portfolioData = rawPortfolioData;
        try {
            portfolioData = await window.decryptPortfolioData(srcUid, rawPortfolioData);
        } catch (e) {
            // If decryption fails, data was likely unencrypted — use as-is
            portfolioData = rawPortfolioData;
        }

        // Re-encrypt with the destination user's key and write
        var dstRef = db.collection('artifacts').doc(appId)
            .collection('users').doc(dstUid).collection('portfolio').doc('main');
        var encryptedForDst = await window.encryptPortfolioData(dstUid, portfolioData);
        await dstRef.set(encryptedForDst, { merge: false });

        // Copy daily snapshots
        try {
            var srcSnapshots = await db.collection('artifacts').doc(appId)
                .collection('users').doc(srcUid).collection('portfolio')
                .doc('snapshots').collection('daily').get();

            if (!srcSnapshots.empty) {
                var dstSnapshotCol = db.collection('artifacts').doc(appId)
                    .collection('users').doc(dstUid).collection('portfolio')
                    .doc('snapshots').collection('daily');
                var batch = db.batch();
                srcSnapshots.forEach(function (doc) {
                    batch.set(dstSnapshotCol.doc(doc.id), doc.data());
                });
                await batch.commit();
            }
        } catch (e) {
            console.warn('Failed to copy snapshots (portfolio data was imported successfully):', e);
        }

        return { ok: true, message: 'התיק יובא בהצלחה! המידע יטען מחדש.' };
    } catch (e) {
        console.error('Import failed:', e);
        return { ok: false, message: 'שגיאה בייבוא: ' + (e.message || e.code || 'Unknown error') };
    }
};

/**
 * Fetch the most recent daily snapshot and reconstruct a portfolio-data shape
 * from it. Snapshots only store {symbol, price, shares} per position plus cash,
 * so transactions, dividends, deposits, rates, and initialInvestment cannot be
 * recovered — each position gets a single synthetic transaction dated to the
 * snapshot date so downstream math stays consistent.
 * @returns {Promise<{data: Object, date: string} | null>}
 */
window.loadLatestSnapshotFallback = async function (ctx, appId) {
    try {
        var snapsRef = ctx.dbInstance.collection('artifacts').doc(appId)
            .collection('users').doc(ctx.user.uid).collection('portfolio')
            .doc('snapshots').collection('daily');
        var query = await snapsRef.get();
        if (query.empty) return null;

        var docs = query.docs.slice().sort(function (a, b) {
            return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
        });
        var doc = docs[0];
        var raw = doc.data();
        var snap = await window.decryptSnapshot(ctx.user.uid, raw);
        if (!snap || !Array.isArray(snap.positions)) return null;

        var date = snap.date || doc.id;
        var reconstructed = {
            positions: snap.positions.map(function (p, idx) {
                var pid = 'snap_' + date + '_' + idx;
                return {
                    id: pid,
                    symbol: p.symbol,
                    currentPrice: p.price || 0,
                    transactions: [{ id: 't_' + pid, shares: p.shares || 0, price: p.price || 0, date: date }],
                    dividends: []
                };
            }),
            cash: snap.cash || 0
        };
        return { data: reconstructed, date: date };
    } catch (e) {
        console.error('Snapshot fallback failed:', e);
        return null;
    }
};

/**
 * Compute the YYYY-MM-DD of the Monday of the week containing `date`.
 * Used as the doc ID for weekly main backups so we keep one per week.
 */
function getMondayOfWeek(date) {
    var d = new Date(date);
    var day = d.getDay(); // 0 = Sunday
    var diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d.toISOString().split('T')[0];
}

/**
 * Try to load and decrypt the most recent weekly backup of `main`.
 * Backups are full faithful copies of the encrypted main document, so
 * unlike the snapshot fallback this returns complete data (transactions,
 * deposits, rates — everything).
 * @returns {Promise<{data: Object, weekKey: string} | null>}
 */
window.loadLatestBackupFallback = async function (ctx, appId) {
    try {
        var backupsRef = ctx.dbInstance.collection('artifacts').doc(appId)
            .collection('users').doc(ctx.user.uid).collection('portfolio')
            .doc('backups').collection('weekly');
        var query = await backupsRef.get();
        if (query.empty) return null;

        var docs = query.docs.slice().sort(function (a, b) {
            return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
        });

        // Walk newest → oldest, return the first one that decrypts cleanly
        for (var i = 0; i < docs.length; i++) {
            try {
                var raw = docs[i].data();
                var decrypted = await window.decryptPortfolioData(ctx.user.uid, raw);
                return { data: decrypted, weekKey: docs[i].id };
            } catch (e) {
                console.warn('Backup ' + docs[i].id + ' failed to decrypt, trying older:', e);
            }
        }
        return null;
    } catch (e) {
        console.error('Backup fallback failed:', e);
        return null;
    }
};

/**
 * Manually restore `main` from the latest valid weekly backup.
 * Run from console: await window.restoreMainFromLatestBackup()
 * Pass { commit: true } to actually overwrite main; default is dry-run preview.
 */
window.restoreMainFromLatestBackup = async function (opts) {
    opts = opts || {};
    var commit = opts.commit === true;
    var auth = window.firebase.auth();
    var db = window.firebase.firestore();
    var user = auth.currentUser;
    if (!user) throw new Error('Not logged in');
    var appId = window.__app_id || 'default-app-id';

    var fallback = await window.loadLatestBackupFallback({ user: user, dbInstance: db }, appId);
    if (!fallback) throw new Error('No weekly backups available');

    if (commit) {
        var encrypted = await window.encryptPortfolioData(user.uid, fallback.data);
        await db.collection('artifacts').doc(appId).collection('users').doc(user.uid)
            .collection('portfolio').doc('main').set(encrypted, { merge: false });
        console.log('main restored from backup', fallback.weekKey, '— reload the app.');
    } else {
        console.log('Dry-run. Pass { commit: true } to overwrite main.');
    }
    return { commit: commit, weekKey: fallback.weekKey, preview: fallback.data };
};

/**
 * Rebuild the `main` portfolio document from the full snapshot history.
 * Walks every daily snapshot in date order and infers transactions from
 * share-count deltas (FIFO for sells), and infers cashDeposits from cash
 * deltas that aren't explained by trading activity.
 *
 * Lossy by nature — see caveats in the returned summary. Dry-run by default.
 *
 * Usage from console:
 *   await window.rebuildMainFromSnapshots()                 // dry-run, returns preview
 *   await window.rebuildMainFromSnapshots({ commit: true }) // writes to main
 *
 * @param {Object} [opts]
 * @param {boolean} [opts.commit=false] - if true, encrypts and writes to main
 * @returns {Promise<Object>} preview/summary object
 */
window.rebuildMainFromSnapshots = async function (opts) {
    opts = opts || {};
    var commit = opts.commit === true;

    var auth = window.firebase.auth();
    var db = window.firebase.firestore();
    var user = auth.currentUser;
    if (!user) throw new Error('Not logged in');

    var appId = window.__app_id || 'default-app-id';
    var uid = user.uid;
    var basePath = db.collection('artifacts').doc(appId)
        .collection('users').doc(uid).collection('portfolio');

    var snapsQuery = await basePath.doc('snapshots').collection('daily').get();
    if (snapsQuery.empty) throw new Error('No snapshots found — nothing to rebuild from');

    // Decrypt and sort by date ascending
    var snaps = [];
    for (var i = 0; i < snapsQuery.docs.length; i++) {
        var d = snapsQuery.docs[i];
        var raw = d.data();
        var dec = await window.decryptSnapshot(uid, raw);
        if (!dec || !Array.isArray(dec.positions)) continue;
        snaps.push({ id: d.id, date: dec.date || d.id, cash: typeof dec.cash === 'number' ? dec.cash : 0, positions: dec.positions });
    }
    snaps.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    if (snaps.length === 0) throw new Error('Snapshots present but none could be decrypted');

    var lotsBySymbol = {};        // symbol -> [{id, shares, price, date}]
    var lastPriceBySymbol = {};   // symbol -> latest seen price
    var prevSharesBySymbol = {};  // symbol -> shares at previous snapshot
    var cashDeposits = [];
    var prevCash = 0;
    var lotCounter = 0;
    var depCounter = 0;
    var warnings = [];

    for (var s = 0; s < snaps.length; s++) {
        var snap = snaps[s];
        var curShares = {};
        var curPrice = {};
        snap.positions.forEach(function (p) {
            if (!p.symbol) return;
            curShares[p.symbol] = p.shares || 0;
            curPrice[p.symbol] = p.price || 0;
            lastPriceBySymbol[p.symbol] = p.price || lastPriceBySymbol[p.symbol] || 0;
        });

        // Union of symbols seen previously and now (so disappearance counts as sell-to-zero)
        var symbols = {};
        Object.keys(prevSharesBySymbol).forEach(function (k) { symbols[k] = true; });
        Object.keys(curShares).forEach(function (k) { symbols[k] = true; });

        var tradingCashChange = 0;
        Object.keys(symbols).forEach(function (sym) {
            var prev = prevSharesBySymbol[sym] || 0;
            var curr = curShares[sym] || 0;
            var delta = curr - prev;
            if (delta === 0) return;

            var price = curPrice[sym] || lastPriceBySymbol[sym] || 0;

            if (delta > 0) {
                lotCounter++;
                if (!lotsBySymbol[sym]) lotsBySymbol[sym] = [];
                lotsBySymbol[sym].push({
                    id: 't_rebuild_' + lotCounter,
                    shares: delta,
                    price: price,
                    date: snap.date
                });
                tradingCashChange -= delta * price; // buy reduces cash
            } else {
                var toReduce = -delta;
                var lots = lotsBySymbol[sym] || [];
                // FIFO: drain oldest lots first
                while (toReduce > 0 && lots.length > 0) {
                    var lot = lots[0];
                    if (lot.shares <= toReduce + 1e-9) {
                        toReduce -= lot.shares;
                        lots.shift();
                    } else {
                        lot.shares -= toReduce;
                        toReduce = 0;
                    }
                }
                if (toReduce > 1e-6) {
                    warnings.push('Sell of ' + (-delta) + ' ' + sym + ' on ' + snap.date + ' exceeded known lots by ' + toReduce);
                }
                tradingCashChange += (-delta) * price; // sell adds cash
            }
        });

        var actualCashDelta = snap.cash - prevCash;
        var unexplained = actualCashDelta - tradingCashChange;
        if (Math.abs(unexplained) > 0.01) {
            depCounter++;
            cashDeposits.push({
                id: 'd_rebuild_' + depCounter,
                date: snap.date,
                amount: Math.round(unexplained * 100) / 100,
                rate: null,
                rateManual: false
            });
        }

        prevSharesBySymbol = curShares;
        prevCash = snap.cash;
    }

    // Build positions from remaining lots
    var positions = [];
    var posCounter = 0;
    Object.keys(lotsBySymbol).forEach(function (sym) {
        var lots = lotsBySymbol[sym];
        if (!lots || lots.length === 0) return;
        posCounter++;
        positions.push({
            id: 'p_rebuild_' + posCounter,
            symbol: sym,
            currentPrice: lastPriceBySymbol[sym] || 0,
            transactions: lots,
            dividends: []
        });
    });

    var rebuilt = {
        positions: positions,
        cash: snaps[snaps.length - 1].cash,
        cashDeposits: cashDeposits,
        apiKey: '',
        cashRate: null,
        initialInvestment: null,
        investmentRate: null
    };

    var summary = {
        commit: commit,
        snapshotCount: snaps.length,
        dateRange: { from: snaps[0].date, to: snaps[snaps.length - 1].date },
        positionCount: positions.length,
        transactionCount: positions.reduce(function (n, p) { return n + p.transactions.length; }, 0),
        depositCount: cashDeposits.length,
        warnings: warnings,
        caveats: [
            'Buy prices use end-of-day snapshot price, not actual fill price',
            'Multiple trades per day are merged into one transaction',
            'Sells use FIFO and do not appear as transactions, only as lot reductions',
            'Pre-first-snapshot holdings are dated to ' + snaps[0].date,
            'Dividends, apiKey, cashRate, initialInvestment, investmentRate cannot be recovered',
            'Stock splits may appear as phantom buys'
        ],
        preview: rebuilt
    };

    if (commit) {
        var encrypted = await window.encryptPortfolioData(uid, rebuilt);
        await basePath.doc('main').set(encrypted, { merge: false });
        summary.committed = true;
        console.log('Rebuilt main document written. Reload the app to see changes.');
    } else {
        console.log('Dry-run preview. Pass { commit: true } to write to main.');
    }

    return summary;
};

/**
 * Set up Firestore real-time listener for user portfolio data.
 * @param {Object} ctx - { user, dbInstance, normalizeSymbol, setPositions, setCash, setCashRate,
 *                         setInitialInvestment, setInvestmentRate, setCashDeposits, setApiKey,
 *                         setTempApiKey, setCloudError, setDbReady, initialPositions }
 * @returns {Function} unsubscribe function
 */
window.setupCloudListener = function (ctx) {
    var unsubscribe = function () {};
    if (!ctx.user || !ctx.dbInstance) return unsubscribe;

    var loadData = async function () {
        try {
            var appId = window.__app_id || 'default-app-id';
            var docRef = ctx.dbInstance.collection('artifacts').doc(appId)
                .collection('users').doc(ctx.user.uid).collection('portfolio').doc('main');

            unsubscribe = docRef.onSnapshot(async function (docSnap) {
                if (docSnap.exists) {
                    var rawData = docSnap.data();
                    // Decrypt data if it was stored encrypted
                    var data = rawData;
                    try {
                        data = await window.decryptPortfolioData(ctx.user.uid, rawData);
                    } catch (decErr) {
                        console.error('Decryption error:', decErr);
                        var backup = await window.loadLatestBackupFallback(ctx, appId);
                        if (backup) {
                            data = backup.data;
                            ctx.setCloudError('Main data unreadable — restored full backup from week of ' + backup.weekKey + '.');
                        } else {
                            var snapFallback = await window.loadLatestSnapshotFallback(ctx, appId);
                            if (snapFallback) {
                                data = snapFallback.data;
                                ctx.setCloudError('Main data unreadable — loaded from snapshot ' + snapFallback.date + '. Transactions and deposit history are not restored.');
                            } else {
                                ctx.setCloudError('Failed to decrypt portfolio data');
                                ctx.setDbReady(true);
                                return;
                            }
                        }
                    }
                    if (data.positions) {
                        // Migration: convert flat positions to transactions format
                        var migrated = data.positions.map(function (p) {
                            if (!p.transactions) {
                                return {
                                    id: p.id, symbol: ctx.normalizeSymbol(p.symbol), currentPrice: p.currentPrice,
                                    ytdPrice: p.ytdPrice || null, dailyChange: p.dailyChange,
                                    dailyChangePercent: p.dailyChangePercent, previousClose: p.previousClose,
                                    transactions: [{ id: 't_' + p.id, shares: p.shares || 0, price: p.purchasePrice || 0, date: p.purchaseDate || '' }],
                                    dividends: []
                                };
                            }
                            return Object.assign({}, p, { symbol: ctx.normalizeSymbol(p.symbol), dividends: p.dividends || [] });
                        });

                        // Merge positions with the same normalized symbol
                        var mergedMap = {};
                        migrated.forEach(function (p) {
                            if (mergedMap[p.symbol]) {
                                mergedMap[p.symbol].transactions = mergedMap[p.symbol].transactions.concat(p.transactions || []);
                                mergedMap[p.symbol].dividends = (mergedMap[p.symbol].dividends || []).concat(p.dividends || []);
                                if (p.currentPrice) mergedMap[p.symbol].currentPrice = p.currentPrice;
                                if (p.ytdPrice) mergedMap[p.symbol].ytdPrice = p.ytdPrice;
                                if (p.dailyChange !== undefined) mergedMap[p.symbol].dailyChange = p.dailyChange;
                                if (p.dailyChangePercent !== undefined) mergedMap[p.symbol].dailyChangePercent = p.dailyChangePercent;
                                if (p.previousClose !== undefined) mergedMap[p.symbol].previousClose = p.previousClose;
                            } else {
                                mergedMap[p.symbol] = Object.assign({}, p);
                            }
                        });
                        ctx.setPositions(Object.values(mergedMap));
                    }
                    if (data.cash !== undefined) ctx.setCash(data.cash);
                    if (data.cashRate !== undefined) ctx.setCashRate(data.cashRate);
                    if (data.initialInvestment !== undefined) ctx.setInitialInvestment(data.initialInvestment);
                    if (data.investmentRate !== undefined) ctx.setInvestmentRate(data.investmentRate);
                    if (data.cashDeposits) ctx.setCashDeposits(data.cashDeposits);
                    if (data.apiKey !== undefined) { ctx.setApiKey(data.apiKey); ctx.setTempApiKey(data.apiKey); }
                    if (data.lastManualUpdate && ctx.setLastManualUpdate) ctx.setLastManualUpdate(data.lastManualUpdate);
                } else {
                    docRef.set({ positions: ctx.initialPositions, cash: 5000, cashRate: null, apiKey: '', initialInvestment: null, investmentRate: null });
                }
                ctx.setDbReady(true);
            }, function (error) {
                console.error("Error fetching data:", error);
                ctx.setCloudError('No read/write permissions to database');
                ctx.setDbReady(true);
            });
        } catch (err) {
            console.error("Error setting up snapshot:", err);
            ctx.setCloudError('Error accessing document');
            ctx.setDbReady(true);
        }
    };
    loadData();
    return function () { unsubscribe(); };
};

/**
 * Save portfolio data to Firestore.
 * @param {Object} ctx - all state values and setters
 * @param {Object} data - { newPositions, newCash, newApiKey, newInitInv, newCashRate, newInvRate, newDeposits }
 */
window.savePortfolioToDb = async function (ctx, data) {
    var p = data.newPositions !== undefined ? data.newPositions : ctx.positions;
    var c = data.newCash !== undefined ? data.newCash : ctx.cash;
    var a = data.newApiKey !== undefined ? data.newApiKey : ctx.apiKey;
    var i = data.newInitInv !== undefined ? data.newInitInv : ctx.initialInvestment;
    var cr = data.newCashRate !== undefined ? data.newCashRate : ctx.cashRate;
    var ir = data.newInvRate !== undefined ? data.newInvRate : ctx.investmentRate;
    var deps = data.newDeposits !== undefined ? data.newDeposits : ctx.cashDeposits;

    if (data.newPositions !== undefined) ctx.setPositions(p);
    if (data.newCash !== undefined) ctx.setCash(c);
    if (data.newApiKey !== undefined) ctx.setApiKey(a);
    if (data.newInitInv !== undefined) ctx.setInitialInvestment(i);
    if (data.newCashRate !== undefined) ctx.setCashRate(cr);
    if (data.newInvRate !== undefined) ctx.setInvestmentRate(ir);
    if (data.newDeposits !== undefined) ctx.setCashDeposits(deps);

    if (!ctx.user || !ctx.dbInstance) return;

    try {
        var appId = window.__app_id || 'default-app-id';
        var userCol = ctx.dbInstance.collection('artifacts').doc(appId)
            .collection('users').doc(ctx.user.uid).collection('portfolio');
        var docRef = userCol.doc('main');

        // Clean undefined values before saving to Firestore
        var cleanPositions = p.map(function (pos) {
            var clean = {};
            Object.keys(pos).forEach(function (k) { if (pos[k] !== undefined) clean[k] = pos[k]; });
            if (clean.transactions) {
                clean.transactions = clean.transactions.map(function (t) {
                    var ct = {};
                    Object.keys(t).forEach(function (k) { if (t[k] !== undefined) ct[k] = t[k]; });
                    return ct;
                });
            }
            if (clean.dividends) {
                clean.dividends = clean.dividends.map(function (d) {
                    var cd = {};
                    Object.keys(d).forEach(function (k) { if (d[k] !== undefined) cd[k] = d[k]; });
                    return cd;
                });
            }
            return clean;
        });

        // Encrypt sensitive data before saving to Firestore
        var lmu = ctx.lastManualUpdate;
        if (data.manualUpdate) {
            lmu = Date.now();
            if (ctx.setLastManualUpdate) ctx.setLastManualUpdate(lmu);
        }

        var saveData = {
            positions: cleanPositions, cash: c, apiKey: a,
            initialInvestment: i, cashRate: cr, investmentRate: ir, cashDeposits: deps,
            lastManualUpdate: lmu || null
        };
        var encryptedData = await window.encryptPortfolioData(ctx.user.uid, saveData);
        await docRef.set(encryptedData, { merge: false });

        // Save daily snapshot
        var today = new Date().toISOString().split('T')[0];
        var snapshotData = {
            date: today,
            totalValueUSD: cleanPositions.reduce(function (sum, pos) {
                var stats = window.getPositionStats(pos);
                return sum + stats.totalShares * (pos.currentPrice || 0);
            }, c),
            positions: cleanPositions.map(function (pos) {
                var stats = window.getPositionStats(pos);
                return { symbol: pos.symbol, price: pos.currentPrice || 0, shares: stats.totalShares };
            }),
            cash: c, timestamp: Date.now()
        };
        var encryptedSnapshot = await window.encryptSnapshot(ctx.user.uid, snapshotData);
        await userCol.doc('snapshots').collection('daily').doc(today).set(encryptedSnapshot);

        // Weekly full backup of main — one per week, written on the first save of the week
        try {
            var weekKey = getMondayOfWeek(new Date());
            var backupRef = userCol.doc('backups').collection('weekly').doc(weekKey);
            var existing = await backupRef.get();
            if (!existing.exists) {
                await backupRef.set(encryptedData);
            }
        } catch (backupErr) {
            console.warn('Weekly backup write failed (main was saved successfully):', backupErr);
        }
    } catch (error) {
        console.error("Error saving data:", error);
    }
};

/**
 * Fetch current and historical exchange rates.
 * @param {Object} ctx - { setExchangeRate, setHistoricalFX, setLoading }
 */
window.fetchExchangeRates = async function (ctx) {
    var currentRate = 3.65;
    var rateFound = false;

    // Try Yahoo Finance first for real-time rate (USDILS=X)
    var yahooUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/USDILS%3DX?range=1d&interval=1d';
    var yahooProxies = [
        '',
        'https://corsproxy.io/?url=',
        'https://api.allorigins.win/raw?url='
    ];
    for (var yi = 0; yi < yahooProxies.length && !rateFound; yi++) {
        try {
            var fullUrl = yahooProxies[yi] ? yahooProxies[yi] + encodeURIComponent(yahooUrl) : yahooUrl;
            var yahooRes = await fetch(fullUrl);
            if (yahooRes.ok) {
                var yahooJson = await yahooRes.json();
                var result = yahooJson && yahooJson.chart && yahooJson.chart.result && yahooJson.chart.result[0];
                if (result && result.meta && result.meta.regularMarketPrice) {
                    currentRate = result.meta.regularMarketPrice;
                    ctx.setExchangeRate(currentRate);
                    rateFound = true;
                }
            }
        } catch (e) { /* try next proxy */ }
    }

    // Fallback to open.er-api.com (daily rates) if Yahoo failed
    if (!rateFound) {
        try {
            var fxRes = await fetch('https://open.er-api.com/v6/latest/USD');
            var fxData = await fxRes.json();
            if (fxData && fxData.rates && fxData.rates.ILS) {
                currentRate = fxData.rates.ILS;
                ctx.setExchangeRate(currentRate);
            }
        } catch (e) { }
    }

    var histUrl = 'https://api.frankfurter.app/2015-01-01..?from=USD&to=ILS';
    var histProxies = [
        '',
        'https://corsproxy.io/?url=',
        'https://api.allorigins.win/raw?url='
    ];
    var histLoaded = false;
    for (var hi = 0; hi < histProxies.length && !histLoaded; hi++) {
        try {
            var histFetchUrl = histProxies[hi] ? histProxies[hi] + encodeURIComponent(histUrl) : histUrl;
            var histRes = await fetch(histFetchUrl);
            var histData = await histRes.json();
            if (histData && histData.rates) {
                var ratesMap = {};
                for (var dateStr in histData.rates) {
                    ratesMap[dateStr] = histData.rates[dateStr].ILS;
                }
                ctx.setHistoricalFX(ratesMap);
                histLoaded = true;
            }
        } catch (e) { /* try next proxy */ }
    }
    if (!histLoaded) { ctx.setHistoricalFX({}); }

    ctx.setLoading(false);
};

/**
 * Fetch candles from Yahoo Finance chart API with CORS proxy fallback.
 * Returns array of {t, o, h, l, c} or null on failure.
 * @param {string} symbol - e.g. "SPY", "AAPL"
 * @param {string} range - e.g. "5y", "10y", "max"
 * @param {string} interval - e.g. "1wk", "1d"
 * @returns {Promise<{timestamps:number[], opens:number[], highs:number[], lows:number[], closes:number[]}|null>}
 */
window.fetchYahooCandles = async function (symbol, range, interval) {
    var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) +
        '?range=' + range + '&interval=' + interval + '&includePrePost=false';

    var tryFetch = async function (fetchUrl) {
        var res = await fetch(fetchUrl);
        if (!res.ok) return null;
        var json = await res.json();
        var result = json && json.chart && json.chart.result && json.chart.result[0];
        if (!result || !result.timestamp) return null;
        var q = result.indicators && result.indicators.quote && result.indicators.quote[0];
        if (!q) return null;
        return { timestamps: result.timestamp, opens: q.open, highs: q.high, lows: q.low, closes: q.close };
    };

    // Try direct first, then CORS proxies
    var proxies = [
        '',
        'https://corsproxy.io/?url=',
        'https://api.allorigins.win/raw?url='
    ];
    for (var i = 0; i < proxies.length; i++) {
        try {
            var fullUrl = proxies[i] ? proxies[i] + encodeURIComponent(url) : url;
            var data = await tryFetch(fullUrl);
            if (data) return data;
        } catch (e) { /* try next proxy */ }
    }
    return null;
};

/**
 * Load S&P 500 weekly historical data from Firebase (global, shared across all users).
 * Seeds Firebase on first run using the hardcoded fallback in spData.js.
 * Fetches fresh weekly candles from Yahoo Finance if data is older than 7 days.
 * Falls back to Finnhub if Yahoo Finance is unavailable.
 * Updates window.spyHistoricalData so chartBuilder.js picks it up, then
 * calls ctx.setSpDataVersion to trigger a React re-render.
 *
 * Firebase path: artifacts/{projectId}/global_market_data/sp500_weekly
 * Document shape: { history: { "YYYY-MM-DD": {open,high,low,close}, ... }, lastUpdated: ISO string }
 *
 * @param {Object} ctx - { dbInstance, user, apiKey, setSpDataVersion }
 */
window.loadSp500WeeklyData = async function (ctx) {
    var db = ctx.dbInstance;
    var user = ctx.user;
    var apiKey = ctx.apiKey;
    var setSpDataVersion = ctx.setSpDataVersion;

    if (!db || !user) return;

    try {
        var appId = window.__app_id || 'default-app-id';
        var docRef = db.collection('artifacts').doc(appId)
            .collection('global_market_data').doc('sp500_weekly');

        var snap = await docRef.get();
        var existingHistory = {};
        var lastUpdated = null;
        var docExists = snap.exists;

        if (docExists) {
            var docData = snap.data();
            existingHistory = docData.history || {};
            lastUpdated = docData.lastUpdated ? new Date(docData.lastUpdated) : null;
        }

        // Merge: hardcoded fallback first, then Firebase data on top (Firebase wins on overlap)
        var hardcoded = window.spyHistoricalData || {};
        var mergedHistory = Object.assign({}, hardcoded, existingHistory);

        // First-time setup: seed Firebase with the hardcoded data so other users
        // benefit immediately, even before the Finnhub fetch runs.
        if (!docExists && Object.keys(hardcoded).length > 0) {
            try {
                await docRef.set({ history: hardcoded, lastUpdated: new Date().toISOString() });
                lastUpdated = new Date();
                console.log('Seeded SP500 weekly data to Firebase (' + Object.keys(hardcoded).length + ' weeks)');
            } catch (e) {
                console.error('Failed to seed SP500 weekly data to Firebase', e);
            }
        }

        // Weekly update: fetch fresh candles when data is stale (> 7 days old)
        var needsUpdate = !lastUpdated || (Date.now() - lastUpdated.getTime() > 7 * 24 * 60 * 60 * 1000);

        if (needsUpdate) {
            try {
                // Try Yahoo Finance first (up to 10 years of weekly data, no API key needed)
                var yahooData = await window.fetchYahooCandles('SPY', '10y', '1wk');
                var newEntries = {};

                if (yahooData) {
                    yahooData.timestamps.forEach(function (ts, idx) {
                        if (yahooData.closes[idx] == null) return;
                        var d = new Date(ts * 1000);
                        var dayOfWeek = d.getUTCDay();
                        var sundayMs  = d.getTime() - dayOfWeek * 24 * 60 * 60 * 1000;
                        var dateKey   = new Date(sundayMs).toISOString().split('T')[0];
                        newEntries[dateKey] = {
                            open:  yahooData.opens[idx],
                            high:  yahooData.highs[idx],
                            low:   yahooData.lows[idx],
                            close: yahooData.closes[idx]
                        };
                    });
                    console.log('SP500 weekly data fetched from Yahoo Finance (' + Object.keys(newEntries).length + ' weeks)');
                } else if (apiKey) {
                    // Fallback to Finnhub (limited to ~1 year on free tier)
                    var toTs   = Math.floor(Date.now() / 1000);
                    var fromTs = Math.floor((Date.now() - 2 * 365 * 24 * 60 * 60 * 1000) / 1000);
                    var res = await fetch(
                        'https://finnhub.io/api/v1/stock/candle?symbol=SPY&resolution=W&from=' +
                        fromTs + '&to=' + toTs + '&token=' + apiKey
                    );
                    if (res.ok) {
                        var candles = await res.json();
                        if (candles && candles.s === 'ok' && candles.t && candles.t.length > 0) {
                            candles.t.forEach(function (ts, idx) {
                                var d = new Date(ts * 1000);
                                var dayOfWeek = d.getUTCDay();
                                var sundayMs  = d.getTime() - dayOfWeek * 24 * 60 * 60 * 1000;
                                var dateKey   = new Date(sundayMs).toISOString().split('T')[0];
                                newEntries[dateKey] = {
                                    open:  candles.o[idx],
                                    high:  candles.h[idx],
                                    low:   candles.l[idx],
                                    close: candles.c[idx]
                                };
                            });
                            console.log('SP500 weekly data fetched from Finnhub fallback (' + Object.keys(newEntries).length + ' weeks)');
                        }
                    }
                }

                if (Object.keys(newEntries).length > 0) {
                    mergedHistory = Object.assign({}, mergedHistory, newEntries);
                    await docRef.set(
                        { history: mergedHistory, lastUpdated: new Date().toISOString() },
                        { merge: true }
                    );
                    console.log('SP500 weekly data saved to Firebase (total ' + Object.keys(mergedHistory).length + ' weeks)');
                }
            } catch (e) {
                console.error('Failed to fetch/update SP500 weekly data', e);
            }
        }

        // Overwrite the global so chartBuilder picks up the richer Firebase data,
        // then bump version to force a chart re-render.
        window.spyHistoricalData = mergedHistory;
        if (setSpDataVersion) setSpDataVersion(function (prev) { return prev + 1; });

    } catch (e) {
        console.error('Failed to load SP500 weekly data from Firebase', e);
    }
};

/**
 * Fetch realtime stock prices from Finnhub API + S&P 500 data (via Yahoo Finance with Finnhub fallback).
 * @param {Object} ctx - { positions, apiKey, user, dbInstance, setLoading, setApiError, setSpyData, saveToDb, getPositionStats }
 */
window.fetchRealtimePrices = async function (ctx) {
    var currentPositions = ctx.positions;
    var key = ctx.apiKey;
    if (!key) return;
    ctx.setLoading(true);
    ctx.setApiError('');
    var errorOccurred = false;
    var hasChanges = false;
    var currentYear = new Date().getFullYear();
    try {
        var fetchedSpyCurrent = null;
        var fetchedSpyMap = {};
        var resSpyQuote = await fetch('https://finnhub.io/api/v1/quote?symbol=SPY&token=' + key);
        if (resSpyQuote.ok) {
            var quoteData = await resSpyQuote.json();
            if (quoteData && quoteData.c) fetchedSpyCurrent = quoteData.c;
        }
        await new Promise(function (r) { setTimeout(r, 1100); });

        // Load existing SPY history from Firebase
        var cloudSpyHistory = {};
        if (ctx.user && ctx.dbInstance) {
            try {
                var appId = window.__app_id || 'default-app-id';
                var spyDoc = await ctx.dbInstance.collection('artifacts').doc(appId)
                    .collection('global_market_data').doc('spy_history').get();
                if (spyDoc.exists) { cloudSpyHistory = spyDoc.data().history || {}; }
            } catch (e) { console.error("Failed to load SPY history from cloud", e); }
        }

        // Try Yahoo Finance first (up to 5 years of daily data)
        var hasNewSpyDataToSave = false;
        var yahooDaily = await window.fetchYahooCandles('SPY', '5y', '1d');
        if (yahooDaily) {
            yahooDaily.timestamps.forEach(function (ts, idx) {
                if (yahooDaily.closes[idx] == null) return;
                var dateKey = new Date(ts * 1000).toISOString().split('T')[0];
                fetchedSpyMap[dateKey] = yahooDaily.closes[idx];
                if (cloudSpyHistory[dateKey] === undefined) hasNewSpyDataToSave = true;
            });
            console.log('SPY daily data fetched from Yahoo Finance (' + Object.keys(fetchedSpyMap).length + ' days)');
        } else {
            // Fallback to Finnhub (limited to ~1 year on free tier)
            var todayForSpy = new Date();
            var oneYearAgoSpy = new Date(todayForSpy.getTime() - 365 * 24 * 60 * 60 * 1000);
            var spyFromTs = Math.floor(oneYearAgoSpy.getTime() / 1000);
            var spyToTs = Math.floor(todayForSpy.getTime() / 1000);
            var resSpy = await fetch('https://finnhub.io/api/v1/stock/candle?symbol=SPY&resolution=D&from=' + spyFromTs + '&to=' + spyToTs + '&token=' + key);
            if (resSpy.ok) {
                var dataSpy = await resSpy.json();
                if (dataSpy && dataSpy.s === 'ok' && dataSpy.c && dataSpy.c.length > 0) {
                    dataSpy.t.forEach(function (ts, idx) {
                        var dateKey = new Date(ts * 1000).toISOString().split('T')[0];
                        fetchedSpyMap[dateKey] = dataSpy.c[idx];
                        if (cloudSpyHistory[dateKey] === undefined) hasNewSpyDataToSave = true;
                    });
                }
            }
            console.log('SPY daily data fetched from Finnhub fallback');
        }

        var mergedSpyMap = Object.assign({}, cloudSpyHistory, fetchedSpyMap);
        if (hasNewSpyDataToSave && Object.keys(mergedSpyMap).length > 0 && ctx.user && ctx.dbInstance) {
            try {
                var appId2 = window.__app_id || 'default-app-id';
                await ctx.dbInstance.collection('artifacts').doc(appId2)
                    .collection('global_market_data').doc('spy_history').set({
                        history: mergedSpyMap, lastUpdated: new Date().toISOString()
                    }, { merge: true });
                console.log("Saved updated SPY history to Firebase!");
            } catch (e) { console.error("Failed to save SPY history to cloud", e); }
        }

        if (fetchedSpyCurrent) {
            ctx.setSpyData({ map: Object.keys(mergedSpyMap).length > 0 ? mergedSpyMap : null, current: fetchedSpyCurrent });
        }
    } catch (e) { console.error("Failed to fetch SPY data", e); }

    // Fetch quotes for each portfolio position
    if (currentPositions && currentPositions.length > 0) {
        try {
            var finalPositions = [];
            for (var pi = 0; pi < currentPositions.length; pi++) {
                var pos = currentPositions[pi];
                var posStats = ctx.getPositionStats(pos);
                if (posStats.totalShares <= 0) { finalPositions.push(pos); continue; }
                await new Promise(function (r) { setTimeout(r, 1100); });

                try {
                    var res = await fetch('https://finnhub.io/api/v1/quote?symbol=' + pos.symbol + '&token=' + key);
                    if (res.status === 401 || res.status === 403 || res.status === 429) {
                        errorOccurred = true; finalPositions.push(pos); continue;
                    }
                    var data = await res.json();
                    if (data && data.c) {
                        var newD = data.d !== undefined ? data.d : (pos.dailyChange || null);
                        var newDp = data.dp !== undefined ? data.dp : (pos.dailyChangePercent || null);
                        var newPc = data.pc !== undefined ? data.pc : (pos.previousClose || null);

                        var finalYtdPrice = pos.ytdPrice || null;
                        if (!finalYtdPrice) {
                            await new Promise(function (r) { setTimeout(r, 1100); });
                            try {
                                var metricRes = await fetch('https://finnhub.io/api/v1/stock/metric?symbol=' + pos.symbol + '&metric=all&token=' + key);
                                if (metricRes.ok) {
                                    var metricData = await metricRes.json();
                                    var ytdReturn = metricData && metricData.metric && metricData.metric.yearToDatePriceReturnDaily;
                                    if (ytdReturn !== undefined && ytdReturn !== null && data.c > 0) {
                                        finalYtdPrice = data.c / (1 + ytdReturn / 100);
                                    }
                                }
                            } catch (e) { console.error("Metric fetch error for", pos.symbol, e); }
                        }

                        if (!finalYtdPrice) {
                            var stats = ctx.getPositionStats(pos);
                            if (stats.earliestDate) {
                                var purYear = new Date(stats.earliestDate).getFullYear();
                                if (purYear === currentYear) finalYtdPrice = stats.avgPrice;
                            }
                        }

                        if (data.c !== pos.currentPrice || newD !== pos.dailyChange || newDp !== pos.dailyChangePercent || newPc !== pos.previousClose || finalYtdPrice !== pos.ytdPrice) {
                            hasChanges = true;
                        }
                        finalPositions.push(Object.assign({}, pos, { currentPrice: data.c, dailyChange: newD, dailyChangePercent: newDp, previousClose: newPc, ytdPrice: finalYtdPrice }));
                    } else { finalPositions.push(pos); }
                } catch (e) { console.error(e); finalPositions.push(pos); }
            }

            if (errorOccurred) {
                ctx.setApiError("API access error. Key is invalid or request limit exceeded.");
            } else if (hasChanges) {
                ctx.saveToDb(finalPositions, undefined, undefined, undefined, undefined, undefined, undefined, { manualUpdate: false });
            }
        } catch (error) { console.error("Error fetching data:", error); }
    }
    ctx.setLoading(false);
};

/**
 * Fetch and cache historical daily close prices for all portfolio stock symbols.
 * Uses Yahoo Finance (via fetchYahooCandles) with Firebase caching.
 * Stores result in window.stockHistoryCache = { "AAPL": { "2023-01-05": 125.3, ... }, ... }
 *
 * Firebase path: artifacts/{projectId}/global_market_data/stock_history_{SYMBOL}
 *
 * @param {Object} ctx - { positions, dbInstance, user, setStockHistoryVersion }
 */
window.fetchStockHistoryForPositions = async function (ctx) {
    var positions = ctx.positions;
    var db = ctx.dbInstance;
    var user = ctx.user;
    if (!positions || positions.length === 0 || !db || !user) return;

    if (!window.stockHistoryCache) window.stockHistoryCache = {};

    var appId = window.__app_id || 'default-app-id';
    var symbols = [];
    positions.forEach(function (pos) {
        if (pos.symbol && symbols.indexOf(pos.symbol) === -1) {
            symbols.push(pos.symbol);
        }
    });

    var hasNewData = false;

    for (var i = 0; i < symbols.length; i++) {
        var symbol = symbols[i];

        // Skip if already loaded this session
        if (window.stockHistoryCache[symbol] && Object.keys(window.stockHistoryCache[symbol]).length > 50) continue;

        try {
            // Load from Firebase cache first
            var docRef = db.collection('artifacts').doc(appId)
                .collection('global_market_data').doc('stock_history_' + symbol);
            var snap = await docRef.get();
            var cachedHistory = {};
            var lastUpdated = null;

            if (snap.exists) {
                var docData = snap.data();
                cachedHistory = docData.history || {};
                lastUpdated = docData.lastUpdated ? new Date(docData.lastUpdated) : null;
            }

            // Refresh if stale (> 1 day old) or empty
            var needsUpdate = !lastUpdated || (Date.now() - lastUpdated.getTime() > 24 * 60 * 60 * 1000);

            if (needsUpdate) {
                var yahooData = await window.fetchYahooCandles(symbol, '10y', '1d');
                if (yahooData) {
                    var freshHistory = {};
                    yahooData.timestamps.forEach(function (ts, idx) {
                        if (yahooData.closes[idx] == null) return;
                        var dateKey = new Date(ts * 1000).toISOString().split('T')[0];
                        freshHistory[dateKey] = yahooData.closes[idx];
                    });

                    // Merge: cached first, fresh on top
                    var merged = Object.assign({}, cachedHistory, freshHistory);
                    window.stockHistoryCache[symbol] = merged;
                    hasNewData = true;

                    // Save to Firebase
                    try {
                        await docRef.set({
                            history: merged,
                            lastUpdated: new Date().toISOString()
                        }, { merge: true });
                        console.log('Stock history saved for ' + symbol + ' (' + Object.keys(merged).length + ' days)');
                    } catch (e) { console.error('Failed to save stock history for ' + symbol, e); }
                } else if (Object.keys(cachedHistory).length > 0) {
                    // Yahoo failed but we have cached data
                    window.stockHistoryCache[symbol] = cachedHistory;
                    hasNewData = true;
                }
            } else {
                // Cache is fresh, use it
                window.stockHistoryCache[symbol] = cachedHistory;
                hasNewData = true;
            }
        } catch (e) {
            console.error('Failed to load stock history for ' + symbol, e);
        }
    }

    if (hasNewData && ctx.setStockHistoryVersion) {
        ctx.setStockHistoryVersion(function (prev) { return prev + 1; });
    }
};