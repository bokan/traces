const { test } = require('@playwright/test');

test('verify timeline segments', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:3847/#/-Users-boris-go-src-github-com-pi-mono/8be6930b-098b-4ab7-bc97-94e5ca0aece8');
  await page.waitForSelector('#root', { timeout: 10000 });
  await page.waitForTimeout(3000);
  
  // Get timeline segments
  const timelineContainer = await page.locator('[class*="flex h-6 gap-px"]').first();
  const segments = await timelineContainer.locator('> div').all();
  
  console.log(`Total segments: ${segments.length}`);
  
  for (let i = 0; i < segments.length; i++) {
    const title = await segments[i].getAttribute('title');
    const style = await segments[i].getAttribute('style');
    console.log(`Segment ${i}: ${title}`);
    console.log(`  Style: ${style}`);
  }
  
  // Screenshot
  await page.screenshot({
    path: 'screenshots/timeline-verify.png',
    fullPage: false,
    scale: 'device'
  });
});
