import path from 'path';
import vuePlugin from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';

/**
 * https://vitejs.dev/config
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    root: path.join(__dirname, 'src', 'renderer'),
    publicDir: 'public',
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
        vuePlugin()
    ],
});
