# End-to-end tests

Run the relevant isolated E2E tests for changes to browser flows, frontend/backend integration, or deployment behavior. Prepare the [repository prerequisites](general.md#prerequisites) and [frontend dependencies and Chromium](frontend-testing.md#frontend-checks).

Check out [identity-provider](https://github.com/roithme0/identity-provider) beside this repository at the revision in [identity-provider.ref](../../deployment/tests/identity-provider.ref). Its configuration and apply script must have no local changes. Set `IDENTITY_PROVIDER_REPOSITORY` to use another checkout path. CI checks out the pinned revision automatically; update the pin deliberately when adopting provider changes.

Keep Docker running and loopback ports `9002` (Kochwiki) and `8026` (Keycloak) free. From the **repository root**:

```sh
node .agents/validation/test.mts --group e2e -- --grep 'example flow'
```

Use `node .agents/validation/e2e.mts` for the full E2E suite. Both commands rebuild and recreate the isolated `kochwiki-e2e` stack using [the E2E Compose configuration](../../deployment/tests/docker-compose-e2e.yml). The runner applies the provider's original realm, profile, client and mapper configuration through its original apply script, then creates a [disposable test account](../../deployment/tests/e2e-user.json). Callback URLs and credentials are specific to the test instance. Its database, storage, and identity data are temporary and reset on each run. The development environment is separate. The stack stays running for inspection.

Every E2E test runs in two Chromium projects: `desktop-chromium` uses Desktop Chrome settings, and `mobile-chromium` uses Pixel 7 settings. To rerun only the browser tests against the prepared stack, run `npm run test:e2e:browser` from **frontend/**. Select one project with `npm run test:e2e:browser -- --project=mobile-chromium` (or `desktop-chromium`). See [the browser tests](../../frontend/e2e/) for the login and navigation flows and [the Playwright configuration](../../frontend/playwright.config.ts) for browser settings.

Each isolated run prints its retained artifact directory under `.codex-validation/e2e/`, containing logs, `html-report/`, and failure traces/screenshots in `test-results/`. From **frontend/**, open a report with `npx playwright show-report <artifact-directory>/html-report`.

Direct browser runs use `frontend/e2e/test-results/` and `frontend/playwright-report/`. The [CI workflow](../../.github/workflows/publish-app.yml) tests built application images before publishing them and uploads diagnostics on failure.
