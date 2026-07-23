/** @type {import('tailwindcss').Config} */
//
// Control-room design system for the TMRW Sports KB.
//
// This is a dark UI. The app's pages use color tokens semantically — low
// numbers for light fills, high numbers for dark text — so every ramp here is
// LIGHTNESS-INVERTED (50 = darkest, 900/950 = lightest) while keeping its hue.
// That flips the whole app to dark without rewriting per-page utilities:
// `text-dark-900` becomes light text, `bg-dark-50` becomes the ground, and so
// on. `gray`/`slate` are aliased to the same neutral ramp to catch built-in
// utilities. Hues: primary = signal green (accent), danger = tally red,
// warning = amber, accent = a cool info blue.

const neutral = {
  50: '#0A0D12',   // ground (darkest)
  100: '#10141C',  // panel
  200: '#171D28',  // raised / hover
  300: '#232B3A',  // hairline border
  400: '#323C4F',  // stronger border
  500: '#5A6577',  // faint text
  600: '#828EA3',  // muted text
  700: '#A9B4C6',  // secondary text
  800: '#C9D2E0',  // strong text
  900: '#E7ECF4',  // primary text (lightest)
  950: '#F4F7FB',
};

const signal = {
  50: '#052A1E',
  100: '#073826',
  200: '#0A5F45',
  300: '#0E9D6F',
  400: '#12C489',
  500: '#17E6A0',  // the accent
  600: '#3EEDB0',
  700: '#6FF3C6',
  800: '#A8F8DC',
  900: '#D6FCEE',
  950: '#EAFEF7',
};

const tally = {
  50: '#2A0B0B',
  100: '#3A0F0F',
  200: '#611A1A',
  300: '#9E2B2B',
  400: '#E23B3B',
  500: '#FF4646',
  600: '#FF6A6A',
  700: '#FF9090',
  800: '#FFC0C0',
  900: '#FFDCDC',
};

const amber = {
  50: '#2A1E05',
  100: '#3A2908',
  200: '#61450F',
  300: '#9E6E18',
  400: '#E29A20',
  500: '#FFB020',
  600: '#FFC24E',
  700: '#FFD584',
  800: '#FFE7B8',
  900: '#FFF3D8',
};

const info = {
  50: '#061726',
  100: '#0A2033',
  200: '#0F3A5F',
  300: '#1A5F9E',
  400: '#2E88E0',
  500: '#4EA8FF',
  600: '#74BCFF',
  700: '#9CD0FF',
  800: '#C6E4FF',
  900: '#E4F2FF',
};

module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        display: ['"Saira Semi Condensed"', '"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', '"SF Mono"', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        primary: signal,
        accent: info,
        success: signal,
        warning: amber,
        danger: tally,
        dark: neutral,
        gray: neutral,
        slate: neutral,
      },
      boxShadow: {
        'glow': '0 0 20px rgba(23, 230, 160, 0.25)',
        'glow-lg': '0 0 40px rgba(23, 230, 160, 0.30)',
        'soft': '0 2px 15px -3px rgba(0, 0, 0, 0.4), 0 10px 20px -2px rgba(0, 0, 0, 0.3)',
        'soft-lg': '0 20px 50px -20px rgba(0, 0, 0, 0.7), 0 2px 10px -2px rgba(0, 0, 0, 0.4)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(10px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideIn: { '0%': { opacity: '0', transform: 'translateX(-10px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'mesh-gradient': 'linear-gradient(135deg, #0A5F45 0%, #0F3A5F 100%)',
      },
    },
  },
  plugins: [],
}
