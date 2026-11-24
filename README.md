# Guild Wars 2 Homestead Catalog

---

### [View the Homestead Catalog](https://sleepypixel.monster/gw2-homestead)

The Homestead Catalog is a static site that pulls data from the `/v2/homestead` endpoint to provide a quick way to view all Homestead decorations that are presumably available in game.

## Backend
The backend is a sync that runs hourly (at :30 UTC) in a Docker container ([`sync/`](sync/README.md), on a home server) to pull every decoration and category from the GW2 API, enrich decorations from the [Guild Wars 2 Wiki](https://wiki.guildwars2.com) (page title, preview image, recipe), and commit any changes to `main`. Its push triggers the deploy workflow (`deploy.yml`), which builds the site and publishes it to GitHub Pages, as any push to `main` does. The container's image is built by `sync_image.yml` and published privately to GitHub's container registry, from which the server pulls it. The GitHub workflow that used to run the sync (`fetch_decorations.yml`) is kept as a manual fallback; the wiki answers some of GitHub's requests with HTTP 403.

Decoration and category data live in Astro Content Collections under `src/content/`. Each entry holds its current state plus the day it was `added` (and `removed`, once a removal is confirmed). Everything that changes is appended to a monthly change log in `src/data/changes/YYYY-MM.json`: one entry per item per day (`New Item`, `Item Updated`, `Item Removed` or `Item Returned`), with each changed field's before and after values.

The sync guards against bad API or wiki answers:

- It aborts when the API lists many fewer decorations or categories than are stored (more than 10, or 2% if that is fewer, but always allowing one), in case the API answered partially. A manual run with `allow_large_drop` checked continues anyway.
- An item is marked removed only after two runs in a row without it (`missingSince`, then `removed`).
- A stored preview image is dropped only after the wiki has reported no image for 3 days and the image file itself is gone (`previewMissingSince`).

Each decoration usually has two wiki pages: the original guild hall decoration (`Name`) and the later homestead version (`Name (Handiwork)`), which has its own recipe but shares the model. Recipes and the wiki link come from the stored `wikiTitle`, normally the Handiwork page. The preview is the first image in a `{{Decoration infobox}}` gallery whose file exists (`gallery1`, which defaults to `{page name}.jpg`, then `gallery2` to `gallery5`). The stored page's infobox is tried first, then the other pages. Images named after the decoration come before borrowed ones (some infoboxes show another decoration that shares the model), and a borrowed image never replaces one named after the decoration. The wiki's lead image (`pageimages`) is only a fallback for pages without such an infobox, because it skips very tall or wide images and sometimes leads with a close-up.

The gallery's other images (front, side, top, close-up, at night and so on) become the decoration's `views`, in the wiki's order and each file once across both pages, with the wiki's caption as plain text. Files the sync stored before count as existing, so after the first run it only checks new files on the wiki.

Decoration icons, preview images and views live in `src/assets/decorations/{id}/`. The sync stores previews at most 1,024 px wide as WebP (the site never serves them larger) and re-downloads an icon when the API's icon URL (`iconSource`) changes. The wiki URL of each preview is kept as `original.remoteSource`, so later runs can tell whether the wiki's image changed. Views are stored the same way at a lower quality, as `view-{hash}.webp` named from their wiki URL, and files no view refers to are deleted. A run downloads at most 300 views; the rest keep their wiki URL as `source`, the site leaves them out, and later runs catch up.

Removed decorations drop out of the grid, search and Recently Added, but their JSON is still built, so an old `?open={id}` link says the item left the game.

## Frontend
Built with [Astro](https://astro.build), vanilla CSS and vanilla TypeScript. The catalog is a single static page; the build turns the content collections into a few files the page loads as needed:

- `/catalog/search-index.json` — name, description, categories and icon position of every current decoration; drives the grid, search and category filter
- `/catalog/icons/icons-{n}.{hash}.webp` — the icons packed into sprite sheets of about 100 each, in the grid's name order; a sheet loads when its rows near the viewport
- `/catalog/decorations/{id}.json` — what the details panel shows (description, categories, recipe, wiki link, optimized preview image, and a `gallery` of the preview plus downloaded views with thumbnails and captions), fetched when a decoration is opened. Thumbnails switch the image; arrow keys, Home and End move along them.
- `/catalog/changelog.html` — the Recently Added panel: current decorations grouped by the day they were `added`, loaded when the panel first opens

Search matches every word of the query against a decoration's name, category names and description. Deep links use the `?open={id}` query parameter to open a specific decoration.

## Development

Requires Node 24 (what CI uses). The sync scripts also need `jq` and `awk`, which parse wiki recipes.

```bash
npm install
npm run dev
```

The site is served under its GitHub Pages base path: http://localhost:4321/gw2-homestead/

Other commands:

- `npm run build` — production build to `dist/`
- `npm run preview` — serve the production build locally (a small wrapper around Vite's preview server, so `/gw2-homestead?open={id}` works as it does on Pages)
- `npm run fetch-decorations` — run the full sync the hourly container runs (GW2 API, wiki, content files, images). Every run checks every decoration on the wiki, batched up to 50 page titles per request. Options (after `--`):
  - `--ids 1,2` — limit wiki lookups to those IDs
  - `--dry-run` — fetch and print the wiki results without touching content, change log or images (work files go to `.local-sync/`)
  - `--allow-large-drop` — continue when the API lists many fewer items than are stored
- `npm run localize-images` — download any remote icons and preview images referenced in `src/content/decorations/` into `src/assets/decorations/` (the full sync already does this)

### Testing GitHub Actions locally

To try the sync container itself, see [sync/README.md](sync/README.md#try-it-locally).

The workflows can be run locally with [act](https://github.com/nektos/act) (`brew install act`, Docker required). act copies the working tree into a container, so uncommitted changes are tested and nothing comes back to your checkout. Under act the fetch workflow commits inside the container but skips `git push`, and the deploy workflow builds but skips the Pages upload and deploy job.

- `npm run act:check` — dry-run every trigger (dispatch, push, the sync image's push and schedule, and the fetch workflow's `workflow_call` into deploy) and check which jobs would run
- `npm run act:fetch` — run the fetch workflow end to end against the real GW2 API and wiki; wiki lookups are limited to a 7-item sample (`scripts/act.sh fetch 1,2,3` or `scripts/act.sh fetch all` to change that)
- `npm run act:deploy` — run the deploy workflow's build job
- `npm run act:all` — all of the above

To run the check automatically before pushing changes under `.github/` or `scripts/`, enable the repo's hooks once with `git config core.hooksPath .githooks`. `ACT_E2E=1 git push` runs the full end-to-end workflows instead of the dry-run.
