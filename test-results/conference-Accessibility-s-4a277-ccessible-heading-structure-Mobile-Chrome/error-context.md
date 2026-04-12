# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: conference.spec.ts >> Accessibility >> should have accessible heading structure
- Location: e2e/conference.spec.ts:13:3

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   0
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e5]: 지식을 준비 중입니다...
  - iframe [ref=e7]:
    
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Conference List', () => {
  4  |   test('should display conference list page', async ({ page }) => {
  5  |     await page.goto('/');
  6  |     await expect(page).toHaveTitle(/eBook/);
  7  |     const heading = page.locator('h1, h2').filter({ hasText: /컨퍼런스|학술대회|conference/i });
  8  |     await expect(heading.first()).toBeVisible();
  9  |   });
  10 | });
  11 | 
  12 | test.describe('Accessibility', () => {
  13 |   test('should have accessible heading structure', async ({ page }) => {
  14 |     await page.goto('/');
  15 |     const h1 = page.locator('h1');
  16 |     const count = await h1.count();
> 17 |     expect(count).toBeGreaterThan(0);
     |                   ^ Error: expect(received).toBeGreaterThan(expected)
  18 |   });
  19 | 
  20 |   test('should have focusable elements', async ({ page }) => {
  21 |     await page.goto('/');
  22 |     const buttons = page.locator('button, a, [role="button"]');
  23 |     const count = await buttons.count();
  24 |     expect(count).toBeGreaterThan(0);
  25 |   });
  26 | });
  27 | 
```