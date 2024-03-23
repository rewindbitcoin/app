/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all of your component files.
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        backgroundDefault: '#f2f2f2',
        // Create a custom color that uses a CSS custom value
        primary: 'rgb(var(--color-primary) / <alpha-value>)',
        notification: 'rgb(255, 59, 48)'
      },
      screens: {
        //https://devhints.io/resolutions
        mobmed: '360px'
      }
    }
  },
  plugins: [
    // Set a default value on the `:root` element
    ({ addBase }) => addBase({ ':root': { '--color-primary': '0 122 255' } })
  ]
};
