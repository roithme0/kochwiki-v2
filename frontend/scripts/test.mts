import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(
      new URL('../node_modules/@angular/cli/bin/ng.js', import.meta.url),
    ),
    'test',
    ...process.argv.slice(2),
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_OPTIONS:
        `${process.env['NODE_OPTIONS'] ?? ''} --preserve-symlinks`.trim(),
    },
  },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
