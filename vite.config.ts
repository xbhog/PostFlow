import { createReadStream, cpSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import type { Connect } from 'vite';
import react from '@vitejs/plugin-react';

const require = createRequire(import.meta.url);
const vditorRoot = path.dirname(require.resolve('vditor/package.json'));

const MIME_TYPES: Record<string, string> = {
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.json': 'application/json',
    '.wasm': 'application/wasm',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
};

function vditorAssets(): Plugin {
    const prefix = '/vditor-cdn/';

    const attach = (middlewares: Connect.Server) => {
        middlewares.use((req, res, next) => {
            const url = req.url?.split('?')[0] || '';
            if (!url.startsWith(prefix)) return next();
            const filePath = path.join(vditorRoot, decodeURIComponent(url.slice(prefix.length)));
            if (!existsSync(filePath) || !statSync(filePath).isFile()) return next();
            res.setHeader('Content-Type', MIME_TYPES[path.extname(filePath)] || 'application/octet-stream');
            createReadStream(filePath).pipe(res);
        });
    };

    return {
        name: 'vditor-assets',
        configureServer(server) {
            attach(server.middlewares);
        },
        configurePreviewServer(server) {
            attach(server.middlewares);
        },
        closeBundle() {
            cpSync(vditorRoot, path.resolve('dist/vditor-cdn'), { recursive: true });
        }
    };
}

export default defineConfig({
    plugins: [react(), vditorAssets()],
    base: './'
});
