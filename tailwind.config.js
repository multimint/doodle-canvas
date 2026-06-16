/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Legacy tokens kept for backward compat
        paper: '#fdfbf7',
        ink:   '#2d2d2d',
        muted: '#e5e0d8',
        accent: '#ff4d4d',
        'blue-pen': '#2d5da1',
        postit: '#fff9c4',
        // Modern Playful tokens
        'm-bg':      '#f4f5fb',
        'm-bg-2':    '#eceefb',
        'm-surface': '#ffffff',
        'm-ink':     '#14151c',
        'm-ink-2':   '#565a6e',
        'm-ink-3':   '#9298ad',
        'm-line':    '#e7e9f3',
        'm-line-2':  '#d9dcec',
        'm-primary': '#3d5afe',
        'm-green':   '#15cf7f',
      },
      fontFamily: {
        hand: ['Kalam', 'cursive'],
        body: ['"Patrick Hand"', 'cursive'],
        disp: ['Fredoka', 'system-ui', 'sans-serif'],
        ui:   ['"Space Grotesk"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        wobbly:     '255px 15px 225px 15px / 15px 225px 15px 255px',
        'wobbly-r': '15px 255px 15px 225px / 225px 15px 255px 15px',
        'wobbly-md':'185px 25px 155px 25px / 25px 155px 25px 185px',
        'wobbly-sm':'55px 15px 55px 15px / 15px 55px 15px 55px',
      },
      boxShadow: {
        hard:       '4px 4px 0px 0px #2d2d2d',
        'hard-lg':  '8px 8px 0px 0px #2d2d2d',
        'hard-sm':  '2px 2px 0px 0px #2d2d2d',
        'hard-red': '4px 4px 0px 0px #ff4d4d',
      },
    },
  },
  plugins: [],
}
