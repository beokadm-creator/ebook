/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        brand: {
          primary: 'var(--brand-primary)',
          'primary-light': 'var(--brand-primary-light)',
          'primary-hover': 'var(--brand-primary-hover)',
          secondary: 'var(--brand-secondary)',
          'secondary-light': 'var(--brand-secondary-light)',
        },
      },
    },
  },
  plugins: [],
};
