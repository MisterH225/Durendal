/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Palette primaire — orange chaud (remplace le bleu)
        blue: {
          50:  '#FFF7ED',
          100: '#FFEDD5',
          200: '#FED7AA',
          300: '#FDBA74',
          400: '#FB923C',
          500: '#F97316',
          600: '#EA580C',
          700: '#EA580C', // DOMINANT — orange primaire
          800: '#C2410C',
          900: '#7C2D12',
        },
        // Neutrals chauds (fond beige, textes)
        neutral: {
          50:  '#FAFAF8',
          100: '#F5EFE6', // fond page principal — beige chaud
          200: '#EAE4DA',
          300: '#D4CABF',
          400: '#A89E93',
          500: '#7C7268',
          600: '#574E45',
          700: '#3A3028',
          800: '#261E17',
          900: '#1A120A',
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
        sm: '0 1px 3px rgba(26,18,10,.06)',
        md: '0 4px 12px rgba(26,18,10,.10)',
        lg: '0 8px 24px rgba(26,18,10,.14)',
      },
    },
  },
  plugins: [],
}
