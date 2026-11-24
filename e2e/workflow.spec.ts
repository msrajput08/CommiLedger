import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
test('import, map, reconcile, investigate, persist, export', async ({ page }) => {
  await page.goto('/app/import');
  const head =
    'Policy Number,Carrier,Period,Transaction ID,Transaction Date,Due Date,Currency,Commission\n';
  await page.getByLabel('Upload expected files').setInputFiles({
    name: 'expected.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(head + '001-A,Test Carrier,2026-11,,2026-11-01,2026-11-20,USD,100.00'),
  });
  await expect(page.getByRole('heading', { name: 'expected.csv', exact: true })).toBeVisible();
  await page.getByLabel('Upload received files').setInputFiles({
    name: 'payments.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(head + '001-A,Test Carrier,2026-11,PAY-001,2026-11-20,,USD,80.00'),
  });
  await expect(page.getByRole('heading', { name: 'payments.csv', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Run reconciliation', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Reconciliation results', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('table').getByText('Underpaid', { exact: true })).toBeVisible();
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
  await expect(page.getByRole('table').getByText('Investigating', { exact: true })).toBeVisible();
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
test('dashboard is accessible in light and dark themes', async ({ page }) => {
  await page.goto('/app?demo=1');
  await expect(page.getByText(/USD\s*42,600.00/)).toBeVisible();
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') {
      const menu = page.getByRole('button', { name: 'Toggle workspace navigation', exact: true });
      const mobile = await menu.isVisible();
      if (mobile) await menu.click();
      await page.getByRole('button', { name: 'Switch to dark theme', exact: true }).click();
      if (mobile)
        await page.getByRole('button', { name: 'Close workspace navigation', exact: true }).click();
    }
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({ target: n.target, reason: n.failureSummary })),
      })),
    ).toEqual([]);
  }
});
test('versioned workflow runs distinct carriers and restores an exported audit backup', async ({
  page,
}) => {
  await page.goto('/app/profiles');
  for (const name of ['Carrier A', 'Carrier B']) {
    await page.getByRole('button', { name: 'New carrier profile', exact: true }).click();
    await page.getByRole('textbox', { name: 'Carrier name', exact: true }).fill(name);
    await page.getByRole('button', { name: 'Save profile version', exact: true }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  }
  await page.goto('/app/workflows');
  await page.getByRole('button', { name: 'New workflow', exact: true }).click();
  await page.getByRole('textbox', { name: 'Workflow name', exact: true }).fill('Month end');
  for (const name of ['Carrier A', 'Carrier B'])
    await page
      .getByRole('combobox', { name: 'Add carrier stage', exact: true })
      .selectOption({ label: `${name} · v1` });
  await page.getByRole('button', { name: 'Save workflow', exact: true }).click();
  await page.getByRole('button', { name: 'Use workflow', exact: true }).click();
  const head = 'Policy Number,Carrier,Period,Transaction ID,Currency,Commission\n';
  for (const side of ['expected', 'received']) {
    await page.getByLabel(`Upload ${side} files`).setInputFiles(
      ['A', 'B'].map((carrier) => ({
        name: `${side}-${carrier}.csv`,
        mimeType: 'text/csv',
        buffer: Buffer.from(
          head +
            `001,Carrier ${carrier},2026-11,${side === 'received' ? 'PAY-' + carrier : ''},USD,${side === 'expected' ? '100.00' : '80.00'}`,
        ),
      })),
    );
    await expect(page.getByRole('heading', { name: `${side}-B.csv`, exact: true })).toBeVisible();
  }
  for (const [i, carrier] of ['A', 'B'].entries())
    for (const side of ['expected', 'received']) {
      await page
        .getByRole('combobox', { name: `Workflow stage for ${side}-${carrier}.csv`, exact: true })
        .selectOption({ label: `${i + 1}. Carrier ${carrier} · USD` });
    }
  await page.getByRole('button', { name: 'Run and save batch', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Run history', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Month end · Carrier A', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Month end · Carrier B', exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Month end · Carrier A', exact: true }).click();
  const file = await download;
  const data = await readFile((await file.path())!);
  const run = JSON.parse(data.toString());
  expect(run.inputCount).toBe(2);
  expect(run.totals.USD.underpayment).toBe('20.00');
  await page
    .getByLabel('Audit JSON backup', { exact: true })
    .setInputFiles({ name: 'audit.json', mimeType: 'application/json', buffer: data });
  await page.getByRole('button', { name: 'Save restored copy', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Month end · Carrier A', exact: true }),
  ).toHaveCount(2);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Month end · Carrier A', exact: true }),
  ).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
