/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Orbitron', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'count-pop': {
          '0%': { transform: 'scale(2.2)', opacity: '0' },
          '25%': { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(0.85)', opacity: '0' },
        },
        'slide-up': {
          from: { transform: 'translateY(12px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        'count-pop': 'count-pop 1s ease-out forwards',
        'slide-up': 'slide-up 0.35s ease-out both',
      },
    },
  },
  plugins: [],
};
