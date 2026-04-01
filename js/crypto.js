// =====================================================================
// crypto.js — Client-side AES-256-GCM encryption for user portfolio data
// =====================================================================
// Uses the Web Crypto API to encrypt/decrypt sensitive portfolio data
// before storing in Firestore. Each user gets a unique encryption key
// derived from their UID via PBKDF2.
// =====================================================================

(function () {
    'use strict';

    // Application-level salt for key derivation (combined with user UID)
    var APP_SALT = 'stock-portfolio-enc-v1-3f66d';

    // Fields that contain sensitive user data and should be encrypted
    var SENSITIVE_FIELDS = ['positions', 'cash', 'cashRate', 'apiKey',
        'initialInvestment', 'investmentRate', 'cashDeposits'];

    /**
     * Convert a string to an ArrayBuffer (UTF-8).
     */
    function strToBuffer(str) {
        return new TextEncoder().encode(str);
    }

    /**
     * Convert an ArrayBuffer to a Base64 string.
     */
    function bufferToBase64(buffer) {
        var bytes = new Uint8Array(buffer);
        var binary = '';
        for (var i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    /**
     * Convert a Base64 string to an ArrayBuffer.
     */
    function base64ToBuffer(base64) {
        var binary = atob(base64);
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    /**
     * Derive an AES-256-GCM key from the user's UID using PBKDF2.
     * Each user gets a unique, deterministic encryption key.
     *
     * @param {string} uid — Firebase user UID
     * @returns {Promise<CryptoKey>}
     */
    async function deriveKey(uid) {
        var keyMaterial = await crypto.subtle.importKey(
            'raw',
            strToBuffer(uid),
            { name: 'PBKDF2' },
            false,
            ['deriveKey']
        );

        var salt = strToBuffer(APP_SALT + uid);

        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Encrypt a JavaScript value (object/array/primitive) using AES-256-GCM.
     * Returns a string containing the Base64-encoded IV + ciphertext.
     *
     * @param {*} data — the value to encrypt
     * @param {CryptoKey} key — the AES-GCM key
     * @returns {Promise<string>} — "iv:ciphertext" in Base64
     */
    async function encryptValue(data, key) {
        var plaintext = JSON.stringify(data);
        var iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM

        var ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            strToBuffer(plaintext)
        );

        return bufferToBase64(iv.buffer) + ':' + bufferToBase64(ciphertext);
    }

    /**
     * Decrypt a value previously encrypted with encryptValue.
     *
     * @param {string} encryptedStr — "iv:ciphertext" in Base64
     * @param {CryptoKey} key — the AES-GCM key
     * @returns {Promise<*>} — the original JavaScript value
     */
    async function decryptValue(encryptedStr, key) {
        var parts = encryptedStr.split(':');
        if (parts.length !== 2) throw new Error('Invalid encrypted format');

        var iv = new Uint8Array(base64ToBuffer(parts[0]));
        var ciphertext = base64ToBuffer(parts[1]);

        var plainBuffer = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            ciphertext
        );

        var plaintext = new TextDecoder().decode(plainBuffer);
        return JSON.parse(plaintext);
    }

    // ---- Key cache (one key per UID per session) ----
    var keyCache = {};

    async function getKey(uid) {
        if (!keyCache[uid]) {
            keyCache[uid] = await deriveKey(uid);
        }
        return keyCache[uid];
    }

    // =====================================================================
    // Public API
    // =====================================================================

    /**
     * Encrypt a portfolio data object before saving to Firestore.
     * Sensitive fields are individually encrypted; a metadata flag is added.
     *
     * @param {string} uid — Firebase user UID
     * @param {Object} data — plain portfolio data object
     * @returns {Promise<Object>} — object with encrypted fields + _encrypted flag
     */
    window.encryptPortfolioData = async function (uid, data) {
        if (!uid || !data) return data;
        if (!crypto || !crypto.subtle) {
            console.warn('Web Crypto API not available — saving data unencrypted');
            return data;
        }

        try {
            var key = await getKey(uid);
            var encrypted = {};

            for (var field in data) {
                if (!data.hasOwnProperty(field)) continue;

                if (SENSITIVE_FIELDS.indexOf(field) !== -1 && data[field] !== undefined && data[field] !== null) {
                    encrypted[field] = await encryptValue(data[field], key);
                } else {
                    encrypted[field] = data[field];
                }
            }

            encrypted._encrypted = true;
            encrypted._encVersion = 1;
            return encrypted;
        } catch (e) {
            console.error('Encryption failed, saving unencrypted:', e);
            return data;
        }
    };

    /**
     * Decrypt a portfolio data object loaded from Firestore.
     * Only decrypts if the _encrypted flag is present.
     *
     * @param {string} uid — Firebase user UID
     * @param {Object} data — potentially encrypted data from Firestore
     * @returns {Promise<Object>} — plain data object
     */
    window.decryptPortfolioData = async function (uid, data) {
        if (!uid || !data || !data._encrypted) return data;
        if (!crypto || !crypto.subtle) {
            console.warn('Web Crypto API not available — cannot decrypt data');
            return data;
        }

        try {
            var key = await getKey(uid);
            var decrypted = {};

            for (var field in data) {
                if (!data.hasOwnProperty(field)) continue;
                if (field === '_encrypted' || field === '_encVersion') continue;

                if (SENSITIVE_FIELDS.indexOf(field) !== -1 && typeof data[field] === 'string') {
                    decrypted[field] = await decryptValue(data[field], key);
                } else {
                    decrypted[field] = data[field];
                }
            }

            return decrypted;
        } catch (e) {
            console.error('Decryption failed:', e);
            throw new Error('Failed to decrypt portfolio data. The data may have been encrypted with a different account.');
        }
    };

    /**
     * Encrypt a daily snapshot object before saving.
     *
     * @param {string} uid — Firebase user UID
     * @param {Object} snapshot — plain snapshot data
     * @returns {Promise<Object>} — encrypted snapshot
     */
    window.encryptSnapshot = async function (uid, snapshot) {
        if (!uid || !snapshot) return snapshot;
        if (!crypto || !crypto.subtle) return snapshot;

        try {
            var key = await getKey(uid);
            var encrypted = {
                date: snapshot.date,
                timestamp: snapshot.timestamp,
                _encrypted: true,
                _encVersion: 1,
                payload: await encryptValue({
                    totalValueUSD: snapshot.totalValueUSD,
                    positions: snapshot.positions,
                    cash: snapshot.cash
                }, key)
            };
            return encrypted;
        } catch (e) {
            console.error('Snapshot encryption failed:', e);
            return snapshot;
        }
    };

    /**
     * Decrypt a daily snapshot object loaded from Firestore.
     *
     * @param {string} uid — Firebase user UID
     * @param {Object} snapshot — potentially encrypted snapshot
     * @returns {Promise<Object>} — plain snapshot data
     */
    window.decryptSnapshot = async function (uid, snapshot) {
        if (!uid || !snapshot || !snapshot._encrypted) return snapshot;
        if (!crypto || !crypto.subtle) return snapshot;

        try {
            var key = await getKey(uid);
            var payload = await decryptValue(snapshot.payload, key);
            return Object.assign({}, snapshot, payload, { _encrypted: undefined, _encVersion: undefined, payload: undefined });
        } catch (e) {
            console.error('Snapshot decryption failed:', e);
            return snapshot;
        }
    };

    /**
     * One-time migration: encrypt all existing unencrypted data in Firestore.
     * Run from console: window.migrateToEncryption()
     */
    window.migrateToEncryption = async function () {
        var auth = window.firebase.auth();
        var db = window.firebase.firestore();
        var user = auth.currentUser;
        if (!user) { console.error('Not logged in'); return; }

        var appId = window.__app_id || 'default-app-id';
        var uid = user.uid;
        var basePath = db.collection('artifacts').doc(appId)
            .collection('users').doc(uid).collection('portfolio');

        // 1. Encrypt main document
        console.log('Encrypting main portfolio document...');
        var mainRef = basePath.doc('main');
        var mainSnap = await mainRef.get();
        if (mainSnap.exists) {
            var mainData = mainSnap.data();
            if (!mainData._encrypted) {
                var encrypted = await window.encryptPortfolioData(uid, mainData);
                await mainRef.set(encrypted, { merge: false });
                console.log('Main document encrypted successfully.');
            } else {
                console.log('Main document is already encrypted.');
            }
        }

        // 2. Encrypt all daily snapshots
        console.log('Encrypting daily snapshots...');
        var snapshots = await basePath.doc('snapshots').collection('daily').get();
        var count = 0;
        for (var i = 0; i < snapshots.docs.length; i++) {
            var doc = snapshots.docs[i];
            var data = doc.data();
            if (!data._encrypted) {
                var encSnap = await window.encryptSnapshot(uid, data);
                await basePath.doc('snapshots').collection('daily').doc(doc.id).set(encSnap);
                count++;
            }
        }
        console.log('Encrypted ' + count + ' snapshots. Migration complete!');
    };

})();
