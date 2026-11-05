import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { backendPython } from "./backend.mts";
import { runCheck } from "./shared.mts";

export async function checkContract(
  root: string,
  cache: string,
): Promise<void> {
  await mkdir(cache, { recursive: true });
  const frontend = join(root, "frontend");
  await runCheck(
    frontend,
    "Kochwiki contract freshness",
    [join(frontend, "scripts/kochwiki-contract.mjs"), "--check"],
    join(cache, "kochwiki-contract.log"),
    120_000,
    process.execPath,
    undefined,
    { ...process.env, PYTHON: backendPython(root) },
  );
}
