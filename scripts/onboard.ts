import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { isAbsolute, join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

import {
  parseOnboardArgs,
  onboardUsage,
  type OnboardOptions,
} from "@/lib/onboarding/args";
import {
  ensureEnvLocal,
  looksLikePlaceholder,
  writeEnvVars,
} from "@/lib/onboarding/env";
import { parseCatalogCsv, CATALOG_COLUMNS } from "@/lib/onboarding/catalog";
import {
  ensureYCloudChannel,
  importCatalog,
  resolveDefaultTenantId,
  storeProviderCredentials,
} from "@/lib/onboarding/store";
import { createJevProvider } from "@/lib/system-one/provider/jev";
import { createOpenAiDecisionsProvider } from "@/lib/system-one/provider/openai-decisions";

// ─── `npm run onboard` — one-command onboarding (Phase 7) ────────────────────
//
// Fresh clone → runnable product + configured JEV harness. Design rules:
//   * idempotent       — safe to re-run; nothing is overwritten blindly.
//   * fail-soft        — a missing provider key skips that step, never aborts.
//   * secret-safe      — keys are read from the env and never printed/logged.
//   * --dry-run first  — prints the plan and changes nothing.

const REPO_ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));

type StepStatus = "done" | "skipped" | "failed";
interface StepResult {
  status: StepStatus;
  note?: string;
}
interface StepRecord {
  label: string;
  status: StepStatus;
  note?: string;
}
const results: StepRecord[] = [];

async function runStep(
  label: string,
  fn: () => StepResult | Promise<StepResult>,
): Promise<void> {
  try {
    const result = await fn();
    results.push({ label, ...result });
    console.log(`${mark(result.status)} ${label}${result.note ? ` — ${result.note}` : ""}`);
  } catch (error) {
    const note = scrub(error instanceof Error ? error.message : String(error));
    results.push({ label, status: "failed", note });
    console.log(`${mark("failed")} ${label} — ${note}`);
  }
}

function mark(status: StepStatus): string {
  if (status === "done") return "[ ok ]";
  if (status === "skipped") return "[skip]";
  return "[fail]";
}

/** Removes anything that could be a bearer/token before printing. */
function scrub(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer <redacted>")
    .replace(/\bsk-[A-Za-z0-9_-]{6,}\b/g, "sk-<redacted>");
}

