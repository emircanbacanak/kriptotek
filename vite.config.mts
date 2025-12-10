import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'terser',
    chunkSizeWarningLimit: 1200, // 1.2MB limit (react-vendor + chart kütüphaneleri büyük olduğu için)
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug']
      }
    },
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            // Firebase ayrı chunk
            if (id.includes('firebase')) {
              return 'firebase-vendor'
            }
            // Chart kütüphaneleri ayrı chunk
            if (id.includes('apexcharts') || id.includes('recharts')) {
              return 'charts-vendor'
            }
            // React core ayrı chunk
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'react-vendor'
            }
            // Lucide icons ayrı chunk (büyük)
            if (id.includes('lucide-react')) {
              return 'icons-vendor'
            }
          }
        }
      }
    }
  }
})



