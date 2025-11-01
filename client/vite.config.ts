import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [],
  server: {
    open: '/game.html',
    hmr: {
      overlay: true
    }
  }
})
