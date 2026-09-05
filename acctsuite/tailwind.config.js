/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './*.html',
    './admin/**/*.{html,js}',
    './owner/**/*.{php,html,js}',
    './js/**/*.js',
    './css/tailwind-src.css',
    './css/admin-app.css',
    './css/profile.css',
    './css/kyc.css',
    './css/legal.css',
    './css/ui-toast.css',
    './css/mobile-form.css',
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
        darkBg: '#0c0a14',
        darkCard: '#1a1525',
        lightBg: '#faf8ff',
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
