#!/usr/bin/env node
/**
 * policywright command-line entry point.
 *
 *   demo                 run the end-to-end demo and self-check (see demo.ts)
 *   synth                synthesize a spec from the baked-in fixture and print it
 *   simulate             run the dry-run scenarios against the fixture's spec
 *   record <hash...>     fetch a transaction sequence by hash (or ingest a saved
 *                        simulation with --from-simulation) and print the merged
 *                        RecordedTx
 *   verify               diff emitted context-rule.json vs on-chain snapshot
 *                        (fixture file or live --smart-account fetch)
 *   account:create       deploy OZ smart account on testnet (Delegated signer)
 *   install              add_context_rule from emitted context-rule.json (testnet)
 *
 * synth and simulate accept SynthConfig overrides as flags (see USAGE); any
 * flag left out keeps its documented default from DEFAULT_SYNTH_CONFIG.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createSmartAccount } from './account/create.js';
import {
  DEFAULT_FREQUENCY_POLICY,
  requireTestnetIdentity,
  TESTNET_EXPLORER_CONTRACT,
} from './cli-env.js';
import { runDemo } from './demo.js';
import { prepareInstall } from './install/prepare.js';
import { LOCAL_SIGNER_REASON, submitInstall } from './install/submit.js';
import {
  pipelineRecord,
  pipelineSimulate,
  pipelineSynthesize,
  recordedTxToJson,
} from './pipeline.js';
import { renderReport } from './simulate.js';
import { badInput } from './sources/errors.js';
import { DEFAULT_SYNTH_CONFIG, type Network, type SynthConfig } from './types.js';
import { verifyAgainstSnapshot } from './verify/diff.js';
import { fetchOnChainSnapshot } from './verify/fetch.js';

const D = DEFAULT_SYNTH_CONFIG;

const USAGE = `policywright — synthesize a least-privilege smart-account authorization

Usage:
  npm run demo                          end-to-end demo + dry-run self-check
  npm run cli -- synth     [synth-flags] synthesize from the baked-in fixture
  npm run cli -- simulate  [synth-flags] dry-run scenarios against the spec
  npm run record -- <txHash> [<txHash> ...] [record-flags]
  npm run record -- --from-simulation <file.json> [record-flags]
  npm run cli -- verify --context-rule <file> --on-chain-snapshot <file>
  npm run cli -- verify --context-rule <file> --smart-account <C…> [--network testnet]
                                          live fetch + diff (ignores validUntil drift)
  npm run cli -- account:create [--network testnet]
                                          deploy OZ smart account (TESTNET ONLY)
  npm run cli -- install --smart-account <C…> --context-rule <file>
                 [--frequency-policy <C…>] [--spending-limit-policy <C…>]
                 [--signer <G…>] [--dry-run] [--network testnet] [--only <name>]
                                          simulate then submit add_context_rule

Record flags:
  --network <n>            testnet|mainnet|futurenet (testnet)
  --rpc-url <url>          override the network's public RPC endpoint
  --account <G...|C...>    account movements are attributed to; without it the
                           first transaction's source account is assumed (a
                           warning records the assumption — smart-account flows
                           usually act through a C... address, not the source)
  --from-simulation <file> ingest a saved simulateTransaction exchange instead
                           of fetching hashes (source: "simulation")

A multi-step flow (e.g. Blend claim then Soroswap swap) is several hashes —
Soroban allows one InvokeHostFunction per transaction. Passing every hash
merges them into ONE RecordedTx ordered by ledger close time.

Synthesis flags (defaults in parentheses; also apply to simulate):
  --input <recorded.json>    synthesize/simulate from a saved record output
                             instead of the baked-in fixture (e.g.
                             examples/live/recorded-claim-swap.json)
  --lifetime <secs>          context-rule lifetime (${D.lifetimeSecs})
  --spend-window <secs>      spend-cap rolling window (${D.spendWindowSecs})
  --cap-multiplier <number>  cap = observed gross out * this (${D.capMultiplier})
  --frequency-window <secs>  frequency rolling window (${D.frequencyWindowSecs})
  --frequency-max <count>    max calls per frequency window (${D.frequencyMaxCalls})
  --constrain-arguments      enforce swap-path token set (default off: flag only)

Verify flags:
  --context-rule <file>      emitted context-rule.json (required)
  --on-chain-snapshot <file> on-chain snapshot JSON (offline / fixture path)
  --smart-account <C…>       live fetch via get_context_rule* (alternative to snapshot)
  --frequency-policy <C…>    classify FrequencyLimitPolicy on live fetch
  --spending-limit-policy <C…> classify spending_limit wrapper on live fetch
  --network <n>              testnet|mainnet|futurenet (testnet)

Install / account:create are TESTNET ONLY. MCP: npm run mcp (stdio; exactly four
tools — record / synthesize / simulate / verify; never install).`;

/** Minimal `--key value` / `--key=value` flag parser. */
function parseFlags(args: readonly string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === undefined || !arg.startsWith('--')) {
      continue;
    }
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      flags.set(arg.slice(2, eq), arg.slice(eq + 1));
    } else {
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags.set(arg.slice(2), next);
        i += 1;
      } else {
        flags.set(arg.slice(2), 'true');
      }
    }
  }
  return flags;
}

