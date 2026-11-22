import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('import, map, reconcile, investigate, persist, export', async ({ page }) => {
  await page.goto('/app/import');
  const head =
    'Policy Number,Carrier,Period,Transaction ID,Transaction Date,Due Date,Currency,Commission\n';
  await page
    .getByLabel('Upload expected files')
    .setInputFiles({
      name: 'expected.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(head + '001-A,Test Carrier,2026-11,,2026-11-01,2026-11-20,USD,100.00'),
    });
  await expect(page.getByRole('heading', { name: 'expected.csv', exact: true })).toBeVisible();
  await page
    .getByLabel('Upload received files')
    .setInputFiles({
      name: 'payments.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(head + '001-A,Test Carrier,2026-11,PAY-001,2026-11-20,,USD,80.00'),
    });
  await expect(page.getByRole('heading', { name: 'payments.csv', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Run reconciliation', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Reconciliation results', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Underpaid', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Investigate 001-A', exact: true }).click();
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('Investigating');
  await page
    .getByRole('textbox', { name: 'Evidence or explanation', exact: true })
    .fill('QA evidence: payment amount is 20 below the expected ledger.');
  await page.getByRole('button', { name: 'Record decision', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Decision history', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Save on device', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Run saved on this device');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export view', exact: true }).click();
  expect((await download).suggestedFilename()).toContain('findings.csv');
  await page.goto('/app/history');
  await expect(
    page.getByRole('button', { name: 'Commission reconciliation', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Commission reconciliation', exact: true }).click();
  await expect(page.getByText('Investigating', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('homepage accessibility and responsive layout', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Every commission');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(result.violations).toEqual([]);
});
test('sample uses real engine and paid checkout fails closed', async ({ page }) => {
  await page.goto('/app?demo=1');
  await expect(page.getByRole('heading', { name: 'Your commission overview.' })).toBeVisible();
  await expect(page.getByText(/USD\s*42,600.00/)).toBeVisible();
  await page.goto('/pricing');
  await expect(page.getByRole('button', { name: 'Paid launch not enabled' })).toHaveCount(2);
});
