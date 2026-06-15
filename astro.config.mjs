import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

const base = '/gw2-homestead';

/** Dev server: rewrite `/base?query` to `/base/?query` so index.html is served. */
function baseQueryRedirectPlugin(siteBase) {
  const middleware = (req, _res, next) => {
    const raw = req.url ?? '/';
    const questionIndex = raw.indexOf('?');
    const pathname = questionIndex === -1 ? raw : raw.slice(0, questionIndex);
    const suffix = questionIndex === -1 ? '' : raw.slice(questionIndex);

    if (pathname === siteBase) {
      req.url = `${siteBase}/${suffix}`;
    }

    next();
  };

  return {
    name: 'base-query-redirect',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  site: 'https://sleepypixel.monster',
  base,
  output: 'static',
  integrations: [tailwind()],
  vite: {
    plugins: [baseQueryRedirectPlugin(base)],
  },
});
