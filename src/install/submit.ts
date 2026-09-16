/**
 * Submit (or dry-run) `add_context_rule` installs.
 *
 * Always simulates first (`stellar contract invoke --send=no`). On success and
 * when not `--dry-run`, submits via the Delegated-signer auth path
 * ({@link submitAddContextRuleDelegated}) — stellar-cli alone cannot fill OZ
 * `AuthPayload` ("Missing signing key for account C…").
 *
 * Signing uses the FACTS.md §5.3 hierarchy: Freighter preferred; this path is
 * the labeled **local-signer fallback**.
 */

import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runStellarCli,
  TESTNET_EXPLORER_TX,
  type TestnetIdentity,
} from '../cli-env.js';
import { badInput } from '../sources/errors.js';
import type { InstallPlan, InstallRuleInvocation } from './prepare.js';
import { submitAddContextRuleDelegated } from './sign-delegated.js';

export const LOCAL_SIGNER_REASON =
  'local-signer fallback: no browser Freighter in this environment; signing with .env STELLAR_SECRET_KEY via OZ Delegated AuthPayload path (FACTS.md §5.3)';

export interface InstallRuleResult {
  readonly name: string;
  readonly ok: boolean;
  readonly dryRun: boolean;
  readonly simulated: boolean;
  readonly txHash: string | null;
  readonly explorerUrl: string | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error: string | null;
}

export interface InstallSubmitResult {
  readonly schemaVersion: 1;
  readonly smartAccount: string;
  readonly network: 'testnet';
  readonly signing: {
    readonly mode: 'local-signer-fallback';
    readonly reason: string;
    readonly preferred: string;
  };
  readonly dryRun: boolean;
  readonly results: readonly InstallRuleResult[];
  readonly installedNames: readonly string[];
  readonly failedNames: readonly string[];
}

function simulateAddContextRule(
  identity: TestnetIdentity,
  smartAccount: string,
  rule: InstallRuleInvocation,
): { ok: boolean; stdout: string; stderr: string; error: string | null } {
  if (rule.callArgs === null) {
    return {
      ok: false,
      stdout: '',
      stderr: '',
      error: `rule "${rule.name}" has blockers: ${rule.blockers.join('; ')}`,
    };
  }
  const policiesPath = join(
    tmpdir(),
    `pw-policies-${rule.name.replace(/[^a-z0-9_-]/gi, '_')}.json`,
  );
  writeFileSync(policiesPath, rule.callArgs.policies);

  const result = runStellarCli(
    [
      'contract',
      'invoke',
      '--id',
      smartAccount,
      '--network',
      'testnet',
      '--send=no',
      '--',
      'add_context_rule',
      '--context_type',
      rule.callArgs.contextType,
      '--name',
      rule.callArgs.name,
      '--valid_until',
      String(rule.callArgs.validUntil),
      '--signers',
      rule.callArgs.signers,
      '--policies-file-path',
      policiesPath,
    ],
    identity.secretKey,
  );
  const redactedStderr = result.stderr.replaceAll(identity.secretKey, '<STELLAR_SECRET_KEY>');
  const redactedStdout = result.stdout.replaceAll(identity.secretKey, '<STELLAR_SECRET_KEY>');
  if (!result.ok) {
    return {
      ok: false,
      stdout: redactedStdout,
      stderr: redactedStderr,
      error: redactedStderr.trim() || redactedStdout.trim() || `stellar exit ${result.status}`,
    };
  }
  return { ok: true, stdout: redactedStdout, stderr: redactedStderr, error: null };
}

export interface SubmitInstallInput {
  readonly plan: InstallPlan;
  readonly identity: TestnetIdentity;
  readonly dryRun?: boolean;
  /** Install only these rule names (subset). Default: all ready rules. */
  readonly onlyNames?: readonly string[];
  /** Stop after first failure (default true). */
  readonly stopOnError?: boolean;
}

/**
 * Simulate each rule, then submit (unless dry-run). Prefer installing rules
 * that attach FrequencyLimitPolicy when doing a subset for the D2.5 criterion.
 */
export async function submitInstall(input: SubmitInstallInput): Promise<InstallSubmitResult> {
  const dryRun = input.dryRun === true;
  const stopOnError = input.stopOnError !== false;
  if (input.plan.network !== 'testnet') {
    throw badInput('install submits to testnet only');
  }
  if (!input.plan.smartAccount.startsWith('C')) {
    throw badInput('--smart-account must be a C… address');
  }

  let rules = input.plan.rules.filter((r) => r.blockers.length === 0 && r.callArgs !== null);
  if (input.onlyNames !== undefined && input.onlyNames.length > 0) {
    const want = new Set(input.onlyNames);
    rules = rules.filter((r) => want.has(r.name));
  }
  if (rules.length === 0) {
    throw badInput(
      input.plan.readyToSign
        ? 'no rules selected to install'
        : `install plan not ready: ${input.plan.rules.flatMap((r) => r.blockers).join('; ')}`,
    );
  }

  const results: InstallRuleResult[] = [];
  for (const rule of rules) {
    const sim = simulateAddContextRule(input.identity, input.plan.smartAccount, rule);
    if (!sim.ok) {
      results.push({
        name: rule.name,
        ok: false,
        dryRun,
        simulated: false,
        txHash: null,
        explorerUrl: null,
        stdout: sim.stdout,
        stderr: sim.stderr,
        error: sim.error,
      });
      if (stopOnError) break;
      continue;
    }
    if (dryRun) {
      results.push({
        name: rule.name,
        ok: true,
        dryRun: true,
        simulated: true,
        txHash: null,
        explorerUrl: null,
        stdout: sim.stdout,
        stderr: sim.stderr,
        error: null,
      });
      continue;
    }
    if (rule.callArgs === null) {
      results.push({
        name: rule.name,
        ok: false,
        dryRun: false,
        simulated: true,
        txHash: null,
        explorerUrl: null,
        stdout: sim.stdout,
        stderr: sim.stderr,
        error: 'missing callArgs after successful simulate',
      });
      if (stopOnError) break;
      continue;
    }
    const sent = await submitAddContextRuleDelegated({
      smartAccount: input.plan.smartAccount,
      secretKey: input.identity.secretKey,
      callArgs: rule.callArgs,
    });
    if (!sent.ok) {
      results.push({
        name: rule.name,
        ok: false,
        dryRun: false,
        simulated: true,
        txHash: sent.txHash,
        explorerUrl: sent.txHash !== null ? `${TESTNET_EXPLORER_TX}${sent.txHash}` : null,
        stdout: sent.stdout,
        stderr: sent.stderr,
        error: sent.error,
      });
      if (stopOnError) break;
      continue;
    }
    results.push({
      name: rule.name,
      ok: true,
      dryRun: false,
      simulated: true,
      txHash: sent.txHash,
      explorerUrl: sent.txHash !== null ? `${TESTNET_EXPLORER_TX}${sent.txHash}` : null,
      stdout: sent.stdout,
      stderr: sent.stderr,
      error: null,
    });
  }

  return {
    schemaVersion: 1,
    smartAccount: input.plan.smartAccount,
    network: 'testnet',
    signing: {
      mode: 'local-signer-fallback',
      reason: LOCAL_SIGNER_REASON,
      preferred: input.plan.signingHierarchy.preferred,
    },
    dryRun,
    results,
    installedNames: results.filter((r) => r.ok && !r.dryRun).map((r) => r.name),
    failedNames: results.filter((r) => !r.ok).map((r) => r.name),
  };
}
