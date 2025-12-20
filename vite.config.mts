import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// CSS Preload Plugin - Render-blocking CSS'i azaltır
function cssPreloadPlugin() {
  return {
    name: 'css-preload',
    transformIndexHtml(html: string) {
      // CSS link'lerini preload olarak değiştir ve onload ile stylesheet yap
      return html.replace(
        /<link rel="stylesheet" crossorigin href="([^"]+)">/g,
        `<link rel="preload" href="$1" as="style" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="$1"></noscript>`
      )
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), cssPreloadPlugin()],
  server: {
    port: 5173
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      },
      mangle: true,
      format: {
        comments: false
      }
    },
    chunkSizeWarningLimit: 1200, // 1.2MB limit (react-vendor + chart kütüphaneleri büyük olduğu için)
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) {
              return 'firebase-vendor'
            }
            // Chart kütüphaneleri React'e bağımlı, bu yüzden react-vendor'a dahil et
            // Chunk size büyük olacak ama React bağımlılık sorunu olmayacak
            if (id.includes('apexcharts') || id.includes('recharts') || id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'react-vendor'
            }
          }
        }
      }
    }
  }
})



