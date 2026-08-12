import { test, expect } from '@playwright/test';

test('capture select-dropdown fix and seeded sources', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('username').fill('a7x3a');
  await page.getByPlaceholder('••••••••').fill('ahmad@123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard');

  await page.goto('/sources');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'C:/Users/A/AppData/Local/Temp/claude/c--Users-A-Desktop-organization-data-platform/44e3f2b7-1a49-4b08-88d1-0899a38c2df4/scratchpad/sources-seeded.png', fullPage: true });

  await page.goto('/upload');
  await page.waitForTimeout(400);
  await page.click('button[role="combobox"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'C:/Users/A/AppData/Local/Temp/claude/c--Users-A-Desktop-organization-data-platform/44e3f2b7-1a49-4b08-88d1-0899a38c2df4/scratchpad/select-open.png', fullPage: true });

  const options = page.getByRole('option');
  await expect(options).toHaveCount(3);
  await options.first().click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'C:/Users/A/AppData/Local/Temp/claude/c--Users-A-Desktop-organization-data-platform/44e3f2b7-1a49-4b08-88d1-0899a38c2df4/scratchpad/select-chosen.png', fullPage: true });
});
