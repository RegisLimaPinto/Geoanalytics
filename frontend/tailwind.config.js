/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        geo: {
          50: '#fef9ee',
          100: '#fdf0d5',
          200: '#fbddaa',
          300: '#f7c274',
          400: '#f39e3c',
          500: '#f0821b',
          600: '#e16611',
          700: '#ba4c10',
          800: '#943c14',
          900: '#783313',
          950: '#411807',
        },
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
      },
    },
  },
  plugins: [],
}
