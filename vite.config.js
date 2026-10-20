import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import {readFileSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {createHash} from 'node:crypto'

// https://vite.dev/config/
export default defineConfig({
  define:{'import.meta.env.VITE_BUILD_COMMIT':JSON.stringify((process.env.CF_PAGES_COMMIT_SHA||process.env.VERCEL_GIT_COMMIT_SHA||process.env.BUILD_COMMIT)?.slice(0,7)||'local')},
  plugins: [react(),{
    name:'offline-app-shell',
    writeBundle(options,bundle){
      const assets=['/index.html','/manifest.webmanifest','/tutin-icon.svg',...Object.keys(bundle).filter(name=>/\.(js|css)$/.test(name)).map(name=>'/'+name)]
      const version=createHash('sha256').update(JSON.stringify(assets)).digest('hex').slice(0,12)
      writeFileSync(resolve(options.dir,'offline-manifest.json'),JSON.stringify(assets))
      writeFileSync(resolve(options.dir,'sw.js'),readFileSync(resolve('public/sw.js'),'utf8').replace('__BUILD__',version))
    },
  }],
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
