import { test } from "node:test";
import assert from "node:assert/strict";
import { createEngramMemoryProvider } from "./engram";
import { createNeonMemoryProvider, type NeonMemoryClient } from "./neon";
import { createNoneMemoryProvider } from "./none";
import { resolveMemoryProvider } from "./registry";

// ─── Engram (injected fetch) ─────────────────────────────────────────────────

interface Call {
  url: string;
  init: RequestInit;
}

function routedFetch(
  handler: (url: string, init: RequestInit) => unknown | undefined,
): { fetchFn: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchFn = (async (url: string | URL, init?: RequestInit) => {
    const captured = { url: String(url), init: init ?? {} };
    calls.push(captured);
    const body = handler(captured.url, captured.init);
    if (body === undefined) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

test("engram: search maps rows and get returns full content", async () => {
  const { fetchFn, calls } = routedFetch((url) => {
    if (url.includes("/search?")) {
      return [
        {
          id: 5100,
          title: "claim",
          type: "config",
          topic_key: "sdd/x",
          project: "proj",
          content: "full body ".repeat(50),
        },
      ];
    }
    if (url.includes("/observations/5100")) {
      return { id: 5100, content: "the full observation content" };
    }
    return undefined;
  });

  const memory = createEngramMemoryProvider({ fetchFn, project: "proj" });
  const refs = await memory.search("hello", { limit: 3 });
  assert.equal(refs.length, 1);
  assert.equal(refs[0].id, "5100");
  assert.equal(refs[0].topicKey, "sdd/x");
  assert.ok((refs[0].preview ?? "").length <= 300);
  assert.ok(calls[0].url.includes("q=hello"));
  assert.ok(calls[0].url.includes("limit=3"));

  const content = await memory.get("5100");
  assert.equal(content, "the full observation content");
});

test("engram: save ensures a session then posts the observation", async () => {
  const { fetchFn, calls } = routedFetch((url) => {
    if (url.endsWith("/sessions")) return { id: "sess", status: "created" };
    if (url.endsWith("/observations")) return { id: 999, status: "saved" };
    return undefined;
  });

  const memory = createEngramMemoryProvider({ fetchFn, project: "proj" });
  const id = await memory.save({
    title: "t",
    topicKey: "k",
    type: "decision",
    content: "c",
  });
  assert.equal(id, "999");
  assert.equal(calls.length, 2);
  const saveBody = JSON.parse(String(calls[1].init.body)) as Record<string, unknown>;
  assert.equal(saveBody.session_id, "jev-harness-proj");
  assert.equal(saveBody.topic_key, "k");
});

test("engram: fails soft when the server is unreachable", async () => {
  const throwing = (async () => {
    throw new Error("ECONNREFUSED");
  }) as unknown as typeof fetch;
  const memory = createEngramMemoryProvider({ fetchFn: throwing });
  assert.deepEqual(await memory.search("x"), []);
  assert.equal(await memory.get("1"), "");
  assert.equal(await memory.context(), "");
  assert.equal(await memory.save({ title: "t", topicKey: "k", type: "x", content: "c" }), "");
});

// ─── Neon (injected client) ──────────────────────────────────────────────────

function fakeClient(overrides: Partial<NeonMemoryClient> = {}): NeonMemoryClient {
  return {
    async search() {
      return [
        { id: "1", title: "T", type: "decision", topicKey: "k", project: "p", content: "hello" },
      ];
    },
    async get() {
      return { id: "1", title: "T", type: "decision", topicKey: "k", project: "p", content: "full" };
    },
    async save() {
      return "42";
    },
    async recent() {
      return [
        { id: "1", title: "T", type: "decision", topicKey: "k", project: "p", content: "hello" },
      ];
    },
    ...overrides,
  };
}

test("neon: maps rows and scopes by tenant + project", async () => {
  let seenTenant = -1;
  let seenProject = "";
  const client = fakeClient({
    async search(input) {
      seenTenant = input.tenantId;
      seenProject = input.project;
      return [{ id: "1", title: "T", type: "decision", topicKey: "k", project: input.project, content: "hello" }];
    },
  });
  const memory = createNeonMemoryProvider({ tenantId: 7, project: "proj", client });
  const refs = await memory.search("q");
  assert.equal(seenTenant, 7);
  assert.equal(seenProject, "proj");
  assert.equal(refs[0].id, "1");
  assert.equal(await memory.get("1"), "full");
  assert.equal(await memory.save({ title: "t", topicKey: "k", type: "x", content: "c" }), "42");
  assert.ok((await memory.context()).includes("T"));
});

test("neon: fails soft when the query throws", async () => {
  const client = fakeClient({
    async search() {
      throw new Error("no such table");
    },
    async get() {
      throw new Error("boom");
    },
  });
  const memory = createNeonMemoryProvider({ tenantId: 1, client });
  assert.deepEqual(await memory.search("q"), []);
  assert.equal(await memory.get("1"), "");
});

// ─── None ────────────────────────────────────────────────────────────────────

test("none: every method is empty", async () => {
  const memory = createNoneMemoryProvider();
  assert.deepEqual(await memory.search("q"), []);
  assert.equal(await memory.get("1"), "");
  assert.equal(await memory.save({ title: "t", topicKey: "k", type: "x", content: "c" }), "");
  assert.equal(await memory.context(), "");
});

// ─── Registry ────────────────────────────────────────────────────────────────

test("registry: JEV_MEMORY selects the backend; default is engram", () => {
  assert.equal(resolveMemoryProvider({ env: {} }).name, "engram");
  assert.equal(resolveMemoryProvider({ env: { JEV_MEMORY: "none" } }).name, "none");
  assert.equal(
    resolveMemoryProvider({ env: { JEV_MEMORY: "neon" }, tenantId: 3 }).name,
    "neon",
  );
  assert.equal(resolveMemoryProvider({ env: { JEV_MEMORY: "bogus" } }).name, "engram");
});

test("registry: neon without a tenant degrades to none (no unscoped query)", () => {
  assert.equal(resolveMemoryProvider({ env: { JEV_MEMORY: "neon" } }).name, "none");
});

test("registry: explicit backend beats env", () => {
  assert.equal(
    resolveMemoryProvider({ backend: "none", env: { JEV_MEMORY: "engram" } }).name,
    "none",
  );
});
