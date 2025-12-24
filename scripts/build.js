import path from 'node:path';
import pc from 'picocolors';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import compile from './private/tsc.js';
import cpx from 'cpx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function buildRenderer() {
    return build({
        configFile: path.join(__dirname, '..', 'vite.config.mjs'),
        base: './',
        mode: 'production'
    });
}

function buildMain() {
    const mainPath = path.join(__dirname, '..', 'src', 'main');
    return compile(mainPath);
}

// Suppression du dossier build
fs.rmSync(path.join(__dirname, '..', 'build'), {
    recursive: true,
    force: true,
});

console.log(pc.blue('Transpiling renderer & main...'));

Promise.allSettled([
    buildRenderer(),
    buildMain(),
]).then(async () => {
    console.log(pc.green('Renderer & main successfully transpiled!'));

    // Copier le Prisma Client généré dans le build
    const source = path.join(__dirname, '..', 'generated', 'prisma', '**/*');
    const dest = path.join(__dirname, '..', 'build', 'generated', 'prisma');

    cpx.copy(source, dest, (err) => {
        if (err) {
            console.error(pc.red('Erreur lors de la copie de Prisma Client : '), err);
            process.exit(1);
        }
        console.log(pc.green('Prisma Client copied to build/generated/prisma'));
        console.log(pc.green('Build ready for electron-builder !'));
    });
});