/** Parse a flag as a finite number, throwing a clear error otherwise. */
function numberFlag(flags: Map<string, string>, key: string, fallback: number): number {
  const raw = flags.get(key);
  if (raw === undefined) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`--${key} must be a number, got "${raw}"`);
  }
  return value;
}

/** A boolean flag is true when present unless explicitly set to "false". */
function boolFlag(flags: Map<string, string>, key: string, fallback: boolean): boolean {
  const raw = flags.get(key);
  if (raw === undefined) {
    return fallback;
  }
  return raw !== 'false';
}

/** Build a SynthConfig from flags, overriding documented defaults. */
function parseSynthConfig(flags: Map<string, string>): SynthConfig {
  return {
    lifetimeSecs: numberFlag(flags, 'lifetime', D.lifetimeSecs),
    spendWindowSecs: numberFlag(flags, 'spend-window', D.spendWindowSecs),
    capMultiplier: numberFlag(flags, 'cap-multiplier', D.capMultiplier),
    frequencyWindowSecs: numberFlag(flags, 'frequency-window', D.frequencyWindowSecs),
    frequencyMaxCalls: numberFlag(flags, 'frequency-max', D.frequencyMaxCalls),
    constrainArguments: boolFlag(flags, 'constrain-arguments', D.constrainArguments),
  };
}

function parseNetwork(value: string | undefined): Network {
  if (value === undefined) {
    return 'testnet';
  }
  if (value !== 'testnet' && value !== 'mainnet' && value !== 'futurenet') {
    throw new Error(`unknown network "${value}" (expected testnet, mainnet, or futurenet)`);
  }
  return value;
}

function cmdSynth(config: SynthConfig, inputPath: string | undefined): void {
  const { artifacts } = pipelineSynthesize({
    ...(inputPath === undefined ? {} : { inputPath }),
    config,
  });
  process.stdout.write(artifacts.summary);
  process.stdout.write('\n--- spec.json ---\n');
  process.stdout.write(`${artifacts.specJson}\n`);
  process.stdout.write('\n--- context-rule.json ---\n');
  process.stdout.write(`${artifacts.contextRuleJson}\n`);
}

function cmdSimulate(config: SynthConfig, inputPath: string | undefined): void {
  const { results, config: used } = pipelineSimulate({
    ...(inputPath === undefined ? {} : { inputPath }),
    config,
  });
  process.stdout.write(
    `${renderReport(results, {
      ...(inputPath === undefined ? {} : { source: inputPath }),
      constrainArguments: used.constrainArguments,
    })}\n`,
  );
}

/** Positional (non-flag) arguments, skipping each flag's value token. */
function positionalArgs(rest: readonly string[]): string[] {
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === undefined) {
      continue;
    }
    if (arg.startsWith('--')) {
      const next = rest[i + 1];
      if (!arg.includes('=') && next !== undefined && !next.startsWith('--')) {
        i += 1;
      }
      continue;
    }
    positional.push(arg);
  }
  return positional;
}

async function cmdRecord(rest: readonly string[]): Promise<void> {
  const flags = parseFlags(rest);
  const hashes = positionalArgs(rest);
  const network = parseNetwork(flags.get('network'));
  const rpcUrl = flags.get('rpc-url');
  const account = flags.get('account');
  const simulationFile = flags.get('from-simulation');

  let fromSimulation: unknown;
  if (simulationFile !== undefined) {
    if (hashes.length > 0) {
      throw badInput('--from-simulation cannot be combined with transaction hashes');
    }
    try {
      fromSimulation = JSON.parse(readFileSync(simulationFile, 'utf8'));
    } catch (cause) {
      throw badInput(
        `could not read simulation file ${simulationFile}: ${(cause as Error).message}`,
      );
    }
  }

  const tx = await pipelineRecord({
    ...(hashes.length === 0 ? {} : { hashes }),
    network,
    ...(rpcUrl === undefined ? {} : { rpcUrl }),
    ...(account === undefined ? {} : { account }),
    ...(fromSimulation === undefined ? {} : { fromSimulation }),
  });
  process.stdout.write(`${recordedTxToJson(tx)}\n`);
}

