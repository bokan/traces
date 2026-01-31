const { test, expect } = require('@playwright/test');

test('design review - full page', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await page.waitForTimeout(1000);

  // Projects list
  await page.screenshot({ path: 'screenshots/review-1-projects.png' });

  // Click traces project
  await page.getByText('traces', { exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'screenshots/review-2-sessions.png' });

  // Click first session with lots of messages (skip active session)
  await page.locator('aside .cursor-pointer').first().click();
  await page.waitForTimeout(1500);

  // Top of conversation - verify sidebars visible
  await page.screenshot({ path: 'screenshots/review-3-conv-top.png' });

  // Verify left sidebar and right sidebar are visible
  const leftSidebar = page.locator('aside').first();
  const rightSidebar = page.locator('aside').last();
  await expect(leftSidebar).toBeVisible();
  await expect(rightSidebar).toBeVisible();

  // Scroll down using the conversation scroll container
  const scrollContainer = page.locator('main > div.overflow-y-auto').first();
  await scrollContainer.evaluate(el => el.scrollTop = 600);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/review-4-conv-mid.png' });

  // Verify sidebars still visible after scroll
  await expect(leftSidebar).toBeVisible();
  await expect(rightSidebar).toBeVisible();

  // Scroll more
  await scrollContainer.evaluate(el => el.scrollTop = 1400);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/review-5-conv-scroll.png' });

  // Verify sidebars still visible
  await expect(leftSidebar).toBeVisible();
  await expect(rightSidebar).toBeVisible();

  // Expand a tool - find by tool name
  const tool = page.locator('.rounded-md.border').filter({ hasText: 'Bash' }).first();
  if (await tool.isVisible()) {
    await tool.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'screenshots/review-6-tool-expanded.png' });
  }

  // Scroll to bottom
  await scrollContainer.evaluate(el => el.scrollTop = el.scrollHeight);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'screenshots/review-7-conv-bottom.png' });

  // Verify sidebars still visible at bottom
  await expect(leftSidebar).toBeVisible();
  await expect(rightSidebar).toBeVisible();
});
