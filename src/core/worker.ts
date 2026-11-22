import { parseFile, normalizeFile, LIMITS } from './import';
import { reconcile } from './engine';
self.onmessage = async ({ data }) => {
  try {
    self.postMessage({
      type: 'progress',
      message: data.type === 'parse' ? 'Reading and validating file…' : 'Validating source rows…',
    });
    if (data.type === 'parse') {
      const file = await parseFile(data.file, data.side);
      self.postMessage({ type: 'done', value: file });
    } else {
      const rows = data.files.flatMap((f: Parameters<typeof normalizeFile>[0]) =>
        normalizeFile(f, data.config),
      );
      if (rows.length > LIMITS.totalRows)
        throw new Error(
          `This release supports at most ${LIMITS.totalRows.toLocaleString()} total source rows per run.`,
        );
      self.postMessage({
        type: 'progress',
        message: `Reconciling ${rows.length.toLocaleString()} rows…`,
      });
      const run = reconcile(rows, data.config, { name: data.name, sample: data.sample });
      self.postMessage({ type: 'done', value: run });
    }
  } catch (e) {
    self.postMessage({
      type: 'error',
      message: e instanceof Error ? e.message : 'Could not process this file',
    });
  }
};
