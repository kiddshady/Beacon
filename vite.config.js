import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  root: resolve(process.cwd(), 'renderer'),
  base: './',
  server: { port: 5273, strictPort: true },
  build: {
    outDir: resolve(process.cwd(), 'dist'),
    emptyOutDir: true,
    target: 'chrome130'
  }
})
