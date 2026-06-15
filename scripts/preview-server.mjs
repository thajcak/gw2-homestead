/**
 * Custom static preview server.
 *
 * `astro preview` ignores user Vite plugins, so bare `/base?query` requests
 * 404 instead of serving index.html. Rewrite those URLs to `/base/?query`.
 */
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'dist');
const base = '/gw2-homestead';
const port = Number(process.env.PORT) || Number(process.argv[2]) || 4321;

const astroPkg = createRequire(import.meta.url).resolve('astro/package.json');
const viteRoot = createRequire(astroPkg)
  .resolve('vite/package.json')
  .replace(/\/package\.json$/, '');
const { preview } = await import(resolve(viteRoot, 'dist/node/index.js'));

const trailingSlashPlugin = {
  name: 'gw2-trailing-slash',
  configurePreviewServer(server) {
    server.middlewares.use((req, _res, next) => {
      const raw = req.url ?? '/';
      const questionIndex = raw.indexOf('?');
      const pathname = questionIndex === -1 ? raw : raw.slice(0, questionIndex);
      const suffix = questionIndex === -1 ? '' : raw.slice(questionIndex);

      if (pathname === base) {
        req.url = `${base}/${suffix}`;
      }

      next();
    });
  },
};

const server = await preview({
  configFile: false,
  root,
  base,
  appType: 'mpa',
  build: { outDir },
  plugins: [trailingSlashPlugin],
  preview: {
    host: 'localhost',
    port,
  },
});

server.printUrls();
