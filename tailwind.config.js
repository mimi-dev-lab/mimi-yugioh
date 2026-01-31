/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 游戏王主题色
        'ygo': {
          'dark': '#1a1a2e',
          'darker': '#0f0f1a',
          'accent': '#eab308',
          'gold': '#fbbf24',
          'purple': '#7c3aed',
          'blue': '#3b82f6',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
