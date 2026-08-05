import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' para que funcione en carpeta raíz o subcarpeta de Hostinger
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
  },
})
