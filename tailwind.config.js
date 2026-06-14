/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#fdfbf7',
        ink:   '#2d2d2d',
        muted: '#e5e0d8',
        accent: '#ff4d4d',
        'blue-pen': '#2d5da1',
        postit: '#fff9c4',
      },
      fontFamily: {
        hand: ['Kalam', 'cursive'],
        body: ['"Patrick Hand"', 'cursive'],
      },
      borderRadius: {
        wobbly:    '255px 15px 225px 15px / 15px 225px 15px 255px',
        'wobbly-r': '15px 255px 15px 225px / 225px 15px 255px 15px',
        'wobbly-md': '185px 25px 155px 25px / 25px 155px 25px 185px',
        'wobbly-sm': '55px 15px 55px 15px / 15px 55px 15px 55px',
      },
      boxShadow: {
        hard:    '4px 4px 0px 0px #2d2d2d',
        'hard-lg': '8px 8px 0px 0px #2d2d2d',
        'hard-sm': '2px 2px 0px 0px #2d2d2d',
        'hard-red': '4px 4px 0px 0px #ff4d4d',
      },
    },
  },
  plugins: [],
}
