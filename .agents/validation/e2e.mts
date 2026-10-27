import { mkdir, access, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import {
  fingerprint,
  git,
  runCheck,
  type ValidationProfile,
} from './shared.mts';

export const inputs = [
  'frontend/',
  'backend/',
  'deployment/tests/docker-compose-e2e.yml',
  'deployment/tests/e2e-user.json',
  'deployment/tests/identity-provider.ref',
  'deployment/tests/prepare-e2e-identity.sh',
  'deployment/gateway/',
  'deployment/garage/',
  'deployment/postgres/',
  '.editorconfig',
  '.gitattributes',
  '.codex/',
  '.agents/validation/',
];
const compose = [
  'compose',
  '--project-name',
  'kochwiki-e2e',
  '-f',
  'deployment/tests/docker-compose-e2e.yml',
];
const baseURL = 'http://localhost:9002';
const issuerURL =
  'http://localhost:8026/realms/services/.well-known/openid-configuration';

export async function identityProviderRepository(
  root: string,
  configuredRepository: string = process.env.IDENTITY_PROVIDER_REPOSITORY ??
    '../identity-provider',
): Promise<string> {
  const repository = resolve(root, configuredRepository);
  const revision = (
    await readFile(join(root, 'deployment/tests/identity-provider.ref'), 'utf8')
  ).trim();
  if (!/^[a-f0-9]{40}$/.test(revision))
    throw new Error('Invalid identity-provider revision pin.');
  try {
    if (git(repository, ['rev-parse', 'HEAD'])[0]?.trim() !== revision)
      throw new Error(`Expected revision ${revision}.`);
    if (
      git(repository, [
        'status',
        '--porcelain',
        '-z',
        '--',
        'config/',
        'scripts/apply-config.sh',
      ]).length
    )
      throw new Error(
        'Provider configuration or apply script has local changes.',
      );
    await access(join(repository, 'config/services-realm.json'));
    await access(join(repository, 'scripts/apply-config.sh'));
  } catch (error: unknown) {
    throw new Error(
      `Incomplete E2E validation: identity-provider checkout at ${repository} must contain clean configuration at ${revision}. Set IDENTITY_PROVIDER_REPOSITORY to a matching checkout.`,
      { cause: error },
    );
  }
  return repository;
}

export async function waitForServices(
  urls: string[],
  timeout = 120_000,
): Promise<void> {
  const deadline = Date.now() + timeout;
  let failure: string;
  do {
    try {
      for (const url of urls) {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(3_000),
        });
        await response.body?.cancel();
        if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      }
      return;
    } catch (error: unknown) {
      failure = error instanceof Error ? error.message : String(error);
    }
    await setTimeout(500);
  } while (Date.now() < deadline);
  throw new Error(`E2E services did not become ready: ${failure}`);
}

export async function testE2E(root: string, cache: string): Promise<void> {
  await mkdir(cache, { recursive: true });
  const frontend = join(root, 'frontend');
  const cli = join(frontend, 'node_modules/@playwright/test/cli.js');
  for (const [path, description] of [
    [
      join(frontend, '.npm-token'),
      'private package token in frontend/.npm-token',
    ],
    [cli, 'installed Playwright dependency (run npm ci in frontend)'],
  ]) {
    await access(path).catch(() => {
      throw new Error(`Incomplete E2E validation: missing ${description}.`);
    });
  }
  const repository = await identityProviderRepository(root);
  const composeEnv = {
    ...process.env,
    IDENTITY_PROVIDER_REPOSITORY: repository,
  };
  try {
    await runCheck(
      root,
      'Docker availability',
      ['info', '--format', '{{.ServerVersion}}'],
      join(cache, 'docker-info.log'),
      30_000,
      'docker',
    );
    await runCheck(
      root,
      'Docker build and startup',
      [
        ...compose,
        'up',
        '-d',
        '--build',
        '--wait',
        '--wait-timeout',
        '180',
        '--force-recreate',
      ],
      join(cache, 'docker.log'),
      900_000,
      'docker',
      undefined,
      composeEnv,
    );
    await waitForServices([
      'http://localhost:8026/realms/master/.well-known/openid-configuration',
    ]);
    await runCheck(
      root,
      'Shared identity configuration and test account',
      [
        ...compose,
        'exec',
        '-T',
        'identity-provider',
        'bash',
        '/opt/e2e/prepare.sh',
      ],
      join(cache, 'identity-provider.log'),
      180_000,
      'docker',
      undefined,
      composeEnv,
    );
    // Nginx must resolve upstream addresses again after container replacement.
    await runCheck(
      root,
      'Gateway restart',
      [...compose, 'restart', 'gateway'],
      join(cache, 'gateway.log'),
      60_000,
      'docker',
      undefined,
      composeEnv,
    );
    await waitForServices([baseURL, `${baseURL}/api/meta/version`, issuerURL]);
    await runCheck(
      frontend,
      'Playwright (install Chromium with npx playwright install chromium if missing)',
      [cli, 'test'],
      join(cache, 'playwright.log'),
      180_000,
      process.execPath,
      undefined,
      { ...process.env, PLAYWRIGHT_BASE_URL: baseURL },
    );
  } catch (error: unknown) {
    for (const [command, name] of [
      ['ps', 'services'],
      ['logs', 'services-logs'],
    ]) {
      await runCheck(
        root,
        'E2E failure diagnostics',
        [
          ...compose,
          command,
          ...(command === 'logs'
            ? ['--no-color', '--tail', '2000']
            : ['--all']),
        ],
        join(cache, `${name}.log`),
        30_000,
        'docker',
        undefined,
        composeEnv,
      ).catch((diagnosticError: unknown) =>
        writeFile(join(cache, `${name}-error.log`), String(diagnosticError)),
      );
    }
    throw error;
  }
}

export function e2eProfile(root: string): ValidationProfile {
  return {
    scope: 'e2e',
    policy: {
      label: 'End-to-end',
      formatter: 'Formatter',
      success: 'Isolated Docker preparation and Playwright passed.',
      retry:
        'end-to-end validation: node .agents/validation/e2e.mts from the repository root',
    },
    dependencies: (cache) => ({
      reuseSuccess: false,
      fingerprint: () =>
        fingerprint(root, inputs, ['frontend/node_modules/.package-lock.json']),
      hasChanges: () =>
        git(root, ['status', '--porcelain', '-z', '--', ...inputs]).length > 0,
      format: () => Promise.resolve({ checked: [], formatted: [] }),
      test: () => testE2E(root, cache),
    }),
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length !== 2)
    throw new Error('Usage: node .agents/validation/e2e.mts');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  await testE2E(root, join(root, '.agents/.codex-validation/e2e/manual'));
  process.stdout.write('Isolated Docker preparation and Playwright passed.\n');
}
