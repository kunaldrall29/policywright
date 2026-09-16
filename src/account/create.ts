/**
 * Deploy + initialize an OZ smart account on Stellar testnet with a single
 * Delegated(G…) signer and an empty policies map.
 */

import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  requireTestnetIdentity,
  runStellarCli,
  TESTNET_EXPLORER_CONTRACT,
  TESTNET_EXPLORER_TX,
} from '../cli-env.js';
import { badInput, networkError } from '../sources/errors.js';
import { buildDelegatedSignersArg } from '../install/args.js';

export interface AccountCreateResult {
  readonly schemaVersion: 1;
  readonly network: 'testnet';
  readonly smartAccount: string;
  readonly signer: string;
  readonly wasmPath: string;
  readonly wasmHash: string | null;
  readonly uploadTxHash: string | null;
  readonly deployTxHash: string | null;
  readonly explorer: {
    readonly contract: string;
    readonly deployTx: string | null;
  };
}

export interface AccountCreateInput {
  readonly network?: string;
  readonly wasmPath?: string;
  readonly cwd?: string;
  readonly evidencePath?: string;
}

function defaultWasmPath(cwd: string): string {
  return resolve(cwd, 'contracts/target/wasm32v1-none/release/oz_smart_account.wasm');
}

function appendEvidence(evidencePath: string, result: AccountCreateResult): void {
  mkdirSync(dirname(evidencePath), { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const block = `
### D2.5 account:create (${stamp})

| Field | Value |
| ----- | ----- |
| Smart account (C…) | \`${result.smartAccount}\` |
| Delegated signer (G…) | \`${result.signer}\` |
| Network | testnet |
| Deploy tx | \`${result.deployTxHash ?? 'n/a'}\` |
| Explorer (contract) | ${result.explorer.contract} |
| Explorer (deploy tx) | ${result.explorer.deployTx ?? 'n/a'} |
| Wasm | \`${result.wasmPath}\` |
| Wasm hash | \`${result.wasmHash ?? 'n/a'}\` |
| Source | \`npm run cli -- account:create\` (local-signer / stellar-cli) |

`;
  appendFileSync(evidencePath, block);

  const demoPath = resolve(dirname(evidencePath), 'demo-addresses.md');
  const demoLine = `- **Smart account:** \`${result.smartAccount}\` (deploy tx \`${result.deployTxHash ?? 'n/a'}\`, ${stamp})\n`;
  if (!existsSync(demoPath)) {
    writeFileSync(
      demoPath,
      `# Demo addresses (D2.5)\n\nSee also [EVIDENCE.md](./EVIDENCE.md).\n\n${demoLine}`,
    );
  } else {
    appendFileSync(demoPath, demoLine);
  }
}

/** Deploy oz-smart-account wasm with Delegated signer + empty policies. */
export function createSmartAccount(input: AccountCreateInput = {}): AccountCreateResult {
  const cwd = input.cwd ?? process.cwd();
  const identity = requireTestnetIdentity(input.network, cwd);
  const wasmPath = input.wasmPath ?? defaultWasmPath(cwd);
  if (!existsSync(wasmPath)) {
    throw badInput(
      `wasm not found at ${wasmPath} — run: (cd contracts && stellar contract build --package oz-smart-account)`,
    );
  }

  const signersArg = buildDelegatedSignersArg(identity.publicKey);
  const policiesArg = '{}';

  const deploy = runStellarCli(
    [
      'contract',
      'deploy',
      '--wasm',
      wasmPath,
      '--network',
      'testnet',
      '--',
      '--signers',
      signersArg,
      '--policies',
      policiesArg,
    ],
    identity.secretKey,
    { cwd },
  );

  if (!deploy.ok) {
    const err = deploy.stderr.replaceAll(identity.secretKey, '<STELLAR_SECRET_KEY>');
    throw networkError(`account:create deploy failed:\n${err}`);
  }

  const smartAccount = deploy.contractId;
  if (smartAccount === null || !smartAccount.startsWith('C')) {
    throw networkError(
      `account:create succeeded but no C-address on stdout: ${deploy.stdout.trim()}`,
    );
  }

  // Prefer the deploy (second) tx when upload+deploy both appear.
  const allTx = [
    ...`${deploy.stdout}\n${deploy.stderr}`.matchAll(/explorer\/testnet\/tx\/([0-9a-f]{64})/gi),
  ].map((m) => m[1]!);
  const uploadTxHash = allTx.length >= 2 ? allTx[0]! : null;
  const deployTxHash = allTx.length >= 1 ? allTx[allTx.length - 1]! : deploy.txHash;

  let wasmHash: string | null = null;
  const hashMatch = `${deploy.stdout}\n${deploy.stderr}`.match(/wasm hash ([0-9a-f]{64})/i);
  if (hashMatch?.[1] !== undefined) {
    wasmHash = hashMatch[1];
  } else {
    const shasum = spawnSync('shasum', ['-a', '256', wasmPath], { encoding: 'utf8' });
    if (shasum.status === 0) {
      wasmHash = shasum.stdout.split(/\s+/)[0] ?? null;
    }
  }

  const result: AccountCreateResult = {
    schemaVersion: 1,
    network: 'testnet',
    smartAccount,
    signer: identity.publicKey,
    wasmPath,
    wasmHash,
    uploadTxHash,
    deployTxHash,
    explorer: {
      contract: `${TESTNET_EXPLORER_CONTRACT}${smartAccount}`,
      deployTx: deployTxHash !== null ? `${TESTNET_EXPLORER_TX}${deployTxHash}` : null,
    },
  };

  const evidencePath = input.evidencePath ?? resolve(cwd, 'evidence/EVIDENCE.md');
  appendEvidence(evidencePath, result);

  // Ensure EVIDENCE points at demo-addresses when we created it.
  const evidenceBody = readFileSync(evidencePath, 'utf8');
  if (!evidenceBody.includes('demo-addresses.md')) {
    appendFileSync(
      evidencePath,
      `\nAlso see [demo-addresses.md](./demo-addresses.md) for the live C-address list.\n`,
    );
  }

  return result;
}
