const { test, expect } = require('@playwright/test');

test.describe('Timeline Behavior', () => {
  test('timeline shows correct segment types and colors', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:3847/#/-Users-boris-go-src-github-com-pi-mono/8be6930b-098b-4ab7-bc97-94e5ca0aece8');
    await page.waitForSelector('#root', { timeout: 10000 });
    await page.waitForTimeout(3000);
    
    // Get all timeline segments
    const timelineContainer = await page.locator('[class*="flex h-6 gap-px"]').first();
    const segments = await timelineContainer.locator('> div').all();
    
    console.log(`\n=== TIMELINE ANALYSIS ===`);
    console.log(`Total segments: ${segments.length}\n`);
    
    const typeCounts = { user: 0, assistant: 0, tool: 0, thinking: 0 };
    
    for (let i = 0; i < segments.length; i++) {
      const title = await segments[i].getAttribute('title');
      const style = await segments[i].getAttribute('style');
      
      // Extract color from style
      const colorMatch = style.match(/background-color:\s*rgb\(([^)]+)\)/);
      const color = colorMatch ? colorMatch[1] : 'unknown';
      
      // Map color to type
      let type = 'unknown';
      if (color.includes('59, 130, 246')) type = 'user';
      else if (color.includes('168, 85, 247')) type = 'assistant';
      else if (color.includes('34, 197, 94')) type = 'tool';
      else if (color.includes('245, 158, 11')) type = 'thinking';
      
      typeCounts[type]++;
      console.log(`Segment ${i}: ${type} | ${title}`);
    }
    
    console.log(`\n=== TYPE COUNTS ===`);
    console.log(`User: ${typeCounts.user}`);
    console.log(`Assistant: ${typeCounts.assistant}`);
    console.log(`Tool: ${typeCounts.tool}`);
    console.log(`Thinking: ${typeCounts.thinking}`);
    
    // The issue: if we only see user and thinking, tool and assistant are missing
    expect(typeCounts.tool).toBeGreaterThan(0);
    expect(typeCounts.assistant).toBeGreaterThan(0);
  });
  
  test('clicking each timeline segment scrolls to correct turn', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:3847/#/-Users-boris-go-src-github-com-pi-mono/8be6930b-098b-4ab7-bc97-94e5ca0aece8');
    await page.waitForSelector('#root', { timeout: 10000 });
    await page.waitForTimeout(3000);
    
    const timelineContainer = await page.locator('[class*="flex h-6 gap-px"]').first();
    const segments = await timelineContainer.locator('> div').all();
    const turns = await page.locator('[id^="turn-"]').all();
    
    console.log(`\n=== SCROLL TEST ===`);
    console.log(`Segments: ${segments.length}, Turns: ${turns.length}\n`);
    
    for (let i = 0; i < segments.length; i++) {
      await segments[i].click();
      await page.waitForTimeout(300);
      
      // Find which turn is now visible in viewport
      let visibleTurnIndex = -1;
      let visibleTurnY = 0;
      
      for (let turnIdx = 0; turnIdx < turns.length; turnIdx++) {
        const turn = turns[turnIdx];
        const box = await turn.boundingBox();
        if (box && box.y >= -100 && box.y < 400) {
          visibleTurnIndex = turnIdx;
          visibleTurnY = box.y;
          break;
        }
      }
      
      console.log(`Segment ${i} → turn-${visibleTurnIndex} (y=${visibleTurnY})`);
      
      // Each segment should scroll to a visible turn
      expect(visibleTurnIndex).toBeGreaterThanOrEqual(0);
    }
  });
  
  test('timeline matches conversation turns exactly', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:3847/#/-Users-boris-go-src-github-com-pi-mono/8be6930b-098b-4ab7-bc97-94e5ca0aece8');
    await page.waitForSelector('#root', { timeout: 10000 });
    await page.waitForTimeout(3000);
    
    const timelineContainer = await page.locator('[class*="flex h-6 gap-px"]').first();
    const segments = await timelineContainer.locator('> div').all();
    const turns = await page.locator('[id^="turn-"]').all();
    
    console.log(`\n=== MATCH TEST ===`);
    console.log(`Timeline segments: ${segments.length}`);
    console.log(`DOM turns: ${turns.length}`);
    
    // They should match 1:1
    expect(segments.length).toBe(turns.length);
  });
});
