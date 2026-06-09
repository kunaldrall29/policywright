/**
 * End-to-end demo: load the baked-in recording, synthesize a least-privilege
 * spec, emit the artefacts, and run the dry-run scenarios — asserting each
 * behaves as expected. `npm run demo` runs this and exits non-zero if any
 * scenario deviates, so the demo doubles as a smoke test.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { emit } from './emitter.js';
import { loadFixture } from './sources/fixture.js';
import { buildScenarios, renderReport, simulateCall } from './simulate.js';
import { synthesize } from './synthesizer.js';
import { DEFAULT_SYNTH_CONFIG, type SimulationResult } from './types.js';

/** Directory (relative to cwd) the demo writes generated artefacts into. */
const OUT_DIR = 'out';

/** Write the emitted artefacts and dry-run report to {@link OUT_DIR}. */
function writeArtifacts(
  summary: string,
  specJson: string,
  rustPolicy: string,
  report: string,
): string {
  const dir = join(process.cwd(), OUT_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'summary.txt'), summary);
  writeFileSync(join(dir, 'spec.json'), `${specJson}\n`);
  writeFileSync(join(dir, 'FrequencyLimitPolicy.rs'), rustPolicy);
  writeFileSync(join(dir, 'simulation-report.md'), report);
  return dir;
}

/**
 * Run the full pipeline and self-check the dry-run scenarios.
 * @returns the dry-run results (for reuse/testing)
 * @throws if any scenario's decision deviates from its expectation
 */
export function runDemo(): readonly SimulationResult[] {
  const tx = loadFixture();
  const now = tx.timestamp ?? 0;
  const spec = synthesize(tx, DEFAULT_SYNTH_CONFIG, now);
  const artifacts = emit(tx, spec);

  const scenarios = buildScenarios(spec, tx);
  const results = scenarios.map((s) => simulateCall(spec, s.candidate));
  const report = renderReport(results);

  const dir = writeArtifacts(artifacts.summary, artifacts.specJson, artifacts.rustPolicy, report);

  process.stdout.write(artifacts.summary);
  process.stdout.write('\n');
  process.stdout.write(report);
  process.stdout.write('\n');

  // Verify every scenario behaved as expected.
  const failures: string[] = [];
  scenarios.forEach((scenario, i) => {
    const result = results[i];
    if (
      result === undefined ||
      result.decision !== scenario.expectedDecision ||
      result.reasonCode !== scenario.expectedReasonCode
    ) {
      failures.push(
        `  - "${scenario.candidate.label}": expected ${scenario.expectedDecision}/${scenario.expectedReasonCode}, got ${result?.decision}/${result?.reasonCode}`,
      );
    }
  });

  if (failures.length > 0) {
    throw new Error(`dry-run scenarios did not match expectations:\n${failures.join('\n')}`);
  }

  process.stdout.write(`All ${scenarios.length} dry-run scenarios behaved as expected.\n`);
  process.stdout.write(`Artefacts written to ${dir}/\n`);
  return results;
}

// Run only when invoked directly (not when imported by the CLI or tests).
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runDemo();
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  }
}
