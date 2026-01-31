const { test, expect } = require('@playwright/test');

test.describe('Traces App', () => {
  test('should load and display projects list', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('text=PROJECTS', { timeout: 10000 });

    // Should have projects in sidebar
    await expect(page.getByText('traces', { exact: true })).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'screenshots/01-projects-list.png', fullPage: true });
  });

  test('should show sessions when clicking a project', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    // Click first project
    await page.getByText('traces', { exact: true }).first().click();

    // Sessions should appear
    await expect(page.locator('text=SESSIONS')).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'screenshots/02-sessions-list.png', fullPage: true });
  });

  test('should display conversation when clicking a session', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(800);
    await page.getByText('traces', { exact: true }).first().click();
    await page.waitForSelector('text=SESSIONS');

    // Click first session
    await page.locator('aside .cursor-pointer').nth(1).click();

    // Should show messages
    await expect(page.locator('.message').first()).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'screenshots/03-conversation.png', fullPage: true });
  });

  test('should expand/collapse tool calls', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(800);
    await page.getByText('traces', { exact: true }).first().click();
    await page.waitForSelector('text=SESSIONS');
    await page.locator('aside .cursor-pointer').nth(1).click();
    await page.waitForSelector('.message', { timeout: 10000 });

    // Find and expand a tool block (ToolBlock uses bg-surface-1/80 rounded-md)
    const toolBlock = page.locator('[class*="bg-surface-1"][class*="rounded"]').first();
    if (await toolBlock.isVisible()) {
      await toolBlock.click();
      await page.waitForTimeout(400);
      // Check that the expanded content is visible (Result section)
      await expect(page.locator('text=/RESULT/i').first()).toBeVisible();
      await page.screenshot({ path: 'screenshots/04-tool-expanded.png', fullPage: true });
    }
  });

  test('should navigate back to projects', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(800);
    await page.getByText('traces', { exact: true }).first().click();
    await expect(page.locator('text=SESSIONS')).toBeVisible();

    // Click back
    await page.locator('text=← Back').click();

    // Projects should be visible again
    await expect(page.locator('text=PROJECTS')).toBeVisible();
  });

  test('should update breadcrumb on navigation', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(800);

    // Select project
    await page.getByText('traces', { exact: true }).first().click();
    await page.waitForSelector('text=SESSIONS');

    // Select session
    await page.locator('aside .cursor-pointer').nth(1).click();
    await page.waitForSelector('.message', { timeout: 10000 });

    // Breadcrumb should show path
    const breadcrumb = page.locator('header .font-mono');
    await expect(breadcrumb).not.toHaveText('');

    await page.screenshot({ path: 'screenshots/06-breadcrumb.png', fullPage: true });
  });
});
