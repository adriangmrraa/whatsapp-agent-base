import { test } from "node:test";
import assert from "node:assert/strict";
import { runFileScope, FILE_SCOPE_FOLDER_FALLBACK } from "./file-scope";
import {
  choice,
  fakeProvider,
  noSignalProvider,
  noul,
  runtime,
} from "./test-support";
import type { PackInput } from "./types";

const input: PackInput = {
  task: "add tenant filter to the query",
  candidates: [
    { id: "src/db/queries.ts", kind: "file" },
    { id: "src/ui/Button.tsx", kind: "file" },
  ],
};

test("file-scope: reranks candidates and reads folder + covered", async () => {
  const provider = fakeProvider({
    file_0: noul(0.9),
    file_1: noul(0.1),
    folder: choice("db"),
    covered: noul(0.2),
  });
  const result = await runFileScope(input, runtime(provider));
  assert.deepEqual(result.value.files, ["src/db/queries.ts"]);
  assert.equal(result.value.folder, "db");
  assert.equal(result.value.incomplete, true);
  assert.equal(result.allow, true);
});

test("file-scope: unknown folder falls back to 'other'", async () => {
  const provider = fakeProvider({
    file_0: noul(0.9),
    file_1: noul(0.9),
    folder: choice("does-not-exist"),
    covered: noul(0.9),
  });
  const result = await runFileScope(input, runtime(provider));
  assert.equal(result.value.folder, FILE_SCOPE_FOLDER_FALLBACK);
  assert.equal(result.value.incomplete, false);
});

test("file-scope: no signal keeps all candidates and marks incomplete", async () => {
  const result = await runFileScope(input, runtime(noSignalProvider));
  assert.equal(result.degraded, true);
  assert.deepEqual(result.value.files, ["src/db/queries.ts", "src/ui/Button.tsx"]);
  assert.equal(result.value.incomplete, true);
  assert.equal(result.allow, true);
});
