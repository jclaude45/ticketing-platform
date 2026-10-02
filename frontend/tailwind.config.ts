import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // ZAYA design (black / greys, like zaya.live): the former indigo / purple / violet
        // accents of the dashboard now resolve to the --indigo-*, --purple-*, --violet-*
        // greys of globals.css (lighter in dark mode)
        indigo: {
          50: 'rgb(var(--indigo-50) / <alpha-value>)',
          100: 'rgb(var(--indigo-100) / <alpha-value>)',
          200: 'rgb(var(--indigo-200) / <alpha-value>)',
          300: 'rgb(var(--indigo-300) / <alpha-value>)',
          400: 'rgb(var(--indigo-400) / <alpha-value>)',
          500: 'rgb(var(--indigo-500) / <alpha-value>)',
          600: 'rgb(var(--indigo-600) / <alpha-value>)',
          700: 'rgb(var(--indigo-700) / <alpha-value>)',
          800: 'rgb(var(--indigo-800) / <alpha-value>)',
          900: 'rgb(var(--indigo-900) / <alpha-value>)',
          950: 'rgb(var(--indigo-950) / <alpha-value>)',
        },
        purple: {
          50: 'rgb(var(--purple-50) / <alpha-value>)',
          100: 'rgb(var(--purple-100) / <alpha-value>)',
          200: 'rgb(var(--purple-200) / <alpha-value>)',
          300: 'rgb(var(--purple-300) / <alpha-value>)',
          400: 'rgb(var(--purple-400) / <alpha-value>)',
          500: 'rgb(var(--purple-500) / <alpha-value>)',
          600: 'rgb(var(--purple-600) / <alpha-value>)',
          700: 'rgb(var(--purple-700) / <alpha-value>)',
          800: 'rgb(var(--purple-800) / <alpha-value>)',
          900: 'rgb(var(--purple-900) / <alpha-value>)',
          950: 'rgb(var(--purple-950) / <alpha-value>)',
        },
        violet: {
          50: 'rgb(var(--violet-50) / <alpha-value>)',
          100: 'rgb(var(--violet-100) / <alpha-value>)',
          200: 'rgb(var(--violet-200) / <alpha-value>)',
          300: 'rgb(var(--violet-300) / <alpha-value>)',
          400: 'rgb(var(--violet-400) / <alpha-value>)',
          500: 'rgb(var(--violet-500) / <alpha-value>)',
          600: 'rgb(var(--violet-600) / <alpha-value>)',
          700: 'rgb(var(--violet-700) / <alpha-value>)',
          800: 'rgb(var(--violet-800) / <alpha-value>)',
          900: 'rgb(var(--violet-900) / <alpha-value>)',
          950: 'rgb(var(--violet-950) / <alpha-value>)',
        },
        brand: { DEFAULT: '#FFDD00', ink: '#181818', grey: '#707070', light: '#F7F7F7' },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-in': 'slide-in 0.3s ease-out',
        'pulse-soft': 'pulse-soft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};

export default config;
