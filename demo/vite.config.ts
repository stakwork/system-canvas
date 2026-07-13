import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'system-canvas': path.resolve(__dirname, '../packages/core/src'),
      'system-canvas-react': path.resolve(__dirname, '../packages/react/src'),
      'system-canvas-collab': path.resolve(__dirname, '../packages/collab/src'),
    },
    // Single React instance across the aliased-from-source packages.
    dedupe: ['react', 'react-dom'],
  },
})
