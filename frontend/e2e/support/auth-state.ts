import { resolve } from 'node:path';

export const authenticatedStatePath = resolve(
  __dirname,
  '../test-results/.auth/user.json',
);
