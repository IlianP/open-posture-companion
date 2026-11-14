#!/usr/bin/env bash
#
# Prepare the branch behind an "update from upstream" pull request.
#
# Takes a copy of this fork's main, merges the original project's main into
# it, and pushes the result as the sync branch. main itself is never
# touched: an upstream update only lands when its pull request is merged,
# and the fork's own changes stay exactly as they are until then.
#
# Run by .github/workflows/upstream-sync.yml; safe to run by hand as well
# (the merge happens in a temporary worktree, not in your checkout).
# Needs `git config user.name/user.email` to be set — commits made under
# that identity count as the script's own; anything else on the sync branch
# is treated as somebody's manual work and is never overwritten.
#
# Prints one status line and, under GitHub Actions, writes the same values
# to $GITHUB_OUTPUT:
#
#   up-to-date  main already contains everything upstream has
#   unchanged   the sync branch already carries the latest upstream
#   ready       sync branch pushed; it merges into main without conflicts
#   conflict    upstream and main conflict; the sync branch was pushed as a
#               plain copy of upstream so the conflict can be resolved in
#               the pull request
#   blocked     the sync branch holds manual work that conflicts with newer
#               upstream commits; nothing was changed

set -euo pipefail

UPSTREAM_URL="${UPSTREAM_URL:-https://github.com/niltonheck/open-posture-companion.git}"
UPSTREAM_BRANCH="${UPSTREAM_BRANCH:-main}"
BASE_BRANCH="${BASE_BRANCH:-main}"
SYNC_BRANCH="${SYNC_BRANCH:-upstream-sync}"
REMOTE="${REMOTE:-origin}"

base="refs/remotes/$REMOTE/$BASE_BRANCH"
sync="refs/remotes/$REMOTE/$SYNC_BRANCH"
upstream="refs/remotes/upstream-sync-source/$UPSTREAM_BRANCH"
upstream_sha=""
worktree=""

cleanup() {
  if [ -n "$worktree" ]; then
    git worktree remove --force "$worktree" > /dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

finish() {
  echo "upstream-sync: $1 (upstream ${upstream_sha:-unknown})"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    {
      echo "status=$1"
      echo "upstream_sha=$upstream_sha"
    } >> "$GITHUB_OUTPUT"
  fi
  exit 0
}

git fetch --quiet --no-tags "$REMOTE" "+refs/heads/$BASE_BRANCH:$base"
git fetch --quiet --no-tags "$UPSTREAM_URL" "+refs/heads/$UPSTREAM_BRANCH:$upstream"
upstream_sha="$(git rev-parse --short=7 "$upstream")"

if git merge-base --is-ancestor "$upstream" "$base"; then
  finish up-to-date
fi

# Where the merge starts from. Normally a fresh copy of main; the existing
# sync branch only if someone has put work on it that main does not have
# yet (typically conflicts resolved in the pull request).
start="$base"
sync_sha=""
if git fetch --quiet --no-tags "$REMOTE" "+refs/heads/$SYNC_BRANCH:$sync" 2> /dev/null; then
  sync_sha="$(git rev-parse "$sync")"
  manual_work="$(git log --format=%ce "$sync" --not "$base" "$upstream" \
    | grep -v -x -F "$(git config user.email)" | head -n 1 || true)"
  if [ -n "$manual_work" ]; then
    if git merge-base --is-ancestor "$upstream" "$sync"; then
      finish unchanged
    fi
    start="$sync"
  fi
fi

worktree="$(mktemp -d)"
git worktree add --quiet --detach "$worktree" "$start"

if git -C "$worktree" merge --quiet --no-ff --no-edit \
  -m "Merge upstream $UPSTREAM_BRANCH ($upstream_sha) into $BASE_BRANCH" "$upstream"; then
  merged="$(git -C "$worktree" rev-parse HEAD)"
  if [ -n "$sync_sha" ] && git merge-base --is-ancestor "$upstream" "$sync" \
    && [ "$(git rev-parse "$merged^{tree}")" = "$(git rev-parse "$sync^{tree}")" ]; then
    # Nothing new on either side since the branch was last pushed.
    finish unchanged
  fi
  if [ "$start" = "$sync" ]; then
    git push --quiet "$REMOTE" "$merged:refs/heads/$SYNC_BRANCH"
  else
    git push --quiet --force-with-lease="$SYNC_BRANCH:$sync_sha" \
      "$REMOTE" "$merged:refs/heads/$SYNC_BRANCH"
  fi
  finish ready
fi

git -C "$worktree" merge --abort

if [ "$start" = "$sync" ]; then
  finish blocked
fi

# Conflicts need a human. Publish upstream as it is; the pull request then
# shows the conflicting files and offers to resolve them.
git push --quiet --force-with-lease="$SYNC_BRANCH:$sync_sha" \
  "$REMOTE" "$upstream:refs/heads/$SYNC_BRANCH"
finish conflict
