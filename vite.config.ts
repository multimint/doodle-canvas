import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/__/auth': {
        target: 'https://doodle-canvas-b3ddb.firebaseapp.com',
        changeOrigin: true,
      },
      '/__/firebase': {
        target: 'https://doodle-canvas-b3ddb.firebaseapp.com',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/database', 'firebase/storage'],
          konva: ['konva', 'react-konva'],
        },
      },
    },
  },
})
