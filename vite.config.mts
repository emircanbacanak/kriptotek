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
    chunkSizeWarningLimit: 1000, // 1MB limit (chart kütüphaneleri büyük olduğu için)
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


