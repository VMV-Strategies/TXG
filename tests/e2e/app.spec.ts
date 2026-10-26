import { test, expect, type Page } from 'playwright/test';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const fixture = (f: string) => path.resolve('tests/fixtures', f);

async function open(page: Page, route = 'overview') {
  await page.goto(`./#/${route}`);
  await expect(page.locator('main')).toBeVisible();
}

async function noHorizontalOverflow(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(1);
}

const ROUTES = ['overview', 'entities', 'deal-lab', 'what-if', 'money-flow', 'follow-the-dollar', 'tax', 'events', 'revenue', 'compare', 'recommendations', 'fiba', 'operations', 'foundation', 'documents', 'reports', 'settings'];

test('every module renders without console errors and fits the viewport', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  for (const r of ROUTES) {
    await open(page, r);
    await expect(page.locator('h1').first()).toBeVisible();
    await noHorizontalOverflow(page);
  }
  expect(errors).toEqual([]);
});

test('explain sheet opens for a metric and closes', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /^Explain / }).first().click();
  await expect(page.getByTestId('explain-sheet')).toBeVisible();
  await page.getByTestId('overlay-close').click();
  await expect(page.getByTestId('explain-sheet')).toHaveCount(0);
});

test('editing an entity recalculates and persists across reload (IndexedDB)', async ({ page }) => {
  await open(page, 'entities');
  await page.getByTestId('node-op').click();
  const name = page.getByTestId('node-name');
  await expect(name).toBeVisible();
  await name.fill('Renamed Operator Co.');
  await expect(page.getByTestId('saved-indicator')).toContainText('Saved locally', { timeout: 10_000 });
  await page.reload();
  await page.goto('./#/entities');
  await expect(page.getByTestId('entity-canvas')).toContainText('Renamed Operator');
});

test('Deal Lab applies a structure and the CCPC result updates', async ({ page }) => {
  await open(page, 'deal-lab');
  await page.locator('[data-testid^="deal-"]').nth(1).click();
  await page.getByTestId('apply-structure').click();
  await open(page, 'overview');
  await expect(page.getByTestId('metric-ccpc.status')).toBeVisible();
});

test('What-If slider changes outcomes and can reset', async ({ page }) => {
  await open(page, 'what-if');
  const table = page.getByTestId('whatif-table');
  const before = await table.innerText();
  await page.getByTestId('knob-debtShare').fill('0.9');
  await expect.poll(() => table.innerText()).not.toBe(before);
  await page.getByTestId('whatif-reset').click();
  await expect.poll(() => table.innerText()).toBe(before);
});

test('document upload is stored locally and searchable', async ({ page }) => {
  await open(page, 'documents');
  await page.getByTestId('file-input').setInputFiles(fixture('synthetic-memo.txt'));
  await expect(page.getByTestId('doc-table')).toContainText('synthetic memo', { timeout: 20_000 });
  await page.getByTestId('doc-search').fill('presenting sponsor instalments');
  await expect(page.getByTestId('search-results')).toContainText(/sponsor/i);
  await page.getByTestId('doc-search').fill('interest paid to a U.S. company');
  await expect(page.getByTestId('rule-answers')).toContainText(/212|XI/);
});

test('reports export CSV and XLSX', async ({ page }) => {
  await open(page, 'reports');
  await expect(page.getByTestId('report-body')).toBeVisible();
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByTestId('report-csv').click()]);
  expect(csv.suggestedFilename()).toMatch(/\.csv$/);
  const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByTestId('report-xlsx').click()]);
  expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/);
});

test('backup export and restore round trip', async ({ page }) => {
  await open(page, 'settings');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup-export').click()]);
  const file = await dl.path();
  expect(file).toBeTruthy();
  page.once('dialog', (d) => void d.accept());
  await page.getByTestId('backup-input').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: readFileSync(file!) });
  await expect(page.locator('body')).toContainText(/restored/i);
});

test('app reopens offline after the service worker installs', async ({ page, context }) => {
  await open(page);
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return !!reg.active;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('h1').first()).toBeVisible();
  await open(page, 'tax');
  await expect(page.locator('h1').first()).toBeVisible();
  await context.setOffline(false);
});