async function cmdVerify(rest: readonly string[]): Promise<void> {
  const flags = parseFlags(rest);
  const contextRulePath = flags.get('context-rule');
  const snapshotPath = flags.get('on-chain-snapshot');
  const smartAccount = flags.get('smart-account');
  if (contextRulePath === undefined) {
    throw badInput('verify requires --context-rule <file>');
  }
  if (snapshotPath === undefined && smartAccount === undefined) {
    throw badInput('verify requires --on-chain-snapshot <file> or --smart-account <C…>');
  }

  let emitted: unknown;
  try {
    emitted = JSON.parse(readFileSync(contextRulePath, 'utf8'));
  } catch (cause) {
    throw badInput(
      `could not read context-rule file ${contextRulePath}: ${(cause as Error).message}`,
    );
  }

  let snapshot: unknown;
  if (smartAccount !== undefined) {
    const network = parseNetwork(flags.get('network'));
    const spendingLimitPolicyAddress = flags.get('spending-limit-policy');
    snapshot = await fetchOnChainSnapshot({
      smartAccount,
      network,
      frequencyPolicyAddress: flags.get('frequency-policy') ?? DEFAULT_FREQUENCY_POLICY,
      ...(spendingLimitPolicyAddress !== undefined ? { spendingLimitPolicyAddress } : {}),
    });
    mkdirSync('out', { recursive: true });
    writeFileSync(resolve('out/on-chain-snapshot.json'), `${JSON.stringify(snapshot, null, 2)}\n`);
  } else {
    try {
      snapshot = JSON.parse(readFileSync(snapshotPath!, 'utf8'));
    } catch (cause) {
      throw badInput(
        `could not read on-chain snapshot file ${snapshotPath}: ${(cause as Error).message}`,
      );
    }
  }

  const result = verifyAgainstSnapshot({ emitted, snapshot });
  if (!result.ok) {
    process.stderr.write(
      `verify failed — ${result.diffs.length} diff(s):\n` +
        result.diffs.map((d) => `  - ${d.path}: ${d.message}`).join('\n') +
        '\n',
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `verify ok — ${result.matchedRules} context rule(s) match on-chain snapshot` +
      (smartAccount !== undefined ? ` (live ${smartAccount})` : '') +
      '.\n',
  );
}

function cmdAccountCreate(rest: readonly string[]): void {
  const flags = parseFlags(rest);
  const networkFlag = flags.get('network');
  const result =
    networkFlag !== undefined ? createSmartAccount({ network: networkFlag }) : createSmartAccount();
  process.stdout.write(
    [
      `smartAccount: ${result.smartAccount}`,
      `signer: ${result.signer}`,
      `deployTx: ${result.deployTxHash ?? 'n/a'}`,
      `explorer: ${result.explorer.contract}`,
      result.explorer.deployTx !== null ? `deployExplorer: ${result.explorer.deployTx}` : null,
      `evidence: appended to evidence/EVIDENCE.md + evidence/demo-addresses.md`,
    ]
      .filter((l) => l !== null)
      .join('\n') + '\n',
  );
}

async function cmdInstall(rest: readonly string[]): Promise<void> {
  const flags = parseFlags(rest);
  const smartAccount = flags.get('smart-account');
  const contextRulePath = flags.get('context-rule');
  if (smartAccount === undefined || contextRulePath === undefined) {
    throw badInput('install requires --smart-account <C…> and --context-rule <file>');
  }
  const network = parseNetwork(flags.get('network'));
  if (network !== 'testnet') {
    throw badInput('install is TESTNET ONLY');
  }
  const identity = requireTestnetIdentity(flags.get('network'));
  const signer = flags.get('signer') ?? identity.publicKey;
  const dryRun = boolFlag(flags, 'dry-run', false);
  const only = flags.get('only');

  const spendingLimitPolicyAddress = flags.get('spending-limit-policy');
  const plan = await prepareInstall(
    spendingLimitPolicyAddress !== undefined
      ? {
          contextRulePath,
          smartAccount,
          network: 'testnet',
          frequencyPolicyAddress: flags.get('frequency-policy') ?? DEFAULT_FREQUENCY_POLICY,
          spendingLimitPolicyAddress,
          signers: [signer],
        }
      : {
          contextRulePath,
          smartAccount,
          network: 'testnet',
          frequencyPolicyAddress: flags.get('frequency-policy') ?? DEFAULT_FREQUENCY_POLICY,
          signers: [signer],
        },
  );

  process.stdout.write(
    [
      `signing: local-signer-fallback`,
      `reason: ${LOCAL_SIGNER_REASON}`,
      `preferred: ${plan.signingHierarchy.preferred}`,
      `ledger.head: ${plan.ledger.latestLedger}`,
      `validUntilLedger: ${plan.rules[0]?.validUntilLedger ?? 'n/a'}`,
      `readyToSign: ${plan.readyToSign}`,
      `rules: ${plan.rules.length}`,
    ].join('\n') + '\n',
  );

  for (const rule of plan.rules) {
    if (rule.blockers.length > 0) {
      process.stderr.write(`note: rule "${rule.name}" blockers: ${rule.blockers.join('; ')}\n`);
    }
  }

  const installable = plan.rules.filter((r) => r.callArgs !== null);
  if (installable.length === 0) {
    throw badInput(
      `no installable rules — ${plan.rules.flatMap((r) => r.blockers).join('; ') || 'unknown'}`,
    );
  }

  let onlyNames: string[] | undefined =
    only !== undefined ? only.split(',').map((s) => s.trim()) : undefined;
  if (onlyNames === undefined && installable.length < plan.rules.length) {
    // Prefer frequency-policy rules so the D2.5 criterion is met even when the
    // spending-limit wrapper address was not passed.
    const freq = installable.filter((r) => r.policies.some((p) => /frequency/i.test(p.policy)));
    onlyNames = (freq.length > 0 ? freq : installable).map((r) => r.name);
    process.stdout.write(
      `note: installing subset [${onlyNames.join(', ')}] ` +
        `(${plan.rules.length - installable.length} rule(s) blocked — ` +
        `pass --spending-limit-policy or --only to control)\n`,
    );
  }

  const result = await submitInstall({
    plan,
    identity,
    dryRun,
    ...(onlyNames !== undefined ? { onlyNames } : {}),
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.failedNames.length > 0) {
    process.exitCode = 1;
  }
  if (!dryRun && result.installedNames.length > 0) {
    mkdirSync('out', { recursive: true });
    writeFileSync('out/install-result.json', `${JSON.stringify(result, null, 2)}\n`);
    // Write the subset of emitted rules that were installed (for live verify).
    try {
      const emittedDoc = JSON.parse(readFileSync(contextRulePath, 'utf8')) as Record<
        string,
        unknown
      >;
      const installed = new Set(result.installedNames);
      const rawRules = emittedDoc['contextRules'];
      const filteredRules: unknown[] = [];
      if (Array.isArray(rawRules)) {
        for (const entry of rawRules) {
          if (typeof entry !== 'object' || entry === null) continue;
          const record = entry as Record<string, unknown>;
          const name = record['name'];
          if (typeof name === 'string' && installed.has(name)) {
            filteredRules.push(entry);
          }
        }
      }
      const subset = {
        ...emittedDoc,
        contextRules: filteredRules,
        installNote:
          result.installedNames.length < plan.rules.length
            ? `subset install: ${result.installedNames.join(', ')}`
            : 'full install',
      };
      writeFileSync('out/installed-context-rule.json', `${JSON.stringify(subset, null, 2)}\n`);
    } catch {
      // non-fatal
    }
    process.stdout.write(`explorer.account: ${TESTNET_EXPLORER_CONTRACT}${smartAccount}\n`);
  }
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case 'demo':
      runDemo();
      return;
    case 'synth': {
      const flags = parseFlags(rest);
      cmdSynth(parseSynthConfig(flags), flags.get('input'));
      return;
    }
    case 'simulate': {
      const flags = parseFlags(rest);
      cmdSimulate(parseSynthConfig(flags), flags.get('input'));
      return;
    }
    case 'record':
      await cmdRecord(rest);
      return;
    case 'verify':
      await cmdVerify(rest);
      return;
    case 'account:create':
      cmdAccountCreate(rest);
      return;
    case 'install':
      await cmdInstall(rest);
      return;
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      process.stdout.write(`${USAGE}\n`);
      return;
    default:
      throw new Error(`unknown command "${command}"\n\n${USAGE}`);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exit(1);
});
