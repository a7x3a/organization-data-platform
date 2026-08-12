# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: screenshot.spec.ts >> capture select-dropdown fix and seeded sources
- Location: e2e\screenshot.spec.ts:3:1

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByRole('option')
Expected: 3
Received: 4
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" with timeout 5000ms
  - waiting for getByRole('option')
    14 × locator resolved to 4 elements
       - unexpected value "4"

```

# Page snapshot

```yaml
- generic:
  - generic:
    - generic:
      - complementary:
        - generic:
          - generic:
            - generic:
              - generic: ODP Platform
              - generic: 00_RAW Collector
          - navigation:
            - link:
              - /url: /dashboard
              - generic: Dashboard
            - link:
              - /url: /sources
              - generic: Sources
            - link:
              - /url: /collectors
              - generic: Collectors
            - link:
              - /url: /runs
              - generic: Runs
            - link:
              - /url: /files
              - generic: Files
            - link:
              - /url: /upload
              - generic: Upload
            - link:
              - /url: /users
              - generic: Users
            - link:
              - /url: /settings
              - generic: Settings
        - generic:
          - generic:
            - generic:
              - generic: Admin
              - generic: ADMIN
            - button
      - generic:
        - banner:
          - generic: "Cluster: local-dev | Zone: 00_raw/web"
        - main:
          - generic:
            - generic:
              - heading [level=1]: Manual Collection
              - paragraph: Add a document by hand — upload a file directly, or catalog its metadata now and attach the file later. Goes through the same hashing and duplicate check as scraped files.
            - generic:
              - button: Upload File
              - button: Catalog Only
            - generic:
              - generic:
                - generic: Source
                - combobox [expanded]:
                  - generic: Select a source...
                - combobox
              - generic:
                - generic: File
                - button
              - generic:
                - paragraph: Optional metadata — only what you know, never guessed
                - generic:
                  - generic:
                    - textbox:
                      - /placeholder: Language (ckb)
                  - generic:
                    - textbox:
                      - /placeholder: Subject
                  - generic:
                    - textbox:
                      - /placeholder: Grade
              - generic:
                - button: Upload
  - listbox [ref=f2e1]:
    - option "Public Library Digital Collection" [active] [ref=f2e2] [cursor=pointer]
    - option "Ministry of Education Archive" [ref=f2e4] [cursor=pointer]
    - option "Kurdistan Open Data" [ref=f2e6] [cursor=pointer]
    - option "E2E Source 1786543616442" [ref=f2e8] [cursor=pointer]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test('capture select-dropdown fix and seeded sources', async ({ page }) => {
  4  |   await page.goto('/login');
  5  |   await page.getByPlaceholder('username').fill('a7x3a');
  6  |   await page.getByPlaceholder('••••••••').fill('ahmad@123');
  7  |   await page.click('button[type="submit"]');
  8  |   await page.waitForURL('**/dashboard');
  9  | 
  10 |   await page.goto('/sources');
  11 |   await page.waitForTimeout(400);
  12 |   await page.screenshot({ path: 'C:/Users/A/AppData/Local/Temp/claude/c--Users-A-Desktop-organization-data-platform/44e3f2b7-1a49-4b08-88d1-0899a38c2df4/scratchpad/sources-seeded.png', fullPage: true });
  13 | 
  14 |   await page.goto('/upload');
  15 |   await page.waitForTimeout(400);
  16 |   await page.click('button[role="combobox"]');
  17 |   await page.waitForTimeout(300);
  18 |   await page.screenshot({ path: 'C:/Users/A/AppData/Local/Temp/claude/c--Users-A-Desktop-organization-data-platform/44e3f2b7-1a49-4b08-88d1-0899a38c2df4/scratchpad/select-open.png', fullPage: true });
  19 | 
  20 |   const options = page.getByRole('option');
> 21 |   await expect(options).toHaveCount(3);
     |                         ^ Error: expect(locator).toHaveCount(expected) failed
  22 |   await options.first().click();
  23 |   await page.waitForTimeout(200);
  24 |   await page.screenshot({ path: 'C:/Users/A/AppData/Local/Temp/claude/c--Users-A-Desktop-organization-data-platform/44e3f2b7-1a49-4b08-88d1-0899a38c2df4/scratchpad/select-chosen.png', fullPage: true });
  25 | });
  26 | 
```