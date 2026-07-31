import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      // Use ^/api/ so SPA route /api-docs is NOT proxied to the backend.
      // Session cookies stay same-origin in dev; backend listens on 13334.
      '^/api/': {
        target: 'http://127.0.0.1:13334',
        changeOrigin: true,
      },
      '/openapi.json': {
        target: 'http://127.0.0.1:13334',
        changeOrigin: true,
      },
    },
  },
})
