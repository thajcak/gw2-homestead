# Guild Wars 2 Homestead Catalog
[![Update and Fetch Decorations and Categories](https://github.com/thajcak/gw2-homestead/actions/workflows/fetch_decorations.yml/badge.svg)](https://github.com/thajcak/gw2-homestead/actions/workflows/fetch_decorations.yml)

---

### [View the Homestead Catalog](https://sleepypixel.monster/gw2-homestead)

The Homestead Catalog is a static site that pulls data from the `/v2/homestead` endpoint to provide a quick way to view all Homestead decorations that are presumably available in game.

## Backend
The backend of the site is a GitHub action that runs hourly to pull all decorations from the API and commit any changes to the repo; when it pushes a commit it calls the deploy workflow. Decoration and category data live in Astro Content Collections under `src/content/`. Each entry holds its current state plus the day it was `added` (and `removed`, once a removal is confirmed). Everything that changes is appended to a monthly change log in `src/data/changes/YYYY-MM.json`, one entry per item per day with each field's before and after values. The Recently Added panel loads an HTML fragment at `/catalog/changelog.html` on demand, which Astro builds from each decoration's `added` day.

Decoration icons and preview images live in `src/assets/decorations/{id}/`. The sync stores previews at most 1,024 px wide as WebP (the site never serves them larger) and re-downloads an icon when the API's icon URL (`iconSource`) changes. At build time the icons are packed into sprite sheets under `/catalog/icons/` (about 100 icons each, in the grid's name order), and each decoration's optimized preview URLs go into its `/catalog/decorations/{id}.json`. Wiki URLs are kept only as `remoteSource` metadata for CI changelog diffs.

Removed decorations drop out of the grid, search and Recently Added, but their JSON is still built, so an old `?open={id}` link says the item left the game.

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
- `npm run localize-images` — download remote decoration icons and preview images into `src/assets/decorations/`
- `npm run fetch-decorations` — run the full sync the hourly workflow runs (GW2 API, wiki, content files, images). Every run checks every decoration on the wiki, batched 50 page titles per request; `-- --ids 1,2` limits wiki lookups to those IDs

One-off scripts, kept until the Astro branch is merged into `main`:

- `scripts/backfill-added-from-main.mjs` — date decorations by when `main` first saw them (run right before merging)
- `scripts/migrate-history-to-change-log.mjs` — move old per-item `history` arrays into the change log (already run)
- `scripts/shrink-preview-images.mjs` — convert stored previews to 1,024 px WebP (already run)

### Testing GitHub Actions locally

The workflows can be run locally with [act](https://github.com/nektos/act) (`brew install act`, Docker required). act copies the working tree into a container, so uncommitted changes are tested and nothing comes back to your checkout. Under act the fetch workflow commits inside the container but skips `git push`, and the deploy workflow builds but skips the Pages upload and deploy job.

- `npm run act:check` — dry-run every trigger (schedule, dispatch, push, and the fetch workflow's `workflow_call` into deploy) and check which jobs would run
- `npm run act:fetch` — run the fetch workflow end to end against the real GW2 API and wiki; wiki lookups are limited to a 7-item sample (`scripts/act.sh fetch 1,2,3` or `scripts/act.sh fetch all` to change that)
- `npm run act:deploy` — run the deploy workflow's build job
- `npm run act:all` — all of the above

To run the check automatically before pushing workflow or script changes, enable the repo's hooks once with `git config core.hooksPath .githooks`. `ACT_E2E=1 git push` runs the full end-to-end workflows instead of the dry-run.
