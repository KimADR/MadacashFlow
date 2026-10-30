import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        primary: '#1863A6',
        navy: '#0A1C2A',
        canvas: '#F5F7FB',
      },
    },
  },
  plugins: [],
};

export default config;
