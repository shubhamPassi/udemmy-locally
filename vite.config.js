import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Use relative paths for deployment flexibility
  server: {
    port: 3000,
    open: true
  },
  worker: {
    format: 'es'
  },
  optimizeDeps: {
    exclude: ['@xenova/transformers']
  },
  build: {
    outDir: 'dist',
    sourcemap: false, // Disable source maps for smaller bundle
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: ['log'], // Strip console.log in production, keep .error/.warn
        drop_debugger: true
      }
    },
    rollupOptions: {
      output: {
        // Chunk splitting for better caching
        manualChunks(id) {
          if (id.includes('vite/preload-helper')) return 'preload-runtime'
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return 'react-vendor'
          if (id.includes('/node_modules/lucide-react/')) return 'ui-vendor'
          if (id.includes('/node_modules/react-markdown/')) return 'markdown-vendor'
          if (id.includes('/node_modules/recharts/')) return 'charts-vendor'
          if (/node_modules\/(react-player|hls.js|mpegts.js)\//.test(id)) return 'video-vendor'
        }
      }
    },
    // Increase chunk size warning limit for AI models
    chunkSizeWarningLimit: 2000
  }
})
