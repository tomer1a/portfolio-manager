// =====================================================================
// icons.js — SVG Icon Components (no JSX, works with file:// protocol)
// =====================================================================
// Stateless React components that render inline SVG icons.
// Each icon is registered on `window` so it can be used across modules
// without a module bundler:  h(window.IconEdit), h(window.IconTrash), etc.
//
// All icons use the Feather Icons style: 24×24 viewBox, 2px stroke,
// round caps/joins, no fill.
// =====================================================================
(function () {
    var h = React.createElement;

    /** Upward trend arrow (used for positive daily change). */
    window.IconTrendingUp = function () {
        return h('svg', { xmlns: 'http://www.w3.org/2000/svg', width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
            h('polyline', { points: '22 7 13.5 15.5 8.5 10.5 2 17' }),
            h('polyline', { points: '16 7 22 7 22 13' })
        );
    };

    /** Downward trend arrow (used for negative daily change). */
    window.IconTrendingDown = function () {
        return h('svg', { xmlns: 'http://www.w3.org/2000/svg', width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
            h('polyline', { points: '22 17 13.5 8.5 8.5 13.5 2 7' }),
            h('polyline', { points: '16 17 22 17 22 11' })
        );
    };

    /** Gear/cog icon (20×20, used in the settings panel toggle). */
    window.IconSettings = function () {
        return h('svg', { xmlns: 'http://www.w3.org/2000/svg', width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
            h('circle', { cx: 12, cy: 12, r: 3 }),
            h('path', { d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z' })
        );
    };

    /** Trash can icon (used on position/transaction delete buttons). */
    window.IconTrash = function () {
        return h('svg', { xmlns: 'http://www.w3.org/2000/svg', width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
            h('polyline', { points: '3 6 5 6 21 6' }),
            h('path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' })
        );
    };

    /** Pencil-on-paper icon (used on position edit buttons). */
    window.IconEdit = function () {
        return h('svg', { xmlns: 'http://www.w3.org/2000/svg', width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
            h('path', { d: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' }),
            h('path', { d: 'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' })
        );
    };

    /** Circular refresh arrow (20×20, used on the "refresh prices" button). */
    window.IconRefresh = function () {
        return h('svg', { xmlns: 'http://www.w3.org/2000/svg', width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
            h('path', { d: 'M21 2v6h-6' }),
            h('path', { d: 'M3 12a9 9 0 1 0 2.81-6.61L21 8' })
        );
    };

    /** Open eye icon (20×20, used for "show values" toggle). */
    window.IconEyeOpen = function () {
        return h('svg', { xmlns: 'http://www.w3.org/2000/svg', width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
            h('path', { d: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z' }),
            h('circle', { cx: 12, cy: 12, r: 3 })
        );
    };

    /** Closed eye with strike-through (20×20, used for "hide values" toggle). */
    window.IconEyeClosed = function () {
        return h('svg', { xmlns: 'http://www.w3.org/2000/svg', width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
            h('path', { d: 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24' }),
            h('line', { x1: 1, y1: 1, x2: 23, y2: 23 })
        );
    };

    /** User silhouette icon (used for account/profile display). */
    window.IconUser = function () {
        return h('svg', { xmlns: 'http://www.w3.org/2000/svg', width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
            h('path', { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' }),
            h('circle', { cx: 12, cy: 7, r: 4 })
        );
    };

    /** Door-with-arrow sign-out icon (20×20, used in the header logout button). */
    window.IconSignOut = function () {
        return h('svg', { xmlns: 'http://www.w3.org/2000/svg', width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
            h('path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }),
            h('polyline', { points: '16 17 21 12 16 7' }),
            h('line', { x1: 21, y1: 12, x2: 9, y2: 12 })
        );
    };
})();
