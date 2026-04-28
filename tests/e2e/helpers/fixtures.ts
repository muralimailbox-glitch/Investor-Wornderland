/* eslint-disable react-hooks/rules-of-hooks */
// Playwright fixture callbacks take a `use` parameter that is a regular
// function, not the React `use` hook. The lint rule pattern-matches on the
// name and gives false positives; disable it for this file.
import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';

import { loginFounderApi, loginFounderPage } from './founder';
import { randomEmail } from './utils';

// Prod-DB pollution guard lives in playwright.config.ts — it fires before
// any spec loads, including legacy specs that import @playwright/test
// directly and don't go through this fixture module.

type Fixtures = {
  founderApi: APIRequestContext;
  founderPage: Page;
  makeEmail: (tag?: string) => string;
};

export const test = base.extend<Fixtures>({
  founderApi: async ({ playwright, baseURL }, use) => {
    const api = await playwright.request.newContext(baseURL ? { baseURL } : {});
    await loginFounderApi(api);
    await use(api);
    await api.dispose();
  },

  founderPage: async ({ page }, use) => {
    await loginFounderPage(page);
    await use(page);
  },

  makeEmail: async (_, use) => {
    await use((tag = 'e2e') => randomEmail(tag));
  },
});

export { expect };
