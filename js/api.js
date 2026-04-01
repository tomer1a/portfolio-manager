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
                        ctx.setCloudError('Failed to decrypt portfolio data');
                        ctx.setDbReady(true);
                        return;
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
    try {
        var fxRes = await fetch('https://open.er-api.com/v6/latest/USD');
        var fxData = await fxRes.json();
        if (fxData && fxData.rates && fxData.rates.ILS) {
            currentRate = fxData.rates.ILS;
            ctx.setExchangeRate(currentRate);
        }
    } catch (e) { }

    try {
        var histRes = await fetch('https://api.frankfurter.app/2015-01-01..?from=USD&to=ILS');
        var histData = await histRes.json();
        if (histData && histData.rates) {
            var ratesMap = {};
            for (var dateStr in histData.rates) {
                ratesMap[dateStr] = histData.rates[dateStr].ILS;
            }
            ctx.setHistoricalFX(ratesMap);
        } else { ctx.setHistoricalFX({}); }
    } catch (e) { ctx.setHistoricalFX({}); }

    ctx.setLoading(false);
};

/**
 * Load S&P 500 weekly historical data from Firebase (global, shared across all users).
 * Seeds Firebase on first run using the hardcoded fallback in spData.js.
 * Fetches fresh weekly candles from Finnhub if data is older than 7 days.
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

        // Weekly update: fetch fresh candles from Finnhub when data is stale (> 7 days old)
        var needsUpdate = !lastUpdated || (Date.now() - lastUpdated.getTime() > 7 * 24 * 60 * 60 * 1000);

        if (needsUpdate && apiKey) {
            var toTs   = Math.floor(Date.now() / 1000);
            var fromTs = Math.floor((Date.now() - 2 * 365 * 24 * 60 * 60 * 1000) / 1000); // 2 years back

            try {
                var res = await fetch(
                    'https://finnhub.io/api/v1/stock/candle?symbol=SPY&resolution=W&from=' +
                    fromTs + '&to=' + toTs + '&token=' + apiKey
                );
                if (res.ok) {
                    var candles = await res.json();
                    if (candles && candles.s === 'ok' && candles.t && candles.t.length > 0) {
                        var newEntries = {};
                        candles.t.forEach(function (ts, idx) {
                            // Normalize the candle timestamp to the Sunday that starts the trading week
                            // (matches the key format used in spData.js)
                            var d = new Date(ts * 1000);
                            var dayOfWeek = d.getUTCDay(); // 0=Sun, 1=Mon … 6=Sat
                            var sundayMs  = d.getTime() - dayOfWeek * 24 * 60 * 60 * 1000;
                            var dateKey   = new Date(sundayMs).toISOString().split('T')[0];
                            newEntries[dateKey] = {
                                open:  candles.o[idx],
                                high:  candles.h[idx],
                                low:   candles.l[idx],
                                close: candles.c[idx]
                            };
                        });

                        mergedHistory = Object.assign({}, mergedHistory, newEntries);

                        await docRef.set(
                            { history: mergedHistory, lastUpdated: new Date().toISOString() },
                            { merge: true }
                        );
                        console.log('SP500 weekly data refreshed in Firebase (+' + Object.keys(newEntries).length + ' weeks)');
                    }
                }
            } catch (e) {
                console.error('Failed to fetch/update SP500 weekly data from Finnhub', e);
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
 * Fetch realtime stock prices from Finnhub API + S&P 500 data.
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
    var todayForSpy = new Date();
    var oneYearAgoSpy = new Date(todayForSpy.getTime() - 365 * 24 * 60 * 60 * 1000);
    var spyFromTs = Math.floor(oneYearAgoSpy.getTime() / 1000);
    var spyToTs = Math.floor(todayForSpy.getTime() / 1000);

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

        var resSpy = await fetch('https://finnhub.io/api/v1/stock/candle?symbol=SPY&resolution=D&from=' + spyFromTs + '&to=' + spyToTs + '&token=' + key);
        var hasNewSpyDataToSave = false;
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