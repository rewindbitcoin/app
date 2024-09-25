/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all of your component files.
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      letterSpacing: {
        tightest: '-0.15em'
      },
      colors: {
        backgroundDefault: '#f2f2f2',
        'card-secondary': '#555',
        // Create a custom color that uses a CSS custom value
        primary: 'rgb(var(--color-primary))',
        'primary-dark': 'rgb(var(--color-primary-dark))',
        'primary-light': 'rgb(var(--color-primary-light))',
        'primary-light-hover': 'rgb(var(--color-primary-light-hover))',
        notification: 'rgb(255, 59, 48)'
      },
      screens: {
        //https://www.appmysite.com/blog/the-complete-guide-to-iphone-screen-resolutions-and-sizes/
        //https://devhints.io/resolutions
        //https://github.com/GeekyAnts/NativeBase/issues/5217#issuecomment-1194435310
        mobmed: '360px',
        moblg: '412px'
        //moblg: '481px'
      }
    }
  },
  plugins: [
    // Set a default value on the `:root` element
    ({ addBase }) =>
      addBase({
        ':root': {
          '--color-primary': '0 122 255',
          '--color-primary-dark': '0 61 127',
          '--color-primary-light': '217 230 242',
          '--color-primary-light-hover': '195 207 218',
          '--color-card-secondary': '#555'
        }
      })
  ]
};
