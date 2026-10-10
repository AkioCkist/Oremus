/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/views/**/*.ejs', './src/views-or-client/**/*.ts'],
  theme: {
    extend: {
      colors: {
        ink: '#18201d',
        paper: '#f5f7f4',
        accent: { 50: '#edf8f2', 100: '#d6f0e1', 500: '#21875b', 600: '#176e49', 700: '#145a3e' }
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] }
    }
  },
  plugins: []
};

