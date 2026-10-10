/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/views/**/*.ejs', './src/views-or-client/**/*.ts', './src/utils/view-helpers.ts'],
  // Built from data at render time (avatar tones, story backgrounds), so the scanner cannot see them.
  safelist: [{ pattern: /^tone-[0-7]$/ }, { pattern: /^bg-story-(sunset|ocean|forest|night|candy|sun)$/ }],
  theme: {
    extend: {
      colors: {
        // Text + surfaces follow Facebook's neutral ramp; brand follows the reference mockups.
        ink: '#050505',
        muted: '#65676b',
        subtle: '#8a8d91',
        canvas: '#f0f2f5',
        field: '#f0f2f5',
        hover: '#f2f2f2',
        line: '#e4e6eb',
        stage: '#18191a',
        online: '#31a24c',
        brand: { 50: '#eef0fc', 100: '#dde1f9', 200: '#bcc3f2', 400: '#6c78e0', 500: '#4f5bd5', 600: '#4150cf', 700: '#3540b0', 800: '#2b3490' },
        // Kept as an alias so older markup keeps working.
        accent: { 50: '#eef0fc', 100: '#dde1f9', 500: '#4f5bd5', 600: '#4150cf', 700: '#3540b0' },
        paper: '#f0f2f5'
      },
      fontFamily: {
        sans: ['"Red Hat Text"', 'Segoe UI', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Red Hat Display"', '"Red Hat Text"', 'Segoe UI', 'ui-sans-serif', 'sans-serif']
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