function runNpm(script: string): number {
  const result = spawnSync("npm", ["run", script], {
    cwd: REPO_ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return result.status ?? 1;
}

function resolveEngine(opts: OnboardOptions): "jev" | "openai-decisions" {
  if (opts.decisions === "openai") return "openai-decisions";
  if (opts.jev) return "jev";
  const raw = (
    process.env.DECISION_PROVIDER ??
    process.env.DECISION_ENGINE ??
    ""
  ).toLowerCase();
  if (raw === "openai" || raw === "openai-decisions") return "openai-decisions";
  return "jev";
}

function providerKey(engine: "jev" | "openai-decisions"): string {
  if (engine === "openai-decisions") return process.env.OPENAI_API_KEY ?? "";
  return process.env.JEV_API_KEY || process.env.TYPESAFE_API_KEY || "";
}

async function requireTenant(): Promise<number> {
  const tenantId = await resolveDefaultTenantId();
  if (tenantId === null) {
    throw new Error("no tenant found; run `npm run db:seed` first");
  }
  return tenantId;
}

/** Calls the raw provider (bypassing the rules fallback) to prove the key. */
async function smokeDecision(
  engine: "jev" | "openai-decisions",
): Promise<StepResult> {
  const apiKey = providerKey(engine);
  if (!apiKey) return { status: "skipped", note: "no decision key configured" };

  try {
    const provider =
      engine === "openai-decisions"
        ? createOpenAiDecisionsProvider({
            apiKey,
            model: process.env.OPENAI_DECISIONS_MODEL,
            baseUrl: process.env.OPENAI_DECISIONS_BASE_URL,
          })
        : createJevProvider({
            apiKey,
            model: process.env.JEV_MODEL,
            baseUrl: process.env.JEV_BASE_URL,
          });

    const answers = await provider.decide("smoke test: is this a smoke test?", {
      reachable: {
        type: "noul",
        instructions:
          "Return a high probability if this text contains the words 'smoke test'.",
      },
    });

    return {
      status: "done",
      note: `provider=${provider.name} answer=${answers.reachable.type} (key never printed)`,
    };
  } catch (error) {
    return {
      status: "failed",
      note: `provider=${engine} error=${scrub(
        error instanceof Error ? error.message : String(error),
      )}`,
    };
  }
}

function agentSkillsDir(agent: string | null): string {
  if (!agent) {
    for (const candidate of [".opencode/skills", ".claude/skills", ".agents/skills"]) {
      if (existsSync(join(REPO_ROOT, candidate))) return candidate;
    }
    return ".agents/skills";
  }
  const name = agent.toLowerCase();
  if (name === "codex" || name === "agents") return ".agents/skills";
  if (name === "opencode") return ".opencode/skills";
  if (name === "claude" || name === "claude-code") return ".claude/skills";
  throw new Error(`unknown agent '${agent}' (use codex | opencode | claude)`);
}

async function main(): Promise<void> {
  const opts = parseOnboardArgs(process.argv.slice(2));

  console.log("JEV Harness — one-command onboarding");
  console.log("====================================");
  if (opts.help) {
    console.log(onboardUsage());
    return;
  }
  if (opts.dryRun) console.log("(dry-run) no changes will be made.\n");

  // 1. Environment bootstrap ─────────────────────────────────────────────────
  let envLocalPath = join(REPO_ROOT, ".env.local");
  await runStep("Environment (.env.local)", () => {
    const res = ensureEnvLocal({ dir: REPO_ROOT, dryRun: opts.dryRun });
    envLocalPath = res.path;
    return {
      status: "done",
      note: res.created ? "created from .env.example" : "already present",
    };
  });

  // Load .env.local (then .env) into the process for the remaining steps.
  loadDotenv({ path: join(REPO_ROOT, ".env.local"), quiet: true });
  loadDotenv({ path: join(REPO_ROOT, ".env"), quiet: true });

  await runStep("Environment minimum set", () => {
    const required = ["DATABASE_URL", "AUTH_SECRET", "ENCRYPTION_KEY"];
    const missing = required.filter((key) => looksLikePlaceholder(process.env[key]));
    if (looksLikePlaceholder(process.env.OPENAI_API_KEY)) {
      missing.push("OPENAI_API_KEY");
    }
    if (missing.length > 0) {
      return {
        status: "done",
        note: `set before running the app: ${missing.join(", ")}`,
      };
    }
    return { status: "done", note: "all present" };
  });

  // 2. Database ──────────────────────────────────────────────────────────────
  await runStep("Database (migrate + seed)", () => {
    if (opts.noDb) return { status: "skipped", note: "--no-db" };
    if (opts.dryRun) return { status: "skipped", note: "dry-run" };
    if (runNpm("db:migrate") !== 0) {
      if (runNpm("db:push") !== 0) {
        return { status: "failed", note: "migrate and push both failed" };
      }
    }
    if (runNpm("db:seed") !== 0) {
      return { status: "failed", note: "seed failed" };
    }
    return { status: "done", note: "default tenant + admin + sample catalog" };
  });

  // 3. Decision layer ────────────────────────────────────────────────────────
  const engine = resolveEngine(opts);
  await runStep("Decision layer", async () => {
    if (opts.jev || opts.decisions) {
      const updates: Record<string, string> =
        opts.decisions === "openai"
          ? { DECISION_PROVIDER: "openai-decisions" }
          : { DECISION_PROVIDER: "jev", DECISION_ENGINE: "jev" };
      if (opts.jev) {
        const key = process.env.JEV_API_KEY || process.env.TYPESAFE_API_KEY;
        if (key) updates.JEV_API_KEY = key;
      }
      const { changedKeys } = writeEnvVars({
        path: envLocalPath,
        updates,
        dryRun: opts.dryRun,
      });
      const smoke = await smokeDecision(engine);
      return {
        ...smoke,
        note: `${smoke.note ?? ""}${smoke.note ? "; " : ""}keys: ${
          changedKeys.length > 0 ? changedKeys.join(",") : "unchanged"
        }`,
      };
    }
    return smokeDecision(engine);
  });

  // 4. YCloud ────────────────────────────────────────────────────────────────
  await runStep("YCloud credentials + channel", async () => {
    if (!opts.ycloud) return { status: "skipped", note: "pass --ycloud to enable" };
    const credentials = {
      api_key: process.env.YCLOUD_API_KEY ?? "",
      webhook_secret: process.env.YCLOUD_WEBHOOK_SECRET ?? "",
      phone_number: process.env.WHATSAPP_PHONE_NUMBER ?? "",
    };
    const missing = Object.entries(credentials)
      .filter(([, value]) => !value)
      .map(([key]) => key);
    if (missing.length > 0) {
      return { status: "skipped", note: `missing ${missing.join(", ")}` };
    }
    if (opts.dryRun) return { status: "skipped", note: "dry-run" };

    const tenantId = await requireTenant();
    const written = await storeProviderCredentials({
      tenantId,
      provider: "ycloud",
      credentials,
    });
    await ensureYCloudChannel({ tenantId, phoneNumber: credentials.phone_number });
    const base = process.env.BASE_URL ?? "https://your-domain.com";
    return {
      status: "done",
      note: `stored ${written.join(",")}; webhook ${base}/api/webhook/whatsapp`,
    };
  });

  // 5. Meta Embedded Signup ──────────────────────────────────────────────────
  await runStep("Meta embedded signup", () => {
    if (!opts.meta) return { status: "skipped", note: "pass --meta to enable" };
    if (!process.env.META_APP_ID) {
      return { status: "skipped", note: "META_APP_ID not set" };
    }
    const stillNeeded: string[] = [];
    if (!process.env.META_APP_SECRET) stillNeeded.push("META_APP_SECRET");
    if (!process.env.BASE_URL) stillNeeded.push("BASE_URL (public HTTPS)");
    return {
      status: "done",
      note: `route ready at /api/meta/embedded-signup; see docs/meta-embedded-signup.md${
        stillNeeded.length > 0 ? `; still needed: ${stillNeeded.join(", ")}` : ""
      }`,
    };
  });

  // 6. Catalog import ────────────────────────────────────────────────────────
  await runStep("Catalog import", async () => {
    if (!opts.catalog) {
      return { status: "skipped", note: "pass --catalog=<path.csv>" };
    }
    const catalogPath = isAbsolute(opts.catalog)
      ? opts.catalog
      : resolve(REPO_ROOT, opts.catalog);
    if (!existsSync(catalogPath)) {
      return { status: "failed", note: `file not found: ${opts.catalog}` };
    }
    const rows = parseCatalogCsv(readFileSync(catalogPath, "utf8"));
    if (rows.length === 0) {
      return {
        status: "failed",
        note: `no rows parsed; columns: ${CATALOG_COLUMNS}`,
      };
    }
    if (opts.dryRun) {
      return { status: "skipped", note: `would import ${rows.length} rows (dry-run)` };
    }
    const tenantId = await requireTenant();
    const { inserted, skipped } = await importCatalog(tenantId, rows);
    return { status: "done", note: `inserted=${inserted} skipped=${skipped}` };
  });

  // 7. Harness install ───────────────────────────────────────────────────────
  await runStep("Harness install (jev-decide skill)", () => {
    const source = join(REPO_ROOT, "harness", "skills", "jev-decide");
    if (!existsSync(join(source, "SKILL.md"))) {
      return { status: "failed", note: "harness/skills/jev-decide/SKILL.md not found" };
    }
    const rel = agentSkillsDir(opts.agent);
    const destination = join(REPO_ROOT, rel, "jev-decide");
    if (opts.dryRun) {
      return { status: "skipped", note: `would install to ${rel}/jev-decide (dry-run)` };
    }
    rmSync(destination, { recursive: true, force: true });
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination, { recursive: true });
    return { status: "done", note: `installed ${rel}/jev-decide` };
  });

  // 8. Final checklist ───────────────────────────────────────────────────────
  await runStep("Manual steps (cannot be automated)", () => {
    console.log("      - Meta App Review + a verified business (Embedded Signup / Cloud API)");
    console.log("      - Public HTTPS + DNS for BASE_URL and the webhook callbacks");
    console.log("      - Rotate ADMIN_PASSWORD and store provider keys in the DB");
    console.log("      - Schedule POST /api/cron/flush every minute");
    console.log("      - Verify the gate: npx tsc --noEmit && npx eslint src && npm test && npm run build");
    return { status: "done", note: "see docs/deployment.md" };
  });

  // Summary ──────────────────────────────────────────────────────────────────
  const failed = results.filter((r) => r.status === "failed").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const done = results.filter((r) => r.status === "done").length;
  console.log(
    `\nSummary: ${done} done, ${skipped} skipped, ${failed} failed${
      opts.dryRun ? " (dry-run)" : ""
    }.`,
  );
  if (failed > 0) {
    console.log("Some steps failed — fix the notes above and re-run (safe to re-run).");
    process.exitCode = 1;
  } else {
    console.log("Onboarding complete. Secrets were never printed.");
  }
}

main().catch((error) => {
  console.error("onboard: unexpected failure —", scrub(String(error)));
  process.exitCode = 1;
});
