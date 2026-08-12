import { test, expect } from '@playwright/test';

const API_URL = process.env.E2E_API_URL || 'http://localhost:4000';
const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME || 'a7x3a';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'ahmad@123';

async function apiLogin(request: import('@playwright/test').APIRequestContext) {
  const res = await request.post(`${API_URL}/api/auth/login`, {
    data: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.accessToken as string;
}

test.describe('login and core navigation', () => {
  test('logs in and lands on a dashboard with real translated text, not raw i18n keys', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/login');
    await page.getByPlaceholder('username').fill(ADMIN_USERNAME);
    await page.getByPlaceholder('••••••••').fill(ADMIN_PASSWORD);
    await page.locator('button[type="submit"]').click();

    await page.waitForURL('**/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // A broken i18n resource shows raw keys like "dashboard.title" instead
    // of real text — assert that never happens again.
    await expect(page.getByText(/dashboard\.title|nav\.dashboard/)).toHaveCount(0);

    expect(errors).toEqual([]);
  });

  test('sidebar nav reaches every main section with no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/login');
    await page.getByPlaceholder('username').fill(ADMIN_USERNAME);
    await page.getByPlaceholder('••••••••').fill(ADMIN_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/dashboard');

    for (const path of ['/sources', '/collectors', '/runs', '/files', '/upload', '/users', '/settings']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
    }

    expect(errors).toEqual([]);
  });

  test('rejects an invalid password with a clear error, not a crash', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('username').fill(ADMIN_USERNAME);
    await page.getByPlaceholder('••••••••').fill('definitely-wrong-password');
    await page.locator('button[type="submit"]').click();

    // The API's own error message ("Invalid credentials") is shown directly;
    // the generic i18n fallback text only applies when the API gives no
    // structured error at all (see Login.tsx's catch block).
    await expect(page.getByText(/invalid credentials/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('source -> collector -> manual upload, end to end through the real UI', () => {
  const runId = Date.now();
  const sourceName = `E2E Source ${runId}`;
  let sourceIdToCleanUp: string | null = null;

  test.afterAll(async ({ request }) => {
    if (!sourceIdToCleanUp) return;
    const token = await apiLogin(request);
    // Expect a 409 here, not a bug: 00_raw is deliberately immutable, so
    // there is no API path that deletes a collected file, which means a
    // source that has one can never be deleted either. Each E2E run that
    // reaches the upload test leaves one source behind by design — fine for
    // a dev-only suite, not something this cleanup step can (or should) undo.
    await request.delete(`${API_URL}/api/sources/${sourceIdToCleanUp}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  });

  test('creates a source through the UI', async ({ page, request }) => {
    await page.goto('/login');
    await page.getByPlaceholder('username').fill(ADMIN_USERNAME);
    await page.getByPlaceholder('••••••••').fill(ADMIN_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/dashboard');

    await page.goto('/sources');
    await page.getByText('Create Source').click();
    await page.locator('input[placeholder*="Kurdish"]').fill(sourceName);
    await page.locator('input[type="url"]').fill('https://example.org');
    await page.locator('button[type="submit"]').click();

    await expect(page.getByText(sourceName)).toBeVisible();

    const token = await apiLogin(request);
    const res = await request.get(`${API_URL}/api/sources?pageSize=100`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    const created = body.data.find((s: { name: string }) => s.name === sourceName);
    expect(created).toBeTruthy();
    sourceIdToCleanUp = created.id;
  });

  test('manually uploads a file against that source and sees it on the Files page', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByPlaceholder('username').fill(ADMIN_USERNAME);
    await page.getByPlaceholder('••••••••').fill(ADMIN_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/dashboard');

    await page.goto('/upload');
    await page.locator('select').selectOption({ label: sourceName });

    const fileName = `e2e-${runId}.txt`;
    await page.locator('input[type="file"]').setInputFiles({
      name: fileName,
      mimeType: 'text/plain',
      buffer: Buffer.from(`E2E upload test content ${runId}`),
    });
    await page.locator('button[type="submit"]').click();

    await expect(page.getByText(/uploaded as raw-/i)).toBeVisible();

    await page.goto('/files');
    await expect(page.getByText(fileName)).toBeVisible();
  });
});
