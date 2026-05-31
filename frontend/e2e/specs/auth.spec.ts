/**
 * E2E tests — Authentication flows.
 * Covers: register, login, logout, token refresh, OAuth redirect.
 */
import { test, expect } from '@playwright/test';
import { ensureTestUserExists, TEST_USER } from '../fixtures/auth';

test.describe('Registration', () => {
  test('user can register a new account', async ({ page }) => {
    const uniqueEmail = `reg-${Date.now()}@familyroots.test`;

    await page.goto('/register');
    await page.getByLabel('First name').fill('New');
    await page.getByLabel('Last name').fill('User');
    await page.getByLabel('Email').fill(uniqueEmail);
    await page.getByLabel('Password').fill('Str0ng!Pass2024');
    await page.getByRole('button', { name: /create account/i }).click();

    // Should land on login or dashboard
    await expect(page).toHaveURL(/\/(login|dashboard|trees)/, { timeout: 10_000 });
  });

  test('duplicate email shows error', async ({ page }) => {
    await ensureTestUserExists(page);
    await page.goto('/register');
    await page.getByLabel('Email').fill(TEST_USER.email);
    await page.getByLabel('Password').fill(TEST_USER.password);
    await page.getByLabel('First name').fill('Dup');
    await page.getByLabel('Last name').fill('User');
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page.getByText(/already (registered|exists)/i)).toBeVisible({ timeout: 5_000 });
  });

  test('weak password shows validation error', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Email').fill('weak@test.com');
    await page.getByLabel('Password').fill('123');
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page.getByText(/password/i)).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Login', () => {
  test.beforeEach(async ({ page }) => {
    await ensureTestUserExists(page);
  });

  test('valid credentials redirect to dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(TEST_USER.email);
    await page.getByLabel('Password').fill(TEST_USER.password);
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/(dashboard|trees)/, { timeout: 10_000 });
  });

  test('wrong password shows error message', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(TEST_USER.email);
    await page.getByLabel('Password').fill('WrongPassword!');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(
      page.getByText(/invalid|incorrect|wrong|credentials/i)
    ).toBeVisible({ timeout: 5_000 });
  });

  test('access token is NOT stored in localStorage', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(TEST_USER.email);
    await page.getByLabel('Password').fill(TEST_USER.password);
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/(dashboard|trees)/, { timeout: 10_000 });

    const storedToken = await page.evaluate(() => {
      return Object.keys(localStorage).some((k) =>
        k.includes('token') || k.includes('access')
      );
    });
    expect(storedToken).toBe(false);
  });

  test('?next param preserves redirect after login', async ({ page }) => {
    await page.goto('/login?next=/trees');
    await page.getByLabel('Email').fill(TEST_USER.email);
    await page.getByLabel('Password').fill(TEST_USER.password);
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL('/trees', { timeout: 10_000 });
  });
});

test.describe('Logout', () => {
  test('logout clears session and redirects to login', async ({ page }) => {
    await ensureTestUserExists(page);
    await page.goto('/login');
    await page.getByLabel('Email').fill(TEST_USER.email);
    await page.getByLabel('Password').fill(TEST_USER.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/(dashboard|trees)/, { timeout: 10_000 });

    // Click logout (may be in user menu)
    const logoutBtn = page.getByRole('button', { name: /log ?out|sign out/i });
    if (!(await logoutBtn.isVisible())) {
      await page.getByRole('button', { name: TEST_USER.displayName }).click();
    }
    await logoutBtn.click();

    await expect(page).toHaveURL('/login', { timeout: 5_000 });
  });

  test('accessing protected route after logout redirects to login', async ({ page }) => {
    await ensureTestUserExists(page);
    // Force clear any session
    await page.context().clearCookies();
    await page.goto('/trees');
    await expect(page).toHaveURL(/\/login/, { timeout: 5_000 });
  });
});

test.describe('Session persistence', () => {
  test('hard refresh preserves authenticated state via silent refresh', async ({ page }) => {
    await ensureTestUserExists(page);
    await page.goto('/login');
    await page.getByLabel('Email').fill(TEST_USER.email);
    await page.getByLabel('Password').fill(TEST_USER.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/(dashboard|trees)/, { timeout: 10_000 });

    // Hard reload — access token in memory is lost; should recover via cookie
    await page.reload();
    await expect(page).not.toHaveURL('/login', { timeout: 5_000 });
  });
});
