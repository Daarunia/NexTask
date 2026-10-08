import path from 'node:path'
import vuePlugin from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import Components from 'unplugin-vue-components/vite'
import { PrimeVueResolver } from '@primevue/auto-import-resolver'
import { visualizer } from 'rollup-plugin-visualizer'

/**
 * https://vitejs.dev/config
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: path.join(__dirname, 'src', 'renderer'),
  publicDir: 'public',
  envDir: path.join(__dirname, ''), // Ensure Vite loads the .env file correctly when root is not the project root (I lost one hour on this 😭)
  server: {
    port: 8080,
  },
  open: false,
  build: {
    outDir: path.join(__dirname, 'build', 'renderer'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      output: {
        // Dépendances dans des chunks séparés, pour que la limite de taille surveille le code de l'app
        codeSplitting: {
          groups: [
            { name: 'primevue', test: /node_modules[\\/](primevue|@primevue|@primeuix)[\\/]/, priority: 2 },
            // entriesAware : un module chargé seulement à la demande (import dynamique,
            // ex. la coloration d'un langage dans l'éditeur Markdown) reste hors du chunk principal
            { name: 'vendor', test: /node_modules[\\/]/, priority: 1, entriesAware: true },
          ],
        },
      },
    },
  },
  plugins: [
    tailwindcss(),
    vuePlugin(),
    Components({
      resolvers: [PrimeVueResolver()],
    }),
    visualizer({
      filename: './dist/bundle-analysis.html',
      open: true,
    }),
  ],
})
