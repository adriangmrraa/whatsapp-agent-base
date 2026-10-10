// ─── Onboarding CLI argument parsing ─────────────────────────────────────────
//
// Pure, side-effect-free flag parsing for `npm run onboard`. Unknown flags are
// ignored (fail-soft): a typo must never abort the run.

export type OnboardDecisions = "openai" | null;

export interface OnboardOptions {
  /** Non-interactive, safe defaults. */
  yes: boolean;
  /** Print the plan; change nothing. */
  dryRun: boolean;
  /** Configure the Jev decision provider. */
  jev: boolean;
  /** Configure the OpenAI Decisions provider instead of Jev. */
  decisions: OnboardDecisions;
  /** Start the Meta Embedded Signup flow (scaffold + instructions). */
  meta: boolean;
  /** Store YCloud credentials + register the channel. */
  ycloud: boolean;
  /** Path to a products CSV to import (tenant-scoped). */
  catalog: string | null;
  /** Skip migrate/seed (CI / dry runs). */
  noDb: boolean;
  /** Target agent skills dir override (`codex` | `opencode` | `claude`). */
  agent: string | null;
  /** Print usage and exit. */
  help: boolean;
}

export const DEFAULT_ONBOARD_OPTIONS: OnboardOptions = {
  yes: false,
  dryRun: false,
  jev: false,
  decisions: null,
  meta: false,
  ycloud: false,
  catalog: null,
  noDb: false,
  agent: null,
  help: false,
};

function splitFlag(arg: string): { key: string; value?: string } {
  const eq = arg.indexOf("=");
  if (eq === -1) return { key: arg };
  return { key: arg.slice(0, eq), value: arg.slice(eq + 1) };
}

/**
 * Parses `process.argv.slice(2)`. Accepts both `--flag=value` and
 * `--flag value`. Unknown flags and invalid values are ignored.
 */
export function parseOnboardArgs(argv: readonly string[]): OnboardOptions {
  const opts: OnboardOptions = { ...DEFAULT_ONBOARD_OPTIONS };

  for (let i = 0; i < argv.length; i++) {
    const { key, value } = splitFlag(argv[i]);

    // Resolve a value for value-flags: `--flag=v`, else the next non-flag arg.
    const takeValue = (): string | undefined => {
      if (value !== undefined) return value;
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        i += 1;
        return next;
      }
      return undefined;
    };

    switch (key) {
      case "--yes":
        opts.yes = true;
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--jev":
        opts.jev = true;
        break;
      case "--meta":
        opts.meta = true;
        break;
      case "--ycloud":
        opts.ycloud = true;
        break;
      case "--no-db":
        opts.noDb = true;
        break;
      case "--help":
      case "-h":
        opts.help = true;
        break;
      case "--decisions": {
        const v = takeValue();
        if (v === "openai") opts.decisions = "openai";
        break;
      }
      case "--catalog": {
        const v = takeValue();
        if (v) opts.catalog = v;
        break;
      }
      case "--agent": {
        const v = takeValue();
        if (v) opts.agent = v;
        break;
      }
      default:
        // Unknown flag — ignore (fail-soft).
        break;
    }
  }

  return opts;
}

export function onboardUsage(): string {
  return [
    "JEV Harness — one-command onboarding",
    "",
    "Usage:",
    "  npm run onboard                 # env + db + decision smoke-test + harness install",
    "  npm run onboard -- --yes        # non-interactive, safe defaults",
    "  npm run onboard -- --dry-run    # print the plan, change nothing",
    "",
    "Flags:",
    "  --yes                  non-interactive; never prompt",
    "  --dry-run              print the plan and change nothing",
    "  --jev                  persist JEV_API_KEY + DECISION_ENGINE=jev, smoke-test one decision",
    "  --decisions=openai     use the OpenAI Decisions provider instead",
    "  --meta                 scaffold Meta Embedded Signup (account approvals stay manual)",
    "  --ycloud               store YCloud credentials + register the channel",
    "  --catalog=<path.csv>   import products/categories from a CSV (tenant-scoped)",
    "  --no-db                skip migrate/seed",
    "  --agent=<name>         install the skill into codex | opencode | claude",
    "  -h, --help             show this help",
    "",
    "Secrets are read from the environment (and .env.local). They are never",
    "printed, logged, or returned by this command.",
  ].join("\n");
}
