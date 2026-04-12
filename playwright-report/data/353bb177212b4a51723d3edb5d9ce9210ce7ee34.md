# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: conference.spec.ts >> Accessibility >> should have focusable elements
- Location: e2e/conference.spec.ts:20:3

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   0
```

# Page snapshot

```yaml
- generic [ref=e4]:
  - navigation [ref=e5]:
    - link "EBOOK" [ref=e7] [cursor=pointer]:
      - /url: /
      - img [ref=e9]
      - generic [ref=e11]: EBOOK
  - main [ref=e12]:
    - generic [ref=e13]:
      - generic [ref=e14]: Premium Knowledge Space
      - heading "Academic Knowledge, Perfected." [level=1] [ref=e16]:
        - text: Academic Knowledge,
        - text: Perfected.
      - paragraph [ref=e17]: 최신 학술대회의 모든 발표 자료를 완벽하게 모바일 최적화된 eBook 뷰어로 경험하세요. 최고의 전문가들을 위한 가장 혁신적인 지식 아카이브입니다.
      - generic [ref=e20]:
        - generic:
          - img
        - textbox "학술대회명, 발표자, 키워드 검색..." [ref=e21]
    - generic [ref=e22]:
      - generic [ref=e24]:
        - heading "학술대회 보관함" [level=2] [ref=e25]
        - paragraph [ref=e26]: 총 1개의 학술대회가 등록되어 있습니다.
      - link "대한구강악안면외과학회 2026년 4월 17일 - 2026년 4월 19일 차바이오" [ref=e29] [cursor=pointer]:
        - /url: /conferences/p6KO8H2djjjen26B0Zcf
        - generic [ref=e30]:
          - generic [ref=e31]:
            - img [ref=e34]
            - heading "대한구강악안면외과학회" [level=3] [ref=e36]
            - paragraph
          - generic [ref=e38]:
            - generic [ref=e39]:
              - img [ref=e40]
              - generic [ref=e42]: 2026년 4월 17일 - 2026년 4월 19일
            - generic [ref=e43]:
              - img [ref=e44]
              - generic [ref=e47]: 차바이오
  - contentinfo [ref=e48]:
    - generic [ref=e49]:
      - generic [ref=e50]:
        - generic [ref=e51]:
          - generic [ref=e52]:
            - img [ref=e54]
            - generic [ref=e56]: EBOOK
          - paragraph [ref=e57]: 최신 학술대회의 가치를 디지털로 보존하고 확산합니다. 혁신적인 eBook 솔루션으로 전문가의 지식 경험을 완성합니다.
        - generic [ref=e58]:
          - generic [ref=e59]:
            - heading "Company Info" [level=4] [ref=e60]
            - generic [ref=e61]:
              - paragraph [ref=e62]: 주식회사 홍커뮤니케이션 (HONG COM. CORP)
              - paragraph [ref=e63]: "대표이사: 이혜정"
              - paragraph [ref=e64]: "사업자등록번호: 264-81-48344"
          - generic [ref=e65]:
            - heading "Contact Us" [level=4] [ref=e66]
            - generic [ref=e67]:
              - paragraph [ref=e68]: 서울특별시 송파구 송파대로 167, B동 319호 (문정동, 문정역테라타워)
              - paragraph [ref=e69]: "TEL: 02-6959-3871~3"
              - paragraph [ref=e70]: "FAX: 02-2054-3874"
              - paragraph [ref=e71]: "Email: info@hongcomm.kr"
      - generic [ref=e73]: © 2026 HONG COM. CORP. ALL RIGHTS RESERVED.
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
  17 |     expect(count).toBeGreaterThan(0);
  18 |   });
  19 | 
  20 |   test('should have focusable elements', async ({ page }) => {
  21 |     await page.goto('/');
  22 |     const buttons = page.locator('button, a, [role="button"]');
  23 |     const count = await buttons.count();
> 24 |     expect(count).toBeGreaterThan(0);
     |                   ^ Error: expect(received).toBeGreaterThan(expected)
  25 |   });
  26 | });
  27 | 
```