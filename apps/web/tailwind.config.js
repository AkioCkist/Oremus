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
        field: themed('field'),
        hover: themed('hover'),
        line: themed('line'),
        control: themed('control'),
        'control-hover': themed('control-hover'),
        'rail-hover': themed('rail-hover'),
        strong: themed('strong'),
        'primary-hover': themed('primary-hover'),
        stage: '#18191a',
        online: '#31a24c',
        brand: { 50: themed('brand-50'), 100: themed('brand-100'), 200: themed('brand-200'), 400: themed('brand-400'), 500: themed('brand-500'), 600: themed('brand-600'), 700: themed('brand-700'), 800: themed('brand-800') },
        // Kept as aliases so older markup keeps working.
        accent: { 50: themed('brand-50'), 100: themed('brand-100'), 500: themed('brand-500'), 600: themed('brand-600'), 700: themed('brand-700') },
        paper: themed('canvas')
      },
      fontFamily: {
        // Be Vietnam Pro is designed for Vietnamese: stacked diacritics render correctly at every weight.
        sans: ['"Be Vietnam Pro"', 'Segoe UI', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Be Vietnam Pro"', 'Segoe UI', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      fontSize: { '2xs': ['0.6875rem', '1rem'], 15: ['0.9375rem', '1.35rem'] },
      boxShadow: {
        card: '0 1px 2px rgba(0, 0, 0, 0.1)',
        pop: '0 12px 28px rgba(0, 0, 0, 0.2), 0 2px 4px rgba(0, 0, 0, 0.1)',
        float: '0 4px 12px rgba(0, 0, 0, 0.15)'
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
