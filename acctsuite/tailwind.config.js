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
        brand: '#F85830',
        brandPrimary: '#F85830',
        brandHover: '#E04A28',
        skyBrand: '#F85830',
        skyHover: '#E04A28',
        darkBg: '#0c0a09',
        darkCard: '#1a1410',
        lightBg: '#fffaf7',
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
