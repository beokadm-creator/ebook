import { test, expect } from '@playwright/test';

test.describe('Conference List', () => {
  test('should display conference list page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/eBook/);
    const heading = page.locator('h1, h2').filter({ hasText: /컨퍼런스|학술대회|conference/i });
    await expect(heading.first()).toBeVisible();
  });
});

test.describe('Accessibility', () => {
  test('should have accessible heading structure', async ({ page }) => {
    await page.goto('/');
    const h1 = page.locator('h1');
    const count = await h1.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should have focusable elements', async ({ page }) => {
    await page.goto('/');
    const buttons = page.locator('button, a, [role="button"]');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
  });
});
