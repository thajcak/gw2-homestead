# Decoration sync container

Runs the decoration sync (`scripts/run-fetch-decorations.mjs`: GW2 API, wiki, content files, images) every hour in Docker, commits what changed to `main` and pushes it to GitHub. A push to `main` deploys the site, as any push does.

The image holds only the tools (Node 24, git, ssh, jq, awk). On first start it clones the repo into `/data/repo`. Each run then resets that clone to `origin/main`, runs the scripts from it, commits, rebases onto anything that landed meanwhile and pushes. So a change to `scripts/` takes effect at the next run once it is on `main`; rebuild the image only when something in `sync/` changes.

## The image

The [Publish sync image](../.github/workflows/sync_image.yml) workflow builds this folder into `ghcr.io/thajcak/gw2-homestead-sync` and pushes it to GitHub's container registry when a change to `sync/` lands on `main`, once a month (rebuilt from scratch for Node and Debian security fixes), and when run by hand. Tags: `latest`, and `sha-<commit>` for each build to roll back to.

GitHub makes a new package **private**, so pulling it needs a login. Check this after the first build: the package's page (your profile → **Packages** → `gw2-homestead-sync` → **Package settings**) shows its visibility.

## Set up on Unraid

1. **Make a token to pull the image.** On GitHub, open **Settings → Developer settings → Personal access tokens → Tokens (classic)** and generate one with only the `read:packages` scope (the container registry doesn't take fine-grained tokens). Save it on the flash drive, which survives reboots, and log in. In the Unraid terminal:

   ```bash
   install -m 600 /dev/null /boot/config/ghcr-token && nano /boot/config/ghcr-token
   ```

   ```bash
   docker login ghcr.io -u thajcak --password-stdin < /boot/config/ghcr-token
   ```

   Unraid keeps `/root` in memory, so that login is gone after a reboot. With the **User Scripts** plugin, add a script set to run **At First Array Start Only** holding the same `docker login` line.

2. **Make a deploy key for pushing.**

   ```bash
   mkdir -p /mnt/user/appdata/gw2-homestead-sync
   ```

   ```bash
   ssh-keygen -t ed25519 -N '' -C gw2-homestead-sync -f /mnt/user/appdata/gw2-homestead-sync/deploy_key
   ```

   On GitHub, open the repo's **Settings → Deploy keys → Add deploy key**, paste the contents of `deploy_key.pub` and tick **Allow write access**. The key can push to this repo only, and it doesn't expire. (Alternatively, use a fine-grained personal access token with Contents: read and write on this repo only, set `REPO_URL` to the `https://` URL and pass the token as `GITHUB_TOKEN`.)

3. **Add the container.** In Unraid's **Docker** tab choose **Add Container** and fill in:

   | Field | Value |
   |---|---|
   | Name | `gw2-homestead-sync` |
   | Repository | `ghcr.io/thajcak/gw2-homestead-sync:latest` |
   | Path: container `/data` | `/mnt/user/appdata/gw2-homestead-sync` |
   | Variable `REPO_URL` | `git@github.com:thajcak/gw2-homestead.git` |

   Add any other [settings](#settings) as variables the same way. Or, with the Docker Compose Manager plugin, add a stack with [`docker-compose.yml`](docker-compose.yml) and choose **Compose Up**.

4. **Check the first run** without waiting for the schedule:

   ```bash
   docker exec gw2-homestead-sync sync-once
   ```

   The first run clones the repo: only the current files plus history, without every past image.

## Use

- Logs: `docker logs -f gw2-homestead-sync`, or the container's log icon in Unraid.
- Run now: `docker exec gw2-homestead-sync sync-once`, with the script's options after it: `--ids 1,2` (only query the wiki for those IDs), `--allow-large-drop` (continue when the API lists many fewer items than are stored) or `--dry-run` (change, commit and push nothing). A run started while another is going waits for it.
- Health: the container turns unhealthy when no run has succeeded for 3 hours (`HEALTH_MAX_AGE_MINUTES`).
- Update the image after the workflow publishes a new one: Unraid's **Check for Updates** on the Docker tab, then **Apply Update** (or **Compose Pull** and **Compose Up**). Pin a `sha-<commit>` tag instead of `latest` to stay on one build.

If a push fails (GitHub down, or a conflicting push to the data files), the commit stays in the clone and the next run rebases and pushes it. If it no longer applies, it's kept on a local `unpushed-…` branch in `/data/repo` and the run starts over from `origin/main`. The sync works out the same changes from the API again.

## Settings

| Variable | Default | |
|---|---|---|
| `REPO_URL` | (required) | `git@github.com:…` with a deploy key, or `https://github.com/…` with `GITHUB_TOKEN` |
| `BRANCH` | `main` | Branch to sync and push |
| `SYNC_MINUTE` | `30` | Minute past each hour (UTC) to run |
| `RUN_ON_START` | `false` | Also run when the container starts |
| `PUSH` | `true` | `false` commits in the clone but never pushes (for trying it out); the next run starts from origin again |
| `SSH_KEY_FILE` | `/data/deploy_key` | Private deploy key, copied into the sync user's home at start |
| `GITHUB_TOKEN` | | Token for an `https://` `REPO_URL`; read from the environment, never written to disk |
| `PUID` / `PGID` | `99` / `100` | User and group the sync runs as (Unraid's nobody:users) |
| `GIT_USER_NAME` / `GIT_USER_EMAIL` | `gw2-homestead-sync` / `gw2-homestead-sync@localhost` | Commit author |
| `HEALTH_MAX_AGE_MINUTES` | `180` | Unhealthy after this long without a successful run |

## Try it locally

Build the image and run one sync against a local bare copy of the repo, so nothing reaches GitHub:

```bash
docker build -t gw2-homestead-sync sync
```

```bash
git clone --bare . /tmp/gw2-origin.git
```

```bash
docker run --rm -v gw2sync-test:/data -v /tmp/gw2-origin.git:/origin -e REPO_URL=file:///origin gw2-homestead-sync bash -c "git config --global --add safe.directory '*' && sync-once --ids 1,2,3"
```

The `safe.directory` line is only needed because the bind-mounted test origin belongs to another user.
