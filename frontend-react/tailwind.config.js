/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        darkBg: '#050508',
        panelBg: '#0a0a0f',
        accentGlow: '#00f0ff',
        accentSec: '#0050ff',
        danger: '#ff4d4d',
        success: '#00ff88',
        textMain: '#f0f0f5',
        textSec: '#9ba1b0',
      },
      fontFamily: {
        inter: ['Inter', 'sans-serif'],
        outfit: ['Outfit', 'sans-serif'],
      },
      backgroundImage: {
        'accent-gradient': 'linear-gradient(135deg, #00f0ff 0%, #0050ff 100%)',
        'app-radial': 'radial-gradient(circle at 0% 0%, rgba(0, 240, 255, 0.05) 0%, transparent 40%), radial-gradient(circle at 100% 100%, rgba(0, 80, 255, 0.05) 0%, transparent 40%)',
      },
      boxShadow: {
        'glow': '0 0 15px rgba(0, 240, 255, 0.4)',
        'glow-success': '0 0 15px rgba(0, 255, 136, 0.4)',
      }
    },
  },
  plugins: [],
}
