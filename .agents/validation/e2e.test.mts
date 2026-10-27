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
