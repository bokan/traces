const { test } = require('@playwright/test');

test('capture hero screenshot with expanded sidebar', async ({ page }) => {
  // Set retina resolution
  await page.setViewportSize({ width: 1440, height: 900 });
  
  // Navigate to specific session
  await page.goto('http://localhost:3847/#/-Users-boris-go-src-github-com-pi-mono/8be6930b-098b-4ab7-bc97-94e5ca0aece8');
  
  // Wait for the app to load
  await page.waitForSelector('#root', { timeout: 10000 });
  await page.waitForTimeout(3000);
  
  // Expand all sidebar sections by clicking on them
  const sidebarButtons = await page.locator('aside[class*="w-60"] button, aside[class*="w-72"] button').all();
  for (const button of sidebarButtons) {
    const text = await button.textContent();
    // Click to expand if it has ▶ (collapsed)
    if (text && text.includes('▶')) {
      await button.click();
      await page.waitForTimeout(200);
    }
  }
  
  // Wait for expansions to settle
  await page.waitForTimeout(1000);
  
  // Take hero screenshot
  await page.screenshot({
    path: 'screenshots/hero.png',
    fullPage: false,
    scale: 'device',
    type: 'png'
  });
  
  console.log('Hero screenshot saved to screenshots/hero.png');
});
