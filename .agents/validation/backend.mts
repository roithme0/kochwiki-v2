import { mkdir, mkdtemp, readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  changedFiles,
  fingerprint,
  git,
  runCheck,
  sourcePath,
  writeFormatting,
  type FormatResult,
  type PendingFormatting,
  type ValidationProfile,
  type ValidationChecks,
  defaultChecks,
} from "./shared.mts";

export function backendPython(root: string): string {
  return join(
    root,
    "backend/.venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
}

export async function backendFingerprint(root: string): Promise<string> {
  const backend = "backend/";
  const libraries =
    process.platform === "win32"
      ? ["backend/.venv/Lib/site-packages"]
      : ["backend/.venv/lib/python3.13/site-packages"];
  const environment = [
    "backend/.venv/pyvenv.cfg",
    relative(root, backendPython(root)),
  ];
  for (const library of libraries) {
    const entries = await readdir(join(root, library), {
      withFileTypes: true,
    }).catch((error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return [];
      throw error;
    });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.endsWith(".dist-info"))
        environment.push(join(library, entry.name, "METADATA"));
    }
  }
  return fingerprint(
    root,
    [backend, ".codex/", ".agents/validation/"],
    environment,
  );
}

export async function formatBackend(
  root: string,
  cache: string,
  python: string = backendPython(root),
): Promise<FormatResult> {
  await mkdir(cache, { recursive: true });
  const pending: PendingFormatting[] = [];
  const checked: string[] = [];
  for (const name of changedFiles(root, "backend/")) {
    if (
      !/\.pyi?$/.test(name) ||
      /\/(?:\.venv|\.codex-validation|__pycache__|\.pytest_cache[^/]*|\.pytest_tmp[^/]*)\//.test(
        name,
      )
    )
      continue;
    const path = await sourcePath(root, "backend", name);
    if (!path) continue;
    const original = await readFile(path, "utf8");
    const output = await runCheck(
      join(root, "backend"),
      "Backend Black formatting",
      [
        "-X",
        "utf8",
        "-m",
        "black",
        "--config",
        join(root, "backend/pyproject.toml"),
        "--quiet",
        "--stdin-filename",
        path,
        "-",
      ],
      join(cache, "format.log"),
      120_000,
      python,
      original,
    );
    const newline = original.match(/\r?\n/)?.[0] ?? "\n";
    const formatted = output.replace(/\r?\n/g, newline);
    checked.push(name);
    if (original !== formatted)
      pending.push({ name, path, original, formatted });
  }
  return { checked, formatted: await writeFormatting(pending) };
}

export async function runBackendPytest(
  root: string,
  cache: string,
  python: string = backendPython(root),
  run: typeof runCheck = runCheck,
  nativeArgs: readonly string[] = [],
): Promise<void> {
  await mkdir(cache, { recursive: true });
  const artifacts = await mkdtemp(join(cache, "pytest-"));
  await run(
    join(root, "backend"),
    "Backend pytest",
    [
      "-m",
      "pytest",
      `--basetemp=${join(artifacts, "tmp")}`,
      "-o",
      `cache_dir=${join(artifacts, "cache")}`,
      ...nativeArgs,
    ],
    join(cache, "pytest.log"),
    300_000,
    python,
  );
}

async function lintBackendAst(
  root: string,
  cache: string,
  python: string,
): Promise<void> {
  const files = git(root, [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "--deduplicate",
    "-z",
    "--",
    "backend/",
  ])
    .filter((name) => name.endsWith(".py"))
    .sort();
  const sources = await Promise.all(
    files.map((name) => sourcePath(root, "backend", name)),
  );
  await runCheck(
    root,
    "Backend AST lint",
    ["-B", "-X", "utf8", "backend/scripts/lint_ast.py"],
    join(cache, "lint.log"),
    120_000,
    python,
    files.filter((_, index) => sources[index] !== null).join("\0"),
  );
}

export async function lintBackend(
  root: string,
  cache: string,
  python: string = backendPython(root),
): Promise<void> {
  await mkdir(cache, { recursive: true });
  const results = await Promise.allSettled([
    runCheck(
      root,
      "Backend Ruff lint",
      [
        "-m",
        "ruff",
        "check",
        "--no-fix",
        "--no-cache",
        "--output-format",
        "concise",
        "backend",
      ],
      join(cache, "ruff.log"),
      120_000,
      python,
    ),
    lintBackendAst(root, cache, python),
  ]);
  const failures: string[] = [];
  for (const result of results) {
    if (result.status === "rejected") {
      const error: unknown = result.reason;
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (failures.length) throw new Error(failures.join("\n\n"));
}

export function backendProfile(
  root: string,
  checks: Readonly<ValidationChecks> = defaultChecks,
): ValidationProfile {
  return {
    scope: "backend",
    policy: {
      label: "Backend",
      formatter: "Black",
      success: "Selected backend checks passed.",
      retry:
        "node .agents/validation/run.mts --scope backend from the repository root",
    },
    dependencies: (cache) => ({
      fingerprint: () => backendFingerprint(root),
      hasChanges: () =>
        git(root, [
          "status",
          "--porcelain",
          "-z",
          "--",
          "backend/",
          ".codex/",
          ".agents/validation/",
        ]).length > 0,
      format: () => formatBackend(root, cache),
      lint: () => lintBackend(root, cache),
      test: async () => {
        const { parseTestArguments, runTests } = await import("./test.mts");
        const args: string[] = [];
        if (checks.toolingTests) args.push("--group", "tooling-backend");
        if (checks.appTests) args.push("--group", "backend");
        if (args.length) await runTests(root, parseTestArguments(args));
      },
    }),
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const command = process.argv[2];
  if (
    process.argv.length !== 3 ||
    (command !== "--format" && command !== "--lint")
  )
    throw new Error(
      "Usage: node .agents/validation/backend.mts --format|--lint",
    );
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const cache = join(root, ".codex-validation/backend/manual");
  if (command === "--lint") {
    try {
      await lintBackend(root, cache);
      process.stdout.write("Backend lint passed.\n");
    } catch (error: unknown) {
      process.stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    }
  } else {
    const result = await formatBackend(root, cache);
    process.stdout.write(
      `Checked ${result.checked.length} changed Python files; formatted ${result.formatted.length}.\n`,
    );
    for (const name of result.formatted) process.stdout.write(`${name}\n`);
  }
}
