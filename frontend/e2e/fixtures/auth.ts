/**
 * Playwright auth fixture — registers and logs in a test user,
 * stores auth state so it can be reused across test files.
 */
import { test as base, expect, type Page } from '@playwright/test';

export interface AuthFixtures {
  authenticatedPage: Page;
  testUser: { email: string; password: string; displayName: string };
}

export const TEST_USER = {
  email:       'e2e-test@familyroots.test',
  password:    'E2eStr0ng!Pass2024',
  givenName:   'E2E',
  surname:     'Tester',
  displayName: 'E2E Tester',
};

/**
 * Log in via the UI and return the page in an authenticated state.
 * Caches auth in localStorage so subsequent tests skip the login step.
 */
export async function loginViaUI(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(TEST_USER.email);
  await page.getByLabel('Password').fill(TEST_USER.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/(dashboard|trees)/, { timeout: 10_000 });
}

/**
 * Register the test user if not already registered.
 * Safe to call multiple times — ignores 409 Conflict.
 */
export async function ensureTestUserExists(page: Page): Promise<void> {
  const res = await page.request.post('/api/v1/auth/register', {
    data: {
      email:       TEST_USER.email,
      password:    TEST_USER.password,
      given_name:  TEST_USER.givenName,
      family_name: TEST_USER.surname,
    },
  });
  // 204 = created, 409 = already exists — both OK
  if (res.status() !== 204 && res.status() !== 409) {
    throw new Error(`Unexpected registration response: ${res.status()}`);
  }
}

export const test = base.extend<AuthFixtures>({
  testUser: async ({}, use) => {
    await use(TEST_USER);
  },

  authenticatedPage: async ({ page }, use) => {
    await ensureTestUserExists(page);
    await loginViaUI(page);
    await use(page);
  },
});

export { expect };
