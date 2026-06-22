# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> Registration >> user can register a new account
- Location: e2e\specs\auth.spec.ts:9:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByLabel('First name')

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - generic [ref=e5]:
    - generic [ref=e6]: 🌳
    - heading "FamilyRoots" [level=1] [ref=e7]
    - paragraph [ref=e8]: Create your free account
  - generic [ref=e9]:
    - button "Continue with Google" [ref=e11] [cursor=pointer]:
      - img [ref=e12]
      - text: Continue with Google
    - generic [ref=e19]: or sign up with email
    - generic [ref=e21]:
      - generic [ref=e22]:
        - generic [ref=e23]:
          - generic [ref=e24]: First name
          - textbox "Alice" [ref=e25]
        - generic [ref=e26]:
          - generic [ref=e27]: Last name
          - textbox "Smith" [ref=e28]
      - generic [ref=e29]:
        - generic [ref=e30]: Email
        - textbox "alice@example.com" [ref=e31]
      - generic [ref=e32]:
        - generic [ref=e33]: Password
        - textbox "8+ chars, uppercase & digit" [ref=e34]
      - generic [ref=e35]:
        - generic [ref=e36]: Confirm password
        - textbox "Re-enter password" [ref=e37]
      - button "Create account" [ref=e38] [cursor=pointer]
  - paragraph [ref=e39]:
    - text: Already have an account?
    - link "Sign in" [ref=e40] [cursor=pointer]:
      - /url: /login
```

# Test source

```ts
  1   | /**
  2   |  * E2E tests — Authentication flows.
  3   |  * Covers: register, login, logout, token refresh, OAuth redirect.
  4   |  */
  5   | import { test, expect } from '@playwright/test';
  6   | import { ensureTestUserExists, TEST_USER } from '../fixtures/auth';
  7   | 
  8   | test.describe('Registration', () => {
  9   |   test('user can register a new account', async ({ page }) => {
  10  |     const uniqueEmail = `reg-${Date.now()}@familyroots.test`;
  11  | 
  12  |     await page.goto('/register');
> 13  |     await page.getByLabel('First name').fill('New');
      |                                         ^ Error: locator.fill: Test timeout of 30000ms exceeded.
  14  |     await page.getByLabel('Last name').fill('User');
  15  |     await page.getByLabel('Email').fill(uniqueEmail);
  16  |     await page.getByLabel('Password').fill('Str0ng!Pass2024');
  17  |     await page.getByRole('button', { name: /create account/i }).click();
  18  | 
  19  |     // Registration sends verification email — should redirect to login with registered flag
  20  |     await expect(page).toHaveURL(/\/login\?registered=1/, { timeout: 10_000 });
  21  |   });
  22  | 
  23  |   test('duplicate email shows error', async ({ page }) => {
  24  |     await ensureTestUserExists(page);
  25  |     await page.goto('/register');
  26  |     await page.getByLabel('Email').fill(TEST_USER.email);
  27  |     await page.getByLabel('Password').fill(TEST_USER.password);
  28  |     await page.getByLabel('First name').fill('Dup');
  29  |     await page.getByLabel('Last name').fill('User');
  30  |     await page.getByRole('button', { name: /create account/i }).click();
  31  | 
  32  |     await expect(page.getByText(/already (registered|exists)/i)).toBeVisible({ timeout: 5_000 });
  33  |   });
  34  | 
  35  |   test('weak password shows validation error', async ({ page }) => {
  36  |     await page.goto('/register');
  37  |     await page.getByLabel('Email').fill('weak@test.com');
  38  |     await page.getByLabel('Password').fill('123');
  39  |     await page.getByRole('button', { name: /create account/i }).click();
  40  | 
  41  |     await expect(page.getByText(/password/i)).toBeVisible({ timeout: 5_000 });
  42  |   });
  43  | 
  44  |   test('registration form has no Organisation ID field', async ({ page }) => {
  45  |     await page.goto('/register');
  46  |     // tenant_slug / Organisation ID field must not exist on the form
  47  |     await expect(page.getByLabel(/organisation id|org id|tenant/i)).not.toBeVisible();
  48  |   });
  49  | 
  50  |   test('after registration hard-refresh does not grant dashboard access', async ({ page }) => {
  51  |     const uniqueEmail = `unverified-${Date.now()}@familyroots.test`;
  52  | 
  53  |     await page.goto('/register');
  54  |     await page.getByLabel('First name').fill('Unverified');
  55  |     await page.getByLabel('Last name').fill('User');
  56  |     await page.getByLabel('Email').fill(uniqueEmail);
  57  |     await page.getByLabel('Password').fill('Str0ng!Pass2024');
  58  |     await page.getByRole('button', { name: /create account/i }).click();
  59  | 
  60  |     // Wait for redirect to login
  61  |     await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  62  | 
  63  |     // Hard-navigate to a protected route — must not be granted access without verification
  64  |     await page.goto('/trees');
  65  |     await expect(page).toHaveURL(/\/login/, { timeout: 5_000 });
  66  |   });
  67  | });
  68  | 
  69  | test.describe('Login', () => {
  70  |   test.beforeEach(async ({ page }) => {
  71  |     await ensureTestUserExists(page);
  72  |   });
  73  | 
  74  |   test('valid credentials redirect to dashboard', async ({ page }) => {
  75  |     await page.goto('/login');
  76  |     await page.getByLabel('Email').fill(TEST_USER.email);
  77  |     await page.getByLabel('Password').fill(TEST_USER.password);
  78  |     await page.getByRole('button', { name: /sign in/i }).click();
  79  | 
  80  |     await expect(page).toHaveURL(/\/(dashboard|trees)/, { timeout: 10_000 });
  81  |   });
  82  | 
  83  |   test('wrong password shows error message', async ({ page }) => {
  84  |     await page.goto('/login');
  85  |     await page.getByLabel('Email').fill(TEST_USER.email);
  86  |     await page.getByLabel('Password').fill('WrongPassword!');
  87  |     await page.getByRole('button', { name: /sign in/i }).click();
  88  | 
  89  |     await expect(
  90  |       page.getByText(/invalid|incorrect|wrong|credentials/i)
  91  |     ).toBeVisible({ timeout: 5_000 });
  92  |   });
  93  | 
  94  |   test('access token is NOT stored in localStorage', async ({ page }) => {
  95  |     await page.goto('/login');
  96  |     await page.getByLabel('Email').fill(TEST_USER.email);
  97  |     await page.getByLabel('Password').fill(TEST_USER.password);
  98  |     await page.getByRole('button', { name: /sign in/i }).click();
  99  | 
  100 |     await expect(page).toHaveURL(/\/(dashboard|trees)/, { timeout: 10_000 });
  101 | 
  102 |     const storedToken = await page.evaluate(() => {
  103 |       return Object.keys(localStorage).some((k) =>
  104 |         k.includes('token') || k.includes('access')
  105 |       );
  106 |     });
  107 |     expect(storedToken).toBe(false);
  108 |   });
  109 | 
  110 |   test('?next param preserves redirect after login', async ({ page }) => {
  111 |     await page.goto('/login?next=/trees');
  112 |     await page.getByLabel('Email').fill(TEST_USER.email);
  113 |     await page.getByLabel('Password').fill(TEST_USER.password);
```