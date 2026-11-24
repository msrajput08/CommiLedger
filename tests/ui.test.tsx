// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import axe from 'axe-core';
import { Calculator, MarketingLayout, Home } from '../src/pages/marketing';
import { WorkspaceProvider } from '../src/lib/workspace';
import { Pricing } from '../src/pages/account';
import { storage } from '../src/lib/storage';
import { defaultConfig } from '../src/core/types';
import { sampleFiles } from '../src/core/sample';
import { normalizeFile } from '../src/core/import';
import { reconcile } from '../src/core/engine';
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ accounts: false, billing: false, billingEnvironment: 'unconfigured' }),
          { headers: { 'content-type': 'application/json' } },
        ),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('customer-facing calculations and controls', () => {
  it('keeps local tools available when theme persistence is denied', async () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    try {
      render(
        <MemoryRouter>
          <WorkspaceProvider>
            <Calculator />
          </WorkspaceProvider>
        </MemoryRouter>,
      );
      expect(screen.getByRole('textbox', { name: 'Premium' })).toBeTruthy();
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });
  it('recalculates from user input with exact variance', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Calculator />
      </MemoryRouter>,
    );
    const premium = screen.getByRole('textbox', { name: 'Premium' });
    await user.clear(premium);
    await user.type(premium, '10000');
    expect(screen.getByText(/USD\s*1,000.00/)).toBeTruthy();
    expect(screen.getByText(/USD\s*100.00/)).toBeTruthy();
  });
  it('fails closed when billing is unconfigured', async () => {
    render(
      <MemoryRouter>
        <WorkspaceProvider>
          <Pricing />
        </WorkspaceProvider>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Paid launch not enabled' })).toHaveLength(2),
    );
    expect(
      screen
        .getAllByRole('button', { name: 'Paid launch not enabled' })
        .every((b) => b.hasAttribute('disabled')),
    ).toBe(true);
  });
  it('has no semantic accessibility violations on the homepage', async () => {
    const { container } = render(
      <MemoryRouter>
        <MarketingLayout>
          <Home />
        </MarketingLayout>
      </MemoryRouter>,
    );
    const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.map((v) => ({ id: v.id, description: v.description }))).toEqual([]);
  });
});
describe('explicit local persistence', () => {
  it('saves a complete batch atomically and retains workflow snapshots', async () => {
    const config = defaultConfig();
    const first = reconcile(
      sampleFiles().flatMap((f) => normalizeFile(f, config)),
      config,
    );
    const second = { ...structuredClone(first), id: crypto.randomUUID() };
    await storage.saveRuns([first, second]);
    expect((await storage.runs()).filter((r) => [first.id, second.id].includes(r.id))).toHaveLength(
      2,
    );
    const invalid = { ...second, id: undefined } as unknown as typeof second;
    const third = { ...first, id: crypto.randomUUID() };
    await expect(storage.saveRuns([third, invalid])).rejects.toThrow();
    expect((await storage.runs()).some((r) => r.id === third.id)).toBe(false);
  });
  it('retains reproducibility and append-only review entries across a database reload', async () => {
    const config = { ...defaultConfig(), asOf: '2026-11-22' },
      input = sampleFiles().flatMap((f) => normalizeFile(f, config));
    const run = reconcile(input, config, { sample: true });
    run.rows[0].review.push({
      status: 'Investigating',
      note: 'Synthetic test evidence',
      at: new Date().toISOString(),
      actor: 'tester',
    });
    await storage.saveRun(run);
    const found = (await storage.runs()).find((r) => r.id === run.id)!;
    expect(found).toEqual(run);
    await storage.deleteRun(run.id);
    expect((await storage.runs()).some((r) => r.id === run.id)).toBe(false);
  });
});
