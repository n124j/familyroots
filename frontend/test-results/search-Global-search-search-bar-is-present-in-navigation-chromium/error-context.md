# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: search.spec.ts >> Global search >> search bar is present in navigation
- Location: e2e\specs\search.spec.ts:7:7

# Error details

```
Error: Unexpected registration response: 404
```

# Test source

```ts
  1  | /**
  2  |  * Playwright auth fixture — registers and logs in a test user,
  3  |  * stores auth state so it can be reused across test files.
  4  |  */
  5  | import { test as base, expect, type Page } from '@playwright/test';
  6  | 
  7  | export interface AuthFixtures {
  8  |   authenticatedPage: Page;
  9  |   testUser: { email: string; password: string; displayName: string };
  10 | }
  11 | 
  12 | export const TEST_USER = {
  13 |   email:       'e2e-test@familyroots.test',
  14 |   password:    'E2eStr0ng!Pass2024',
  15 |   givenName:   'E2E',
  16 |   surname:     'Tester',
  17 |   displayName: 'E2E Tester',
  18 | };
  19 | 
  20 | /**
  21 |  * Log in via the UI and return the page in an authenticated state.
  22 |  * Caches auth in localStorage so subsequent tests skip the login step.
  23 |  */
  24 | export async function loginViaUI(page: Page): Promise<void> {
  25 |   await page.goto('/login');
  26 |   await page.getByLabel('Email').fill(TEST_USER.email);
  27 |   await page.getByLabel('Password').fill(TEST_USER.password);
  28 |   await page.getByRole('button', { name: /sign in/i }).click();
  29 |   await expect(page).toHaveURL(/\/(dashboard|trees)/, { timeout: 10_000 });
  30 | }
  31 | 
  32 | /**
  33 |  * Register the test user if not already registered.
  34 |  * Safe to call multiple times — ignores 409 Conflict.
  35 |  */
  36 | export async function ensureTestUserExists(page: Page): Promise<void> {
  37 |   const res = await page.request.post('/api/v1/auth/register', {
  38 |     data: {
  39 |       email:       TEST_USER.email,
  40 |       password:    TEST_USER.password,
  41 |       given_name:  TEST_USER.givenName,
  42 |       surname:     TEST_USER.surname,
  43 |     },
  44 |   });
  45 |   // 201 = created, 409 = already exists — both OK
  46 |   if (res.status() !== 201 && res.status() !== 409) {
> 47 |     throw new Error(`Unexpected registration response: ${res.status()}`);
     |           ^ Error: Unexpected registration response: 404
  48 |   }
  49 | }
  50 | 
  51 | export const test = base.extend<AuthFixtures>({
  52 |   testUser: async ({}, use) => {
  53 |     await use(TEST_USER);
  54 |   },
  55 | 
  56 |   authenticatedPage: async ({ page }, use) => {
  57 |     await ensureTestUserExists(page);
  58 |     await loginViaUI(page);
  59 |     await use(page);
  60 |   },
  61 | });
  62 | 
  63 | export { expect };
  64 | 
```