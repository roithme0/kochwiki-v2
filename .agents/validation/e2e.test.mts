import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  e2eProfile,
  identityProviderRepository,
  testE2E,
  waitForServices,
} from './e2e.mts';
import { runCheck } from './shared.mts';

void test('readiness waits for every service and reports unavailable endpoints', async () => {
  let ready = false;
  const server = createServer((request, response) => {
    response.writeHead(request.url === '/provider' && !ready ? 503 : 200).end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    await assert.rejects(
      waitForServices([base, `${base}/provider`], 1),
      /provider: HTTP 503/,
    );
    ready = true;
    await waitForServices([base, `${base}/provider`], 1000);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

void test('E2E fingerprints deployment and tooling changes, ignores artifacts, and disables success reuse', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kochwiki-e2e-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  await mkdir(join(root, 'deployment/tests'), { recursive: true });
  await mkdir(join(root, '.agents/validation'), { recursive: true });
  await mkdir(join(root, '.agents/.codex-validation'), { recursive: true });
  await writeFile(join(root, '.agents/.gitignore'), '/.codex-validation/\n');
  const dependencies = e2eProfile(root).dependencies(join(root, 'cache'));
  assert.equal(dependencies.reuseSuccess, false);
  const initial = await dependencies.fingerprint();
  await writeFile(join(root, '.agents/.codex-validation/state.json'), '{}');
  assert.equal(await dependencies.fingerprint(), initial);
  await writeFile(
    join(root, 'deployment/tests/identity-provider.ref'),
    'revision',
  );
  const realm = await dependencies.fingerprint();
  assert.notEqual(realm, initial);
  await writeFile(join(root, '.agents/validation/source.mts'), 'export {};');
  assert.notEqual(await dependencies.fingerprint(), realm);
  assert.equal(dependencies.hasChanges(), true);
});

void test('provider checkout must match the pin and have clean configuration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kochwiki-provider-'));
  const repository = join(root, 'provider');
  await mkdir(join(root, 'deployment/tests'), { recursive: true });
  await mkdir(join(repository, 'config'), { recursive: true });
  await mkdir(join(repository, 'scripts'), { recursive: true });
  const realm = join(repository, 'config/services-realm.json');
  await writeFile(realm, '{}');
  await writeFile(join(repository, 'scripts/apply-config.sh'), 'exit 0');
  const runGit = (args: string[]): string =>
    execFileSync('git', args, {
      cwd: repository,
      encoding: 'utf8',
      windowsHide: true,
    }).trim();
  runGit(['init', '-q']);
  runGit(['add', '.']);
  runGit([
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.invalid',
    'commit',
    '-qm',
    'fixture',
  ]);
  const pin = join(root, 'deployment/tests/identity-provider.ref');
  const revision = runGit(['rev-parse', 'HEAD']);
  await writeFile(pin, '0'.repeat(40));
  await assert.rejects(
    identityProviderRepository(root, repository),
    /must contain clean configuration/,
  );
  await writeFile(pin, revision);
  assert.equal(await identityProviderRepository(root, repository), repository);
  await writeFile(realm, '{"changed":true}');
  await assert.rejects(
    identityProviderRepository(root, repository),
    /must contain clean configuration/,
  );
  await writeFile(realm, '{}');
  await writeFile(join(repository, 'config/extra.json'), '{}');
  await assert.rejects(
    identityProviderRepository(root, repository),
    /must contain clean configuration/,
  );
});

void test('missing private package credentials or Playwright reports incomplete validation before Docker starts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kochwiki-e2e-prerequisites-'));
  await mkdir(join(root, 'frontend'), { recursive: true });
  const cache = join(root, 'cache');
  await assert.rejects(
    testE2E(root, cache),
    /Incomplete E2E validation: missing private package token/,
  );
  await writeFile(
    join(root, 'frontend/.npm-token'),
    'disposable-test-placeholder',
  );
  await assert.rejects(
    testE2E(root, cache),
    /Incomplete E2E validation: missing installed Playwright dependency/,
  );
});

