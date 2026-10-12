#!/usr/bin/env bash
# ─── JEV hooks — evidence collector (Stop DONE) ──────────────────────────────
#
# Runs a deterministic checks command and prints its FULL output as the evidence
# the Stop DONE hook feeds to Jev's `verify` pack. Code owns the evidence; the
# model only judges whether the evidence covers the goal.
#
# Override the command with JEV_CHECKS_CMD, e.g.:
#   JEV_CHECKS_CMD='npm test' bash harness/hooks/checks.sh
#
# Exit code is the checks' exit code (0 = pass), which the hook treats as the
# non-negotiable floor: a failing evidence command always blocks the stop.

set -uo pipefail

cmd="${JEV_CHECKS_CMD:-npx tsc --noEmit && npx eslint src && npm test && npm run build}"

echo "# evidence command: ${cmd}"
echo "# git status --porcelain (working tree)"
git status --porcelain 2>/dev/null | head -50
echo "# git diff --stat"
git diff --stat 2>/dev/null | tail -20
echo "# checks output:"

output="$(eval "$cmd" 2>&1)"
code=$?
printf '%s\n' "$output"
echo "# checks exit: ${code}"

exit "$code"
