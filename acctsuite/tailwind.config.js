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
        brand: '#0A2748',
        brandPrimary: '#0A2748',
        brandHover: '#081F3A',
        skyBrand: '#0A2748',
        skyHover: '#081F3A',
        darkBg: '#061628',
        darkCard: '#0A2748',
        lightBg: '#f0f5fa',
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
