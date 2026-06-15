# Guild Wars 2 Homestead Catalog
[![Update and Fetch Decorations and Categories](https://github.com/thajcak/gw2-homestead/actions/workflows/fetch_decorations.yml/badge.svg)](https://github.com/thajcak/gw2-homestead/actions/workflows/fetch_decorations.yml)

---

### [View the Homestead Catalog](https://sleepypixel.monster/gw2-homestead)

The Homestead Catalog is a static site that pulls data from the `/v2/homestead` endpoint to provide a quick way to view all Homestead decorations that are presumably available in game.

## Backend
The backend of the site is a GitHub action that runs hourly to pull all decorations from the API and commit any changes to the repo. Decoration, category, and changelog data live in Astro Content Collections under `src/content/`, validated at build time with Zod schemas.

Currently decoration icons and preview images are stored locally under `public/decorations/` and synced by the hourly GitHub Action. Wiki URLs are kept only as `remoteSource` metadata for CI changelog diffs.

## Frontend
Built with [Astro](https://astro.build) and Tailwind CSS. The catalog is a single static page with client-side search, category filtering, expandable decoration details, and a changelog panel. Decoration data is loaded at build time from content collections; interactivity is handled with vanilla TypeScript.

Deep links use the `?open={id}` query parameter to automatically expand a specific decoration.

## Development

```bash
npm install
npm run dev
```

Other commands:

- `npm run build` — production build to `dist/`
- `npm run preview` — preview the production build locally
- `npm run localize-images` — download remote decoration icons and preview images into `public/decorations/`

---

*The original non-React version of this project was built utilizing ChatGPT to test the abilities of prompt engineering. The goal was to treat ChatGPT like a junior developer by giving it specific tasks with targeted guidance. The work was then reviewed, tested, and modified in a process similar to a code review. Additional enhancements and changes were made by me to produce the final build.*
