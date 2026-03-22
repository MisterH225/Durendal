/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        blue: {
          50:  '#EEF6FD',
          100: '#D9ECFB',
          200: '#B8D8F0',
          300: '#82B8E0',
          400: '#4A90CC',
          500: '#2272B3',
          600: '#1A5F9A',
          700: '#0F4C81', // DOMINANT
          800: '#0A3D6E',
          900: '#062B4F',
        },
        neutral: {
          50:  '#F8FAFC',
          100: '#F0F4F8',
          200: '#E2E8F0',
          300: '#CBD5E0',
          400: '#A0AEC0',
          500: '#718096',
          600: '#4A5568',
          700: '#2D3748',
          800: '#1C2333',
          900: '#0D1117',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: {
        sm: '6px',
        md: '9px',
        lg: '13px',
        xl: '18px',
      },
      boxShadow: {
        sm: '0 1px 3px rgba(6,43,79,.08)',
        md: '0 4px 12px rgba(6,43,79,.12)',
        lg: '0 8px 24px rgba(6,43,79,.16)',
      },
    },
  },
  plugins: [],
}
