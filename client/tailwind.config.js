/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      boxShadow: {
        glow: '0 20px 80px rgba(0, 0, 0, 0.35)'
      },
      colors: {
        board: {
          950: '#120d0a',
          900: '#1c140f',
          800: '#2a1c15',
          700: '#4d3021',
          500: '#b56d45',
          300: '#f1b98f',
          100: '#f8e5d7'
        }
      }
    }
  },
  plugins: []
};
