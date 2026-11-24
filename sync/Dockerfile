# The decoration sync, as a long-running container (see sync/README.md).
#
# The image holds only the tools. The sync scripts run from a clone of the repo on the /data
# volume, updated to origin before every run, so a change pushed to main is what the next run
# does: the image only needs rebuilding when something in sync/ changes.
FROM node:24-trixie-slim

# git and ssh to pull and push; jq and awk parse wiki recipes (scripts/lib/wiki-api.mjs);
# tini forwards `docker stop` to the scheduler and the run in progress.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates git openssh-client jq tini \
 && rm -rf /var/lib/apt/lists/*

# Pin GitHub's SSH host keys at build time, read over HTTPS from GitHub's API, instead of
# trusting whatever key answers on first connect.
RUN node -e "fetch('https://api.github.com/meta').then((r) => r.json()).then((m) => { \
      if (!m.ssh_keys?.length) process.exit(1); \
      process.stdout.write(m.ssh_keys.map((k) => 'github.com ' + k).join('\n') + '\n'); \
    })" > /etc/ssh/ssh_known_hosts

COPY --chmod=755 bin/ /usr/local/bin/

ENV DATA_DIR=/data \
    BRANCH=main \
    SYNC_MINUTE=30 \
    RUN_ON_START=false \
    PUSH=true \
    PUID=99 \
    PGID=100 \
    GIT_USER_NAME=gw2-homestead-sync \
    GIT_USER_EMAIL=gw2-homestead-sync@localhost \
    HEALTH_MAX_AGE_MINUTES=180 \
    ASTRO_TELEMETRY_DISABLED=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false

VOLUME /data

# Unhealthy when no run has succeeded for HEALTH_MAX_AGE_MINUTES (Unraid shows it on the
# container). The start period covers the wait for the first scheduled run.
HEALTHCHECK --interval=10m --timeout=10s --start-period=3h CMD ["sync-health"]

ENTRYPOINT ["tini", "-g", "--", "sync-entrypoint"]
CMD ["schedule"]
