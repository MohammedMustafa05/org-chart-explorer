/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        ink: { DEFAULT: '#0b0b0b', 2: '#52514e', 3: '#898781' },
        plane: '#f9f9f7',
        surface: '#fcfcfb',
        line: '#e1e0d9',
        mgmt: '#2a78d6',
        ic: '#eb6834',
      },
    },
  },
  plugins: [],
}
