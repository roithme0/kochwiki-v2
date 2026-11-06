import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertToolingMembership,
  parseTestArguments,
  runTests,
  toolingFiles,
} from "./test.mts";
import { parseValidationArguments, validate } from "./run.mts";

void test("default selects every non-E2E group and aliases compose without duplicates", () => {
  const defaults = parseTestArguments([]).groups;
  assert.ok(defaults.includes("backend"));
  assert.ok(defaults.includes("frontend-browser"));
  assert.ok(!defaults.includes("e2e"));
  assert.deepEqual(
    parseTestArguments(["--group", "non-e2e", "--group", "backend"]).groups,
    defaults,
  );
  assert.ok(parseTestArguments(["--group", "all"]).groups.includes("e2e"));
});
void test("invalid and ambiguous selections fail", () => {
  assert.throws(
    () => parseTestArguments(["--group", "missing"]),
    /Unknown test group/,
  );
  assert.throws(
    () => parseTestArguments(["--prebuilt-images"]),
    /requires selecting e2e/,
  );
  assert.throws(
    () => parseTestArguments(["--", "--test-name-pattern=foo"]),
    /exactly one/,
  );
});
void test("registry covers designated tooling test files", async () => {
  await assertToolingMembership(
    resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
  );
});
void test("validation cache distinguishes selected groups and skips unchanged turns", async () => {
  const root = await mkdtemp(join(tmpdir(), "validation-selection-"));
  for (const dir of [".agents/validation", ".codex", "frontend/scripts"])
    await mkdir(join(root, dir), { recursive: true });
  for (const file of Object.values(toolingFiles).flat())
    await writeFile(join(root, file), "");
  let fingerprint = "initial";
  let runs = 0;
  const profile = {
    scope: "frontend",
    policy: {
      label: "Frontend",
      formatter: "Formatter",
      success: "",
      retry: "",
    },
    dependencies: () => ({
      fingerprint: () => Promise.resolve(fingerprint),
      hasChanges: () => true,
      format: () => Promise.resolve({ checked: [], formatted: [] }),
      test: () => Promise.resolve(),
    }),
  };
  const services = {
    contract: () => Promise.resolve(),
    profiles: () => Promise.resolve([profile]),
    tests: () => {
      runs += 1;
      return Promise.resolve();
    },
  };
  const request = { sessionId: "fixture", start: true, continued: false };
  const full = parseValidationArguments([]);
  await validate(root, request, full, services);
  await validate(root, { ...request, start: false }, full, services);
  assert.equal(runs, 0);
  fingerprint = "changed";
  await validate(
    root,
    { ...request, start: false },
    parseValidationArguments(["--group", "frontend-app"]),
    services,
  );
  await validate(root, { ...request, start: false }, full, services);
  assert.equal(runs, 2);
});

void test("selected groups dispatch their registered files and propagate failures", async () => {
  const root = await mkdtemp(join(tmpdir(), "test-dispatch-"));
  const commands: { label: string; args: string[] }[] = [];
  const run: typeof import("./shared.mts").runCheck = (_cwd, label, args) => {
    commands.push({ label, args });
    return Promise.resolve("");
  };
  await runTests(
    root,
    parseTestArguments([
      "--group",
      "tooling-frontend",
      "--group",
      "frontend-browser",
    ]),
    run,
  );
  assert.deepEqual(
    commands.map(({ label }) => label),
    ["tooling-frontend", "frontend-browser"],
  );
  assert.deepEqual(commands[0].args, [
    "--test",
    ...toolingFiles["tooling-frontend"],
  ]);
  assert.deepEqual(commands[1].args, [
    "scripts/test.mts",
    "--configuration",
    "browser",
    "--watch=false",
  ]);
  const fail: typeof run = () => Promise.reject(new Error("runner failed"));
  await assert.rejects(
    runTests(root, parseTestArguments(["--group", "tooling-frontend"]), fail),
    /runner failed/,
  );
});

void test("backend native arguments reach pytest", async () => {
  const root = await mkdtemp(join(tmpdir(), "test-pytest-args-"));
  const calls: Parameters<typeof import("./shared.mts").runCheck>[] = [];
  const run: typeof import("./shared.mts").runCheck = (...args) => {
    calls.push(args);
    return Promise.resolve("");
  };
  await runTests(
    root,
    parseTestArguments(["--group", "backend", "--", "-k", "example"]),
    run,
  );
  assert.equal(calls[0][1], "Backend pytest");
  assert.deepEqual(calls[0][2].slice(-2), ["-k", "example"]);
});

