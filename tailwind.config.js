/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
      "./src/**/*.{js,jsx,ts,tsx}",
    ],
    theme: {
      extend: {
        spacing: {
          '74': '74px',
        },
        gridTemplateColumns: {
          'auto-fit': 'repeat(auto-fill, minmax(74px, 74px))',
        },
        backgroundImage: {
          'decoration-gradient': 'linear-gradient(to bottom, black, rgb(31,41,55) 2%, rgb(31,41,55) 98%, black)',
        }
      },
    },
    plugins: [],
  }