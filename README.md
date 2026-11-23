# Guild Wars 2 Homestead Catalog
[![Update and Fetch Decorations and Categories](https://github.com/thajcak/gw2-homestead/actions/workflows/fetch_decorations.yml/badge.svg)](https://github.com/thajcak/gw2-homestead/actions/workflows/fetch_decorations.yml)

---

### [View the Homestead Catalog](https://sleepypixel.monster/gw2-homestead)

The Homestead Catalog is a static site that pulls data from the `/v2/homestead` endpoint to provide a quick way to view all Homestead decorations that are presumably available in game.

## Backend
The backend of the site is a GitHub action that runs hourly to pull all decorations from the API and commit any changes to the repo. Decoration, category, and changelog data live in Astro Content Collections under `src/content/`. Each decoration entry stores its own `history` array of changes. The Recently Added panel loads an HTML fragment at `/catalog/changelog.html` on demand, which Astro builds from `New Item` history entries.

Decoration icons and preview images live in `src/assets/decorations/{id}/`. Icons are optimized at build time via `/catalog/icon-manifest.json`; expanded previews use optimized WebP URLs from `/catalog/preview-manifest.json`. Wiki URLs are kept only as `remoteSource` metadata for CI changelog diffs.

## Frontend
Built with [Astro](https://astro.build) and vanilla CSS. The catalog is a single static page with client-side search, category filtering, expandable decoration details, and a changelog panel. Decoration data is loaded at build time from content collections; interactivity is handled with vanilla TypeScript.

Deep links use the `?open={id}` query parameter to automatically expand a specific decoration.

## Development

```bash
npm install
npm run dev
```

Other commands:

- `npm run build` — production build to `dist/`
- `npm run preview` — preview the production build locally
- `npm run generate-catalog` — build `public/catalog/` search index and decoration JSON artifacts
- `npm run localize-images` — download remote decoration icons and preview images into `src/assets/decorations/`
- `npm run fetch-decorations` — run the full sync the hourly workflow runs (GW2 API, wiki, content files, images); `-- --ids 1,2` limits wiki lookups

### Testing GitHub Actions locally

The workflows can be run locally with [act](https://github.com/nektos/act) (`brew install act`, Docker required). act copies the working tree into a container, so uncommitted changes are tested and nothing comes back to your checkout. Under act the fetch workflow commits inside the container but skips `git push`, and the deploy workflow builds but skips the Pages upload and deploy job.

- `npm run act:check` — dry-run every trigger (schedule, dispatch, push, `workflow_run` success and failure) and check which jobs would run
- `npm run act:fetch` — run the fetch workflow end to end against the real GW2 API and wiki; wiki lookups are limited to a 7-item sample (`scripts/act.sh fetch 1,2,3` or `scripts/act.sh fetch all` to change that)
- `npm run act:deploy` — run the deploy workflow's build job
- `npm run act:all` — all of the above

To run the check automatically before pushing workflow or script changes, enable the repo's hooks once with `git config core.hooksPath .githooks`. `ACT_E2E=1 git push` runs the full end-to-end workflows instead of the dry-run.
