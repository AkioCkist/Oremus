/** @type {import('tailwindcss').Config} */

// Theme colours are CSS variables (RGB channels) defined in styles.css for light / dark / system.
const themed = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ['./src/views/**/*.ejs', './src/views-or-client/**/*.ts', './src/utils/view-helpers.ts'],
  // Built from data at render time (avatar tones, story backgrounds), so the scanner cannot see them.
  safelist: [{ pattern: /^tone-[0-7]$/ }, { pattern: /^bg-story-[a-z]+$/ }],
  darkMode: ['variant', ['&:is([data-theme="dark"] *)', '@media (prefers-color-scheme: dark) { &:is([data-theme="system"] *) }']],
  theme: {
    extend: {
      colors: {
        ink: themed('ink'),
        muted: themed('muted'),
        subtle: themed('subtle'),
        canvas: themed('canvas'),
        surface: themed('surface'),
        grouped: themed('grouped'),
        elevated: themed('elevated'),
        field: themed('field'),
        hover: themed('hover'),
        line: themed('line'),
        control: themed('control'),
        'control-hover': themed('control-hover'),
        'rail-hover': themed('rail-hover'),
        strong: themed('strong'),
        'primary-hover': themed('primary-hover'),
        stage: '#000000',
        online: themed('green'),
        // iOS 27 system accents (Figma: Colors / Accents), light & dark values in styles.css.
        ios: { red: themed('red'), orange: themed('orange'), yellow: themed('yellow'), green: themed('green'), teal: themed('teal'), blue: themed('blue'), indigo: themed('indigo'), purple: themed('purple'), pink: themed('pink') },
        brand: { 50: themed('brand-50'), 100: themed('brand-100'), 200: themed('brand-200'), 400: themed('brand-400'), 500: themed('brand-500'), 600: themed('brand-600'), 700: themed('brand-700'), 800: themed('brand-800') },
        // Kept as aliases so older markup keeps working.
        accent: { 50: themed('brand-50'), 100: themed('brand-100'), 500: themed('brand-500'), 600: themed('brand-600'), 700: themed('brand-700') },
        paper: themed('canvas')
      },
      fontFamily: {
        // SF Pro is the iOS 27 kit face. It is licensed for Apple platforms only, so it is never bundled:
        // Apple devices render it through the system stack, everything else falls back to Inter (the kit's stand-in, full Vietnamese support).
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', 'Inter', '"Be Vietnam Pro"', '"Segoe UI"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', 'Inter', '"Be Vietnam Pro"', '"Segoe UI"', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      // iOS 27 text styles (Figma: Text Styles and Dynamic Type, Large size).
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '0.8125rem', letterSpacing: '0.06px' }],
        15: ['0.9375rem', { lineHeight: '1.25rem', letterSpacing: '-0.23px' }],
        'large-title': ['2.125rem', { lineHeight: '2.5625rem', letterSpacing: '0.4px' }],
        title1: ['1.75rem', { lineHeight: '2.125rem', letterSpacing: '0.38px' }],
        title2: ['1.375rem', { lineHeight: '1.75rem', letterSpacing: '-0.26px' }],
        title3: ['1.25rem', { lineHeight: '1.5625rem', letterSpacing: '-0.45px' }],
        headline: ['1.0625rem', { lineHeight: '1.375rem', letterSpacing: '-0.43px' }],
        body: ['1.0625rem', { lineHeight: '1.375rem', letterSpacing: '-0.43px' }],
        callout: ['1rem', { lineHeight: '1.3125rem', letterSpacing: '-0.31px' }],
        subheadline: ['0.9375rem', { lineHeight: '1.25rem', letterSpacing: '-0.23px' }],
        footnote: ['0.8125rem', { lineHeight: '1.125rem', letterSpacing: '-0.08px' }],
        caption1: ['0.75rem', { lineHeight: '1rem' }],
        caption2: ['0.6875rem', { lineHeight: '0.8125rem', letterSpacing: '0.06px' }]
      },
      // Corner radii follow the kit: concentric, rounder shapes; sheets/popovers use 38pt on iPhone, 32pt on iPad.
      borderRadius: { md: '0.625rem', lg: '0.875rem', xl: '1.25rem', '2xl': '1.625rem', '3xl': '2rem', sheet: '2rem', popover: '1.75rem' },
      // Shadows are theme-aware CSS variables (Liquid Glass light vs dark), see styles.css.
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
        float: 'var(--shadow-float)',
        glass: 'var(--shadow-glass)'
      },
      maxWidth: { feed: '42.5rem' },
      keyframes: {
        'pop-in': { '0%': { opacity: '0', transform: 'translateY(6px) scale(.96)' }, '100%': { opacity: '1', transform: 'none' } },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } }
      },
      animation: { 'pop-in': 'pop-in .16s ease-out', 'fade-in': 'fade-in .2s ease-out' }
    }
  },
  plugins: []
};
