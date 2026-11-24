#!/usr/bin/env bash
# Run this repo's GitHub Actions workflows locally with act (https://github.com/nektos/act).
#
#   scripts/act.sh check            Dry-run every workflow trigger and assert how many jobs each
#                                   would run (validates syntax, expressions, the job graph and
#                                   if: conditions). Runs no steps; only clones the actions used.
#   scripts/act.sh deploy           Full build job of the deploy workflow; Pages upload and the
#                                   deploy job are skipped.
#   scripts/act.sh all              check, then deploy.
#
# act copies the working tree into the container, so uncommitted changes are tested and nothing
# a run does comes back to this checkout.
set -euo pipefail

cd "$(dirname "$0")/.."

DEPLOY_WF=.github/workflows/deploy.yml
IMAGE_WF=.github/workflows/sync_image.yml
EVENTS=.github/act

require() {
  command -v act >/dev/null || { echo "act is not installed: brew install act" >&2; exit 1; }
  docker info >/dev/null 2>&1 || { echo "Docker is not running." >&2; exit 1; }
}

# act names containers after the workflow and job, and even a dry run (-n) removes a container
# with that name, so two runs at once kill each other. Allow only one.
LOCK_DIR="$(git rev-parse --git-common-dir)/act.lock"
lock() {
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    echo "Another scripts/act.sh run is in progress (remove $LOCK_DIR if it isn't)." >&2
    exit 1
  fi
  trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT
}

step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

# Dry-run one trigger and assert how many jobs act plans to run (jobs whose if: is false
# don't appear). Prints the full act output only when the count is wrong.
dry() {
  local label=$1 expected=$2; shift 2
  local out ran
  out=$(act "$@" -n 2>&1) || { echo "$out"; echo "FAIL  $label: act exited with an error" >&2; return 1; }
  ran=$(grep -c 'Job succeeded' <<<"$out" || true)
  if [[ $ran -ne $expected ]]; then
    echo "$out"
    echo "FAIL  $label: expected $expected job(s), act planned $ran" >&2
    return 1
  fi
  echo "ok    $label ($ran job(s))"
}

check() {
  step "check: dry-run every trigger"
  local failed=0
  # deploy job is skipped under act ("act": true in the payload), so only build runs.
  dry "deploy on push to main" 1 push -W "$DEPLOY_WF" -e "$EVENTS/push-main.json" || failed=1
  dry "deploy on workflow_dispatch" 1 workflow_dispatch -W "$DEPLOY_WF" -e "$EVENTS/dispatch.json" || failed=1
  dry "sync image on push to main" 1 push -W "$IMAGE_WF" -e "$EVENTS/push-main.json" || failed=1
  dry "sync image on schedule" 1 schedule -W "$IMAGE_WF" -e "$EVENTS/dispatch.json" || failed=1
  return $failed
}

deploy() {
  step "deploy workflow (build only)"
  act workflow_dispatch -W "$DEPLOY_WF" -e "$EVENTS/dispatch.json"
}

case "${1:-}" in check|deploy|all) require; lock ;; esac
case "${1:-}" in
  check) check ;;
  deploy) deploy ;;
  all) check; deploy ;;
  *) sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
