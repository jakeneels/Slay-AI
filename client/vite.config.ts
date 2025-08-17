import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// Tailwind v4 plugin requires Vite 6+. We'll skip it for Vite 5 dev and rely on CSS import.
// import tailwind from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})
