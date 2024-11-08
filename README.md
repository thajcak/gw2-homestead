# Guild Wars 2 Homestead Catalog
[![Update and Fetch Decorations and Categories](https://github.com/thajcak/gw2-homestead/actions/workflows/fetch_decorations.yml/badge.svg)](https://github.com/thajcak/gw2-homestead/actions/workflows/fetch_decorations.yml)

---

### [View the Homestead Catalog](https://sleepypixel.monster/gw2-homestead)

The Homestead Catalog is a static site that pulls data from the `/v2/homestead` endpoint to provide a quick way to view all Homestead decorations that are presumably available in game.

## Backend
The backend of the site is a GitHub action that runs hourly to pull all decorations from the API and commit any changes to the repo. This provides a static list of decorations and their details for the page to load.

Currently only the API responses are stored in the repo and all image assets are requested on demand.

## Frontend
A grid of decoration icons loaded from the repo is populated on load. Clicking on a decoration opens a detail panel that pulls a preview image from the [Guild Wars 2 Wiki](https://wiki.guildwars2.com). The wiki page is guessed at by trying to determine the proper page based on the item name. Once found the image is pulled from one of two sources and a link to the wiki page is added to the footer.

---

*The original non-React version of this project was built utilizing ChatGPT to test the abilities of prompt engineering. The goal was to treat ChatGPT like a junior developer by giving it specific tasks with targeted guidance. The work was then reviewed, tested, and modified in a process similar to a code review. Additional enhancements and changes were made by me to produce the final build.*