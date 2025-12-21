/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'vintage-cream': '#FDFBF7',
        'vintage-teal': '#2A9D8F', // Muted Teal
        'vintage-orange': '#E76F51', // Burnt Orange
        'vintage-dark': '#264653', // Dark Blue/Green
        'vintage-beige': '#E9C46A',
      },
      fontFamily: {
        sans: ['Oswald', 'sans-serif'], // User requested condensed font like Oswald
      },
      backgroundImage: {
        'paper-texture': "url('/noise.svg')", // We will need to generate this or use a CSS filter
      }
    },
  },
  plugins: [],
}
