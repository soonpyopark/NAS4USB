/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,jsx,ts,tsx,html}', './shared/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Accent tokens resolve at runtime from the CSS variables in styles/index.css,
        // which 설정 → 일반 → 테마 색상 rewrites. See shared/theme.js.
        nas: {
          sidebar: 'rgb(var(--nas-sidebar) / <alpha-value>)',
          sidebarHover: 'rgb(var(--nas-sidebar-hover) / <alpha-value>)',
          accent: 'rgb(var(--nas-accent) / <alpha-value>)',
          accentHover: 'rgb(var(--nas-accent-hover) / <alpha-value>)',
          accentSoft: 'rgb(var(--nas-accent-soft) / <alpha-value>)',
          accentSoftHover: 'rgb(var(--nas-accent-soft-hover) / <alpha-value>)',
          accentBorder: 'rgb(var(--nas-accent-border) / <alpha-value>)',
          accentText: 'rgb(var(--nas-accent-text) / <alpha-value>)',
          surface: '#f8fafc',
          border: '#e2e8f0',
          muted: '#64748b',
        },
      },
      fontFamily: {
        sans: ['"Segoe UI"', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
