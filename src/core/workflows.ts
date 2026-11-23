import type { Config, Field, ImportFile, Profile, Workflow } from './types';
import { workflowSchema } from './validation';
import { validateConfig } from './engine';
import { validateRule } from './money';
import { LIMITS } from './limits';

export function validateWorkflow(value: unknown): Workflow {
  const workflow = workflowSchema.parse(value);
  if (new Set(workflow.stages.map((s) => s.id)).size !== workflow.stages.length)
    throw new Error('Workflow stage identifiers must be unique');
  if (JSON.stringify(workflow).length > 100000) throw new Error('Workflow exceeds 100 KiB');
  for (const stage of workflow.stages) {
    validateConfig(stage.profile.config);
    validateRule(stage.profile.rule);
  }
  return workflow;
}
export function mapProfile(file: ImportFile, profile: Profile): ImportFile {
  const headers = file.sheets[file.sheet].rows[file.header];
  const mapping = { ...file.mapping };
  for (const [field, header] of Object.entries(profile.mappingHeaders[file.side] || {})) {
    const matches = headers.flatMap((h, i) => (h === header ? [i] : []));
    // Missing or repeated saved headers must be mapped again, not silently substituted.
    delete mapping[field as Field];
    if (matches.length === 1) mapping[field as Field] = matches[0];
  }
  return { ...file, mapping };
}
export function prepareBatch(
  workflow: Workflow,
  files: ImportFile[],
  assignments: Record<string, string>,
  context: Config,
) {
  validateWorkflow(workflow);
  if (workflow.archived) throw new Error('Restore the workflow before using it');
  if (!files.length || files.length > LIMITS.files)
    throw new Error('Select between 1 and 10 files');
  const stageIds = new Set(workflow.stages.map((s) => s.id));
  if (files.some((f) => !stageIds.has(assignments[f.id])))
    throw new Error('Assign every file to a workflow stage');
  const rowCount = files.reduce(
    (sum, f) =>
      sum +
      f.sheets[f.sheet].rows.slice(f.header + 1).filter((r) => r.some((x) => x.trim())).length,
    0,
  );
  if (rowCount > LIMITS.totalRows)
    throw new Error('The whole batch supports at most 25,000 source rows');
  return workflow.stages.map((stage) => {
    const selected = files.filter((f) => assignments[f.id] === stage.id);
    if (
      !selected.some((f) => f.side === 'expected') ||
      !selected.some((f) => f.side === 'received')
    )
      throw new Error(`${stage.profile.name}: assign an expected ledger and a payment statement`);
    const config: Config = {
      ...structuredClone(stage.profile.config),
      asOf: context.asOf,
      coverageStart: context.coverageStart,
      coverageEnd: context.coverageEnd,
      completeStatement: context.completeStatement,
    };
    delete config.expectedRule;
    if (stage.deriveExpected)
      config.expectedRule = {
        profileId: stage.profile.id,
        profileVersion: stage.profile.version,
        name: stage.profile.name,
        rule: structuredClone(stage.profile.rule),
      };
    return {
      files: selected,
      config,
      name: `${workflow.name} · ${stage.profile.name}`.slice(0, 100),
      sample: selected.every((f) => f.hash === 'synthetic-sample-v1'),
    };
  });
}
