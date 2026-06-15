import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://sleepypixel.monster',
  base: '/gw2-homestead',
  output: 'static',
  integrations: [tailwind()],
});
