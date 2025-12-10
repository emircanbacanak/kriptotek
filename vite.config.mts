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
    chunkSizeWarningLimit: 1500, // 1.5MB limit (react-vendor + chart kütüphaneleri büyük olduğu için)
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
            // React core + Chart kütüphaneleri aynı chunk (React bağımlılık sorunu için)
            // ApexCharts ve Recharts React'e bağımlı, aynı chunk'ta olmalı
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router') ||
              id.includes('apexcharts') || id.includes('recharts')) {
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



