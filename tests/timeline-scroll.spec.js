const { test, expect } = require('@playwright/test');

test.describe('Timeline Scroll', () => {
  test('clicking timeline segments scrolls to correct turns', async ({ page }) => {
    // Set retina resolution
    await page.setViewportSize({ width: 1440, height: 900 });
    
    // Navigate to specific session
    await page.goto('http://localhost:3847/#/-Users-boris-go-src-github-com-pi-mono/8be6930b-098b-4ab7-bc97-94e5ca0aece8');
    
    // Wait for the app to load
    await page.waitForSelector('#root', { timeout: 10000 });
    await page.waitForTimeout(3000);
    
    // Get all timeline segments
    const timelineContainer = await page.locator('[class*="flex h-6 gap-px"]').first();
    const segments = await timelineContainer.locator('> div').all();
    
    console.log(`Found ${segments.length} timeline segments`);
    
    // Test clicking first segment
    if (segments.length > 0) {
      await segments[0].click();
      await page.waitForTimeout(500);
      
      // Check if turn-0 is visible
      const firstTurn = await page.locator('#turn-0').first();
      const isFirstVisible = await firstTurn.isVisible();
      const firstBox = await firstTurn.boundingBox();
      console.log('First turn visible:', isFirstVisible, 'Box:', firstBox);
      
      // Should be near top of viewport
      expect(firstBox.y).toBeLessThan(100);
    }
    
    // Test clicking middle segment
    if (segments.length > 2) {
      const middleIndex = Math.floor(segments.length / 2);
      await segments[middleIndex].click();
      await page.waitForTimeout(500);
      
      // Get the turn index from the title attribute
      const title = await segments[middleIndex].getAttribute('title');
      console.log('Middle segment title:', title);
    }
    
    // Test clicking last segment
    if (segments.length > 1) {
      const lastIndex = segments.length - 1;
      await segments[lastIndex].click();
      await page.waitForTimeout(500);
      
      // Count total visible turns
      const allTurns = await page.locator('[id^="turn-"]').all();
      console.log(`Total visible turns: ${allTurns.length}`);
      
      // Get last turn
      const lastTurn = allTurns[allTurns.length - 1];
      const lastBox = await lastTurn.boundingBox();
      console.log('Last turn box:', lastBox);
      
      // Last turn should be visible
      expect(lastBox).not.toBeNull();
    }
  });
  
  test('all timeline segments have valid turn indices', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:3847/#/-Users-boris-go-src-github-com-pi-mono/8be6930b-098b-4ab7-bc97-94e5ca0aece8');
    await page.waitForSelector('#root', { timeout: 10000 });
    await page.waitForTimeout(3000);
    
    // Get all visible turn elements
    const turns = await page.locator('[id^="turn-"]').all();
    const maxTurnIndex = turns.length - 1;
    console.log(`Visible turns: 0 to ${maxTurnIndex}`);
    
    // Get all timeline segments
    const timelineContainer = await page.locator('[class*="flex h-6 gap-px"]').first();
    const segments = await timelineContainer.locator('> div').all();
    
    // Check each segment's turn index
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      await segment.click();
      await page.waitForTimeout(300);
      
      // Check if any turn is in viewport
      let foundVisible = false;
      for (let turnIdx = 0; turnIdx <= maxTurnIndex; turnIdx++) {
        const turn = await page.locator(`#turn-${turnIdx}`).first();
        if (await turn.isVisible()) {
          const box = await turn.boundingBox();
          if (box && box.y >= 0 && box.y < 800) {
            foundVisible = true;
            console.log(`Segment ${i} scrolled to turn-${turnIdx} at y=${box.y}`);
            break;
          }
        }
      }
      
      expect(foundVisible, `Segment ${i} should scroll to a visible turn`).toBe(true);
    }
  });
});
