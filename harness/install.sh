#!/usr/bin/env bash
#
# jev-decide installer — copies the JEV decision skill into an agent's skills dir.
#
# The skill is a single SKILL.md that works unchanged in:
#   .agents/skills   (codex / agents)
#   .opencode/skills (opencode)
#   .claude/skills   (claude code)
#
# Idempotent: re-running replaces the installed copy. Never touches other skills.
#
# Usage:
#   bash harness/install.sh --agent opencode
#   bash harness/install.sh --agent codex --global
#   bash harness/install.sh --target .opencode/skills
#   bash harness/install.sh --agent claude --dry-run
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SCRIPT_DIR/skills/jev-decide"
SKILL_NAME="jev-decide"

AGENT=""
TARGET=""
GLOBAL=0
DRY_RUN=0

usage() {
  cat <<'EOF'
jev-decide installer — copies the JEV decision skill into an agent's skills dir.

Usage:
  bash harness/install.sh --agent opencode
  bash harness/install.sh --agent codex --global
  bash harness/install.sh --target .opencode/skills
  bash harness/install.sh --agent claude --dry-run

Flags:
  --agent <codex|opencode|claude>   pick the agent's skills dir
  --target <dir>                    explicit skills dir (overrides --agent)
  --global                          install under $HOME instead of the project
  --dry-run                         print what would happen, change nothing
  -h, --help                        show this help
EOF
  exit "${1:-0}"
}

agent_dir() {
  case "$1" in
    codex | agents) echo ".agents/skills" ;;
    opencode) echo ".opencode/skills" ;;
    claude | claude-code) echo ".claude/skills" ;;
    *)
      echo "install.sh: unknown agent '$1' (use: codex | opencode | claude)" >&2
      exit 2
      ;;
  esac
}

# ── Parse flags ──────────────────────────────────────────────────────────────
while [ $# -gt 0 ]; do
  case "$1" in
    --agent) AGENT="${2:-}"; shift 2 ;;
    --agent=*) AGENT="${1#*=}"; shift ;;
    --target) TARGET="${2:-}"; shift 2 ;;
    --target=*) TARGET="${1#*=}"; shift ;;
    --global) GLOBAL=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h | --help) usage 0 ;;
    *) echo "install.sh: unexpected argument '$1'" >&2; usage 2 ;;
  esac
done

if [ ! -f "$SRC/SKILL.md" ]; then
  echo "install.sh: skill source not found at $SRC/SKILL.md" >&2
  exit 1
fi

# ── Resolve destination ──────────────────────────────────────────────────────
if [ -z "$TARGET" ]; then
  if [ -n "$AGENT" ]; then
    REL="$(agent_dir "$AGENT")"
  else
    # Auto-detect an existing skills dir in the project; default to .agents/skills.
    for candidate in .opencode/skills .claude/skills .agents/skills; do
      if [ -d "$candidate" ]; then REL="$candidate"; break; fi
    done
    REL="${REL:-.agents/skills}"
    echo "install.sh: no --agent/--target given; using $REL (auto-detected default)."
  fi
  if [ "$GLOBAL" -eq 1 ]; then
    TARGET="$HOME/$REL"
  else
    TARGET="$PWD/$REL"
  fi
fi

DEST="$TARGET/$SKILL_NAME"

echo "install.sh: source      $SRC"
echo "install.sh: destination $DEST"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "install.sh: --dry-run, nothing changed."
  exit 0
fi

# ── Install (idempotent replace) ─────────────────────────────────────────────
mkdir -p "$TARGET"
rm -rf "$DEST"
cp -R "$SRC" "$DEST"

echo "install.sh: installed $SKILL_NAME skill."
echo
echo "Next: register the MCP server so the agent can call the packs."
echo "  opencode.json:"
echo '    { "mcp": { "jev-harness": { "type": "local",'
echo '      "command": ["node", "harness/mcp/server.mjs"], "enabled": true,'
echo '      "environment": { "DECISION_ENGINE": "jev", "JEV_API_KEY": "{env:JEV_API_KEY}" } } } }'
echo "  codex: add an [mcp_servers.jev-harness] block (see harness/mcp/README.md)."
echo
echo "See harness/ONBOARDING.md for configuration and a smoke test."
