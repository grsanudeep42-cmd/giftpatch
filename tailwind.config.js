/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          teal: '#0F766E',
          'teal-light': '#14B8A6',
          'teal-dark': '#0D5C56',
        },
        cloud: '#F9F9FF',
        ink: '#111C2D',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(17,28,45,0.08), 0 1px 2px -1px rgba(17,28,45,0.06)',
        'card-md': '0 4px 6px -1px rgba(17,28,45,0.08), 0 2px 4px -2px rgba(17,28,45,0.06)',
        'card-lg': '0 10px 15px -3px rgba(17,28,45,0.08), 0 4px 6px -4px rgba(17,28,45,0.06)',
      },
    },
  },
  plugins: [],
}
