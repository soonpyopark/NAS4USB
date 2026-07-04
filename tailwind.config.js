/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,jsx,ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        nas: {
          sidebar: '#1e293b',
          sidebarHover: '#334155',
          accent: '#3b82f6',
          accentHover: '#2563eb',
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
