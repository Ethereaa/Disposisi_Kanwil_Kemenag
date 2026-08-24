/** @type {import('tailwindcss').Config} */

// ─────────────────────────────────────────────────────────────────────────────
// "KANWIL COMMAND" DESIGN FOUNDATION
//
// Principle: authority through restraint. Premium comes from hierarchy,
// typography, spacing, surface discipline and consistent components — not
// from gradients, pervasive glass, or animation.
//
// The scales below are deliberately SMALL. Every token here has to justify
// itself, because the alternative (what this replaces) was 160 ad-hoc
// `rounded-*`, 25 ad-hoc `shadow-*` and 21 arbitrary `text-[11px]` values
// with no single source of truth.
//
// New tokens are given ROLE names (`rounded-panel`, `text-label`,
// `shadow-raised`) rather than overriding Tailwind's built-in `sm`/`md`/`lg`
// keys. That is intentional: redefining `rounded-md` would silently restyle
// every existing usage across the app in one commit. Role names let later
// phases migrate page by page, reviewably.
// ─────────────────────────────────────────────────────────────────────────────

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],

  // Foundation classes that exist for LATER phases to consume. `content`
  // does not scan index.css, and Tailwind purges an unreferenced
  // `@layer components` class by its own name — so without this, the light
  // `.surface-overlay` and `.accent-rule-gold` rules would be dropped from
  // the bundle while their `.dark …` counterparts survived (those key on the
  // `dark` candidate, which is always in use). That asymmetry is a trap: the
  // class would appear to work in dark mode and silently do nothing in light.
  safelist: ['surface-overlay', 'accent-rule-gold'],

  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },

      // ── TYPOGRAPHY ────────────────────────────────────────────────────────
      // A 7-step semantic ramp, not a size list. Pick by ROLE, never by
      // pixel value. `micro` and `label` carry their own tracking because
      // small uppercase text needs it to stay legible; apply `uppercase`
      // separately (Tailwind's fontSize options cannot set text-transform).
      fontSize: {
        display: ['1.875rem', { lineHeight: '2.25rem', letterSpacing: '-0.02em', fontWeight: '700' }],
        title: ['1.25rem', { lineHeight: '1.75rem', letterSpacing: '-0.01em', fontWeight: '700' }],
        heading: ['1rem', { lineHeight: '1.5rem', fontWeight: '600' }],
        body: ['0.875rem', { lineHeight: '1.375rem', fontWeight: '400' }],
        'body-strong': ['0.875rem', { lineHeight: '1.375rem', fontWeight: '600' }],
        label: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.02em', fontWeight: '600' }],
        micro: ['0.6875rem', { lineHeight: '0.875rem', letterSpacing: '0.06em', fontWeight: '600' }],
      },

      // ── RADIUS ────────────────────────────────────────────────────────────
      // Three steps only. Deliberately less round than the previous
      // `rounded-2xl`-everywhere look: heavy rounding reads consumer-app,
      // 8/12/16px reads institutional.
      borderRadius: {
        chip: '0.5rem',    //  8px — badges, chips, inputs, small controls
        control: '0.75rem', // 12px — buttons, icon buttons, small cards
        panel: '1rem',      // 16px — panels, cards, modals, sheets
      },

      // ── ELEVATION ─────────────────────────────────────────────────────────
      // Three levels. Borders carry structure; shadows carry layering only.
      //   flat    → default panel. Bordered, essentially unlifted.
      //   raised  → interactive card that responds to hover/focus.
      //   overlay → modal, sheet, dropdown, popover. Nothing else.
      boxShadow: {
        flat: '0 1px 2px 0 rgb(15 23 42 / 0.04)',
        raised: '0 1px 3px 0 rgb(15 23 42 / 0.08), 0 1px 2px -1px rgb(15 23 42 / 0.06)',
        overlay: '0 16px 40px -8px rgb(15 23 42 / 0.18), 0 4px 12px -4px rgb(15 23 42 / 0.10)',
      },

      colors: {
        office: {
          bg: '#F8FAFC',
          // The one canonical app canvas, replacing six copies of a
          // hand-written dual-gradient recipe. Neutral and untinted on
          // purpose — the brand green is structural, not ambient.
          canvas: '#F5F7FA',
          canvasDark: '#0B1220',
          // Sidebar gradient endpoints (matches the diagonal gradient used in Layout.tsx)
          sidebar: '#0F172A',
          sidebarAccent: '#166534',
          // Brand gradient endpoints — used for primary buttons, table headers, the FAB
          primary: '#059669',
          primaryHover: '#047857',
          accent: '#0D9488',
          accentHover: '#0F766E',
          text: '#1F2937',
          subtext: '#6B7280',
          border: '#E5E7EB',
          borderStrong: '#D5DBE3',
          // RESTRICTED ACCENT. Institutional gold, for premium detail only:
          // a hero rule, a divider, a small icon accent. It is NEVER a
          // primary action colour and must not spread across cards,
          // buttons or table surfaces.
          gold: '#B08927',
          goldSoft: '#D8B25A',
        },

        // Semantic disposisi vocabulary, promoted from the literal Tailwind
        // classes already hardcoded inside StatusBadge so later phases have
        // one name to reference. StatusBadge itself is NOT rewired here —
        // its logic and its rendered colours are unchanged.
        status: {
          baru: '#64748B',      // slate  — recorded, not yet worked
          diproses: '#D97706',  // amber  — in progress
          selesai: '#059669',   // emerald— done
          terlambat: '#E11D48', // rose   — past the overdue threshold
        },
      },

      // ── MOTION ────────────────────────────────────────────────────────────
      // Two durations, one easing. `fast` is feedback (press, hover, focus);
      // `normal` is transition (enter, exit, layout). Nothing exceeds 300ms,
      // nothing loops, nothing bounces. Honoured only when the user has not
      // asked for reduced motion — see the prefers-reduced-motion block in
      // src/index.css, which is authoritative.
      transitionDuration: {
        fast: '120ms',
        normal: '220ms',
      },
      transitionTimingFunction: {
        brand: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },

      keyframes: {
        'slide-in-right': {
          from: { transform: 'translateX(120%)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'scale-in': {
          from: { transform: 'scale(0.96)', opacity: '0' },
          to: { transform: 'scale(1)', opacity: '1' },
        },
        'slide-up': {
          from: { transform: 'translateY(8px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        // Route transition. 4px is the ceiling on purpose: enough to read as
        // "the page changed", too little to read as motion. Nothing bounces and
        // nothing delays the route — the content is already mounted and
        // interactive while this plays.
        'page-in': {
          from: { transform: 'translateY(4px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        'slide-in-right': 'slide-in-right 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in': 'fade-in 0.12s ease-out',
        'scale-in': 'scale-in 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up': 'slide-up 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        'page-in': 'page-in 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
