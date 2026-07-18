import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/teplobilling/',
  plugins: [react()],
  optimizeDeps: {
    // PGlite несет WASM и собственные воркеры — предбандлинг его ломает
    exclude: ['@electric-sql/pglite'],
  },
})
