// js/loginScreen.js — Login/Register screen component (no JSX, works with file://)
(function () {
    var h = React.createElement;
    var useState = React.useState;

    var hebrewError = function (code) {
        var map = {
            'auth/user-not-found': 'לא נמצא משתמש עם כתובת דוא"ל זו',
            'auth/wrong-password': 'סיסמה שגויה',
            'auth/invalid-credential': 'דוא"ל או סיסמה שגויים',
            'auth/email-already-in-use': 'כתובת הדוא"ל כבר רשומה במערכת',
            'auth/weak-password': 'הסיסמה חלשה מדי — נדרשים לפחות 6 תווים',
            'auth/invalid-email': 'כתובת הדוא"ל אינה תקינה',
            'auth/too-many-requests': 'יותר מדי ניסיונות כניסה. נסה שוב מאוחר יותר',
            'auth/popup-closed-by-user': 'החלון נסגר לפני השלמת הכניסה',
            'auth/network-request-failed': 'בעיית רשת. בדוק את החיבור לאינטרנט',
        };
        return map[code] || 'אירעה שגיאה, אנא נסה שוב';
    };

    // Google SVG icon
    var GoogleIcon = function () {
        return h('svg', { width: 18, height: 18, viewBox: '0 0 18 18', xmlns: 'http://www.w3.org/2000/svg' },
            h('g', { fill: 'none', fillRule: 'evenodd' },
                h('path', { d: 'M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z', fill: '#4285F4' }),
                h('path', { d: 'M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z', fill: '#34A853' }),
                h('path', { d: 'M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z', fill: '#FBBC05' }),
                h('path', { d: 'M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z', fill: '#EA4335' })
            )
        );
    };

    window.LoginScreen = function (props) {
        var onLogin = props.onLogin;

        var _mode = useState('login');
        var mode = _mode[0], setMode = _mode[1];
        var _email = useState('');
        var email = _email[0], setEmail = _email[1];
        var _password = useState('');
        var password = _password[0], setPassword = _password[1];
        var _confirmPassword = useState('');
        var confirmPassword = _confirmPassword[0], setConfirmPassword = _confirmPassword[1];
        var _error = useState('');
        var error = _error[0], setError = _error[1];
        var _loading = useState(false);
        var loading = _loading[0], setLoading = _loading[1];

        var handleSubmit = function (e) {
            e.preventDefault();
            setError('');
            if (mode === 'register' && password !== confirmPassword) {
                setError('הסיסמאות אינן תואמות');
                return;
            }
            setLoading(true);
            var promise;
            if (mode === 'login') {
                promise = window.signInWithEmail(email, password);
            } else {
                promise = window.registerWithEmail(email, password);
            }
            promise.then(function (result) {
                onLogin(result.user);
            }).catch(function (err) {
                setError(hebrewError(err.code));
            }).finally(function () {
                setLoading(false);
            });
        };

        var handleGoogle = function () {
            setError('');
            setLoading(true);
            window.signInWithGoogle().then(function (result) {
                onLogin(result.user);
            }).catch(function (err) {
                setError(hebrewError(err.code));
            }).finally(function () {
                setLoading(false);
            });
        };

        var inputClass = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors';

        return h('div', { className: 'min-h-screen flex items-center justify-center bg-[#030712] p-4' },
            h('div', { className: 'w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl p-8' },
                // Header
                h('div', { className: 'text-center mb-8' },
                    h('h1', { className: 'text-2xl font-bold text-white mb-1' }, 'ניהול תיק השקעות'),
                    h('p', { className: 'text-gray-400 text-sm' }, mode === 'login' ? 'התחבר לחשבונך' : 'צור חשבון חדש')
                ),

                // Form
                h('form', { onSubmit: handleSubmit, className: 'space-y-4' },
                    // Email
                    h('div', null,
                        h('label', { className: 'block text-sm text-gray-400 mb-1' }, 'כתובת דוא"ל'),
                        h('input', { type: 'email', value: email, onChange: function (e) { setEmail(e.target.value); }, required: true, placeholder: 'you@example.com', className: inputClass, dir: 'ltr' })
                    ),
                    // Password
                    h('div', null,
                        h('label', { className: 'block text-sm text-gray-400 mb-1' }, 'סיסמה'),
                        h('input', { type: 'password', value: password, onChange: function (e) { setPassword(e.target.value); }, required: true, placeholder: 'לפחות 6 תווים', className: inputClass, dir: 'ltr' })
                    ),
                    // Confirm password (register only)
                    mode === 'register' && h('div', null,
                        h('label', { className: 'block text-sm text-gray-400 mb-1' }, 'אימות סיסמה'),
                        h('input', { type: 'password', value: confirmPassword, onChange: function (e) { setConfirmPassword(e.target.value); }, required: true, placeholder: 'הכנס שוב את הסיסמה', className: inputClass, dir: 'ltr' })
                    ),
                    // Error
                    error && h('div', { className: 'bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 text-red-400 text-sm' }, error),
                    // Submit
                    h('button', { type: 'submit', disabled: loading, className: 'w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors' },
                        loading ? 'מתחבר...' : mode === 'login' ? 'התחבר' : 'צור חשבון'
                    )
                ),

                // Divider
                h('div', { className: 'relative my-5' },
                    h('div', { className: 'absolute inset-0 flex items-center' },
                        h('div', { className: 'w-full border-t border-gray-700' })
                    ),
                    h('div', { className: 'relative flex justify-center text-sm' },
                        h('span', { className: 'px-3 bg-gray-900 text-gray-500' }, 'או')
                    )
                ),

                // Google button
                h('button', {
                    onClick: handleGoogle, disabled: loading,
                    className: 'w-full flex items-center justify-center gap-3 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed border border-gray-700 text-white font-medium py-2.5 rounded-lg transition-colors'
                },
                    h(GoogleIcon),
                    'המשך עם Google'
                ),

                // Toggle login/register
                h('p', { className: 'text-center text-sm text-gray-500 mt-6' },
                    mode === 'login' ? 'אין לך חשבון עדיין?' : 'כבר יש לך חשבון?',
                    ' ',
                    h('button', {
                        onClick: function () { setMode(mode === 'login' ? 'register' : 'login'); setError(''); },
                        className: 'text-blue-400 hover:text-blue-300 font-medium transition-colors'
                    }, mode === 'login' ? 'הירשם כאן' : 'התחבר כאן')
                )
            )
        );
    };
})();