void test('E2E uses prebuilt images without app builds or pulls and retains diagnostics', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'kochwiki-e2e-images-'));
  const repository = join(root, 'provider');
  await mkdir(join(root, 'deployment/tests'), { recursive: true });
  await mkdir(join(repository, 'config'), { recursive: true });
  await mkdir(join(repository, 'scripts'), { recursive: true });
  await writeFile(join(repository, 'config/services-realm.json'), '{}');
  await writeFile(join(repository, 'scripts/apply-config.sh'), 'exit 0');
  execFileSync('git', ['init', '-q'], { cwd: repository });
  execFileSync('git', ['add', '.'], { cwd: repository });
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '-qm',
      'fixture',
    ],
    { cwd: repository },
  );
  await writeFile(
    join(root, 'deployment/tests/identity-provider.ref'),
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository }),
  );
  const cli = join(root, 'frontend/node_modules/@playwright/test/cli.js');
  await mkdir(join(root, 'frontend/node_modules/@playwright/test'), {
    recursive: true,
  });
  await writeFile(cli, '');
  t.mock.method(globalThis, 'fetch', () =>
    Promise.resolve(new Response('ready')),
  );
  const previousRepository = process.env['IDENTITY_PROVIDER_REPOSITORY'];
  process.env['IDENTITY_PROVIDER_REPOSITORY'] = repository;
  try {
    for (const prebuilt of [true, false]) {
      if (!prebuilt)
        await writeFile(join(root, 'frontend/.npm-token'), 'fixture');
      for (const failure of [
        undefined,
        'Infrastructure image pull',
        'Docker build and startup',
        'Playwright',
      ]) {
        if (!prebuilt && failure === 'Infrastructure image pull') continue;
        const calls: Parameters<typeof runCheck>[] = [];
        const original = new Error('original failure');
        const run: typeof runCheck = (...args) => {
          calls.push(args);
          if (failure && args[1].startsWith(failure)) throw original;
          if (args[1] === 'E2E failure diagnostics')
            throw new Error('diagnostics failed');
          return Promise.resolve('');
        };
        const nativeArgs = ['--grep', 'specific flow'];
        const result = testE2E(
          root,
          join(root, 'artifacts'),
          run,
          prebuilt,
          nativeArgs,
        );
        if (failure)
          await assert.rejects(result, (error: unknown) => error === original);
        else await result;
        const compose = [
          'compose',
          '--project-name',
          'kochwiki-e2e',
          '-f',
          'deployment/tests/docker-compose-e2e.yml',
          ...(prebuilt
            ? ['-f', 'deployment/tests/docker-compose-e2e.override.yml']
            : []),
        ];
        const commands = calls
          .filter((args) => args[2][0] === 'compose')
          .map((args) => args[2]);
        assert.deepEqual(commands, [
          ...(prebuilt
            ? [
                [
                  ...compose,
                  'pull',
                  'db',
                  'identity-provider',
                  'file-storage',
                  'file-storage-init',
                  'gateway',
                ],
              ]
            : []),
          ...(failure === 'Infrastructure image pull'
            ? []
            : [
                [
                  ...compose,
                  'up',
                  '-d',
                  ...(prebuilt
                    ? ['--no-build', '--pull', 'never']
                    : ['--build']),
                  '--wait',
                  '--wait-timeout',
                  '180',
                  '--force-recreate',
                ],
              ]),
          ...(!failure || failure === 'Playwright'
            ? [
                [
                  ...compose,
                  'exec',
                  '-T',
                  'identity-provider',
                  'bash',
                  '/opt/e2e/prepare.sh',
                ],
                [...compose, 'restart', 'gateway'],
              ]
            : []),
          ...(failure
            ? [
                [...compose, 'ps', '--all'],
                [...compose, 'logs', '--no-color', '--tail', '2000'],
              ]
            : []),
        ]);
        assert.equal(
          calls.some((args) => args[1].startsWith('Playwright')),
          !failure || failure === 'Playwright',
        );
        const playwright = calls.find((args) =>
          args[1].startsWith('Playwright'),
        );
        if (playwright) assert.deepEqual(playwright[2].slice(-2), nativeArgs);
        for (const call of calls.filter((args) => args[2][0] === 'compose')) {
          assert.equal(call[7]?.['IDENTITY_PROVIDER_REPOSITORY'], repository);
        }
      }
    }
  } finally {
    if (previousRepository === undefined)
      delete process.env['IDENTITY_PROVIDER_REPOSITORY'];
    else process.env['IDENTITY_PROVIDER_REPOSITORY'] = previousRepository;
  }
});
