/**
 * Write synthesize + simulate artefacts for the 2026-09-17 sample-vault recording.
 * Network-free once the recording JSON exists.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { pipelineSimulate, pipelineSynthesize } from '../src/pipeline.js';

const inputPath = 'examples/sample-vault/recorded-deposit-withdraw-2026-09-17.json';
const outDir = 'examples/sample-vault/fresh-2026-09-17';
mkdirSync(outDir, { recursive: true });

const r = pipelineSynthesize({ inputPath });
writeFileSync(`${outDir}/summary.txt`, r.artifacts.summary);
writeFileSync(`${outDir}/spec.json`, `${r.artifacts.specJson}\n`);
writeFileSync(`${outDir}/context-rule.json`, `${r.artifacts.contextRuleJson}\n`);
writeFileSync(`${outDir}/FrequencyLimitPolicy.rs`, r.artifacts.rustPolicy);

const off = pipelineSimulate({ inputPath });
writeFileSync(`${outDir}/simulation-report.md`, `${off.report}\n`);

const on = pipelineSimulate({ inputPath, config: { constrainArguments: true } });
writeFileSync(`${outDir}/simulation-report-args-on.md`, `${on.report}\n`);

const names = (
  JSON.parse(r.artifacts.contextRuleJson) as { contextRules: { name: string }[] }
).contextRules.map((x) => x.name);
process.stdout.write(`wrote ${outDir} rules=[${names.join(', ')}]\n`);
