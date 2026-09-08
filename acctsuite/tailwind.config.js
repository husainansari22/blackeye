/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './*.html',
    './admin/**/*.{html,js}',
    './owner/**/*.{php,html,js}',
    './js/**/*.js',
    './css/**/*.css',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        brand: '#8B5CF6',
        brandPrimary: '#8B5CF6',
        brandHover: '#7C3AED',
        skyBrand: '#8B5CF6',
        skyHover: '#7C3AED',
        darkBg: '#0f172a',
        darkCard: '#1e293b',
        lightBg: '#f0f4f8',
        lightCard: '#ffffff',
      },
    },
  },
  plugins: [],
  safelist: [
    // dynamically toggled in JS
    'hidden',
    'flex',
    'text-brandPrimary',
    'border-brandPrimary',
    'border-b-2',
    'text-slate-400',
    'bg-brandPrimary',
    'bg-brandHover',
    'is-active',
    'is-idle',
    'has-photo',
    'dark',
  ],
};
