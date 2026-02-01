const { test, expect } = require('@playwright/test');

test.describe('Design Screenshots', () => {
  test('capture main view at retina resolution', async ({ page }) => {
    // Set retina resolution (2x scale factor)
    await page.setViewportSize({ width: 1440, height: 900 });
    
    // Navigate to the app
    await page.goto('http://localhost:3847');
    
    // Wait for the app to load
    await page.waitForSelector('#root', { timeout: 10000 });
    
    // Wait a bit for React to render
    await page.waitForTimeout(2000);
    
    // Take screenshot at device scale factor 2 (retina)
    await page.screenshot({
      path: 'screenshots/after-retina.png',
      fullPage: false,
      scale: 'device',
      type: 'png'
    });
    
    console.log('Screenshot saved to screenshots/after-retina.png');
  });
  
  test('capture with session loaded', async ({ page }) => {
    // Set retina resolution
    await page.setViewportSize({ width: 1440, height: 900 });
    
    // Navigate to the app
    await page.goto('http://localhost:3847');
    
    // Wait for the app to load
    await page.waitForSelector('#root', { timeout: 10000 });
    await page.waitForTimeout(2000);
    
    // Try to click on first project if available
    const projectItems = await page.locator('aside .group').all();
    if (projectItems.length > 0) {
      await projectItems[0].click();
      await page.waitForTimeout(1000);
      
      // Try to click on first session
      const sessionItems = await page.locator('aside .group').all();
      if (sessionItems.length > 0) {
        await sessionItems[0].click();
        await page.waitForTimeout(2000);
      }
    }
    
    // Take screenshot
    await page.screenshot({
      path: 'screenshots/after-with-session.png',
      fullPage: false,
      scale: 'device',
      type: 'png'
    });
    
    console.log('Screenshot saved to screenshots/after-with-session.png');
  });
});
