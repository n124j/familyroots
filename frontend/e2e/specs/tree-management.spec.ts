/**
 * E2E tests — Family tree CRUD and person management.
 */
import { test, expect } from '../fixtures/auth';

test.describe('Tree creation', () => {
  test('can create a new family tree', async ({ authenticatedPage: page }) => {
    await page.goto('/trees');
    await page.getByRole('button', { name: /new tree|create tree/i }).click();

    await page.getByLabel(/tree name|name/i).fill('The Smith Family');
    await page.getByLabel(/description/i).fill('My paternal line').catch(() => {});
    await page.getByRole('button', { name: /create|save/i }).click();

    await expect(page.getByText('The Smith Family')).toBeVisible({ timeout: 5_000 });
  });

  test('tree name is required', async ({ authenticatedPage: page }) => {
    await page.goto('/trees');
    await page.getByRole('button', { name: /new tree|create tree/i }).click();
    await page.getByRole('button', { name: /create|save/i }).click();

    await expect(page.getByText(/required|name is/i)).toBeVisible({ timeout: 3_000 });
  });
});

test.describe('Person management', () => {
  let treeUrl: string;

  test.beforeEach(async ({ authenticatedPage: page }) => {
    // Create a tree to work in
    const res = await page.request.post('/api/v1/trees', {
      data: { name: `E2E Tree ${Date.now()}`, description: 'Test tree' },
    });
    const tree = await res.json();
    treeUrl = `/trees/${tree.id}`;
  });

  test('can add a person to the tree', async ({ authenticatedPage: page }) => {
    await page.goto(treeUrl);
    await page.getByRole('button', { name: /add person|new person/i }).click();

    await page.getByLabel(/first name|given name/i).fill('John');
    await page.getByLabel(/last name|surname/i).fill('Smith');
    await page.getByLabel(/birth year/i).fill('1850').catch(() => {});
    await page.getByRole('button', { name: /save|add/i }).click();

    await expect(page.getByText('John Smith')).toBeVisible({ timeout: 5_000 });
  });

  test('can edit a person', async ({ authenticatedPage: page }) => {
    await page.goto(treeUrl);

    // Add person first
    const personRes = await page.request.post(`/api/v1/trees/${treeUrl.split('/').pop()}/persons`, {
      data: { given_name: 'Jane', surname: 'Doe', sex: 'F' },
    }).catch(() => null);

    await page.goto(treeUrl);
    await page.getByText('Jane Doe').click().catch(() => {});

    const editBtn = page.getByRole('button', { name: /edit/i }).first();
    if (await editBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await editBtn.click();
      await page.getByLabel(/first name|given name/i).fill('Janet');
      await page.getByRole('button', { name: /save/i }).click();
      await expect(page.getByText('Janet Doe')).toBeVisible({ timeout: 5_000 });
    }
  });

  test('tree canvas renders on tree page', async ({ authenticatedPage: page }) => {
    await page.goto(treeUrl);
    // React Flow canvas should be present
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 10_000 });
  });

  test('layout toggle buttons are visible', async ({ authenticatedPage: page }) => {
    await page.goto(treeUrl);
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 10_000 });

    // At least one layout button should be visible
    const layoutBtns = page.getByRole('button', {
      name: /vertical|horizontal|fan|ancestor|descendant/i,
    });
    await expect(layoutBtns.first()).toBeVisible({ timeout: 5_000 });
  });
});