void test("aggregate validation rejects changes made during checks", async () => {
  const root = await mkdtemp(join(tmpdir(), "validation-concurrent-"));
  for (const dir of [".agents/validation", ".codex", "frontend/scripts"])
    await mkdir(join(root, dir), { recursive: true });
  for (const file of Object.values(toolingFiles).flat())
    await writeFile(join(root, file), "");
  let fingerprint = "before";
  const profile = {
    scope: "frontend",
    policy: {
      label: "Frontend",
      formatter: "Formatter",
      success: "",
      retry: "",
    },
    dependencies: () => ({
      fingerprint: () => Promise.resolve(fingerprint),
      hasChanges: () => true,
      format: () => Promise.resolve({ checked: [], formatted: [] }),
      test: () => Promise.resolve(),
    }),
  };
  const result = await validate(
    root,
    { sessionId: "concurrent", start: false, continued: false, force: true },
    parseValidationArguments([]),
    {
      profiles: () => Promise.resolve([profile]),
      contract: () => Promise.resolve(),
      tests: () => {
        fingerprint = "after";
        return Promise.resolve();
      },
    },
  );
  assert.equal(result.failed, true);
  assert.match(result.message ?? "", /Files changed during validation/);
});

void test("CI contract prerequisite is limited to forced E2E validation and never skips normal checks", async () => {
  assert.throws(
    () => parseValidationArguments(["--ci-prerequisite-contracts"]),
    /E2E group alone/,
  );
  assert.throws(
    () =>
      parseValidationArguments([
        "--ci-prerequisite-contracts",
        "--group",
        "all",
      ]),
    /E2E group alone/,
  );
  const options = parseValidationArguments([
    "--group",
    "e2e",
    "--ci-prerequisite-contracts",
  ]);
  const root = await mkdtemp(join(tmpdir(), "validation-ci-"));
  execFileSync("git", ["init", "-q", root]);
  for (const dir of [".agents/validation", ".codex", "frontend/scripts"])
    await mkdir(join(root, dir), { recursive: true });
  for (const file of Object.values(toolingFiles).flat())
    await writeFile(join(root, file), "");
  let contractRuns = 0;
  let testRuns = 0;
  const profile = {
    scope: "frontend",
    policy: {
      label: "Frontend",
      formatter: "Formatter",
      success: "",
      retry: "",
    },
    dependencies: () => ({
      fingerprint: () => Promise.resolve("fixed"),
      hasChanges: () => true,
      format: () => Promise.resolve({ checked: [], formatted: [] }),
      test: () => Promise.resolve(),
    }),
  };
  const services = {
    profiles: () => Promise.resolve([profile]),
    contract: () => {
      contractRuns += 1;
      return Promise.resolve();
    },
    tests: () => {
      testRuns += 1;
      return Promise.resolve();
    },
  };
  const request = {
    sessionId: "ci",
    start: false,
    continued: false,
    force: true,
  };
  const previousActions = process.env["GITHUB_ACTIONS"];
  const previousJob = process.env["GITHUB_JOB"];
  try {
    process.env["GITHUB_ACTIONS"] = "false";
    process.env["GITHUB_JOB"] = "e2e";
    assert.equal(
      (await validate(root, request, options, services)).failed,
      true,
    );
    process.env["GITHUB_ACTIONS"] = "true";
    process.env["GITHUB_JOB"] = "validate";
    assert.equal(
      (await validate(root, request, options, services)).failed,
      true,
    );
    process.env["GITHUB_JOB"] = "e2e";
    assert.equal(
      (await validate(root, { ...request, force: false }, options, services))
        .failed,
      true,
    );
    assert.equal(
      (await validate(root, request, options, services)).failed,
      undefined,
    );
    assert.equal(contractRuns, 0);
    assert.equal(testRuns, 1);
    assert.equal(
      (
        await validate(
          root,
          request,
          parseValidationArguments(["--group", "e2e"]),
          services,
        )
      ).failed,
      undefined,
    );
    assert.equal(contractRuns, 1);
    assert.equal(testRuns, 2);
  } finally {
    if (previousActions === undefined) delete process.env["GITHUB_ACTIONS"];
    else process.env["GITHUB_ACTIONS"] = previousActions;
    if (previousJob === undefined) delete process.env["GITHUB_JOB"];
    else process.env["GITHUB_JOB"] = previousJob;
  }
});
