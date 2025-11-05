import path from 'path';
import vuePlugin from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import Components from 'unplugin-vue-components/vite';
import { PrimeVueResolver } from '@primevue/auto-import-resolver';

/**
 * https://vitejs.dev/config
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    root: path.join(__dirname, 'src', 'renderer'),
    publicDir: 'public',
    envDir: path.join(__dirname, ''),  // Ensure Vite loads the .env file correctly when root is not the project root (I lost one hour on this 😭)
    server: {
        port: 8080,
    },
    open: false,
    build: {
        outDir: path.join(__dirname, 'build', 'renderer'),
        emptyOutDir: true,
    },
    plugins: [
        tailwindcss(),
        vuePlugin(),
        Components({
            resolvers: [
                PrimeVueResolver()
            ]
        })
    ],
});
