/**
 * Sign + submit `add_context_rule` when the smart account uses a Delegated(G)
 * signer. stellar-cli cannot fill OZ `AuthPayload` / nested G auth on its own
 * ("Missing signing key for account C…"); this path does what FACTS.md §5.3
 * labels as the local-signer fallback.
 *
 * Algorithm (OpenZeppelin docs + smart-account-kit multi-signer path):
 * 1. Build unsigned invoke via stellar-cli `--build-only`
 * 2. `simulateTransaction` over JSON-RPC (avoid SDK XDR decode of ledger APIs)
 * 3. Replace void C-account signature with AuthPayload { Delegated(G): [], rule ids }
 * 4. Add nested G auth entry for `__check_auth(auth_digest)`
 * 5. Re-simulate with both auth entries, assemble, sign fee-payer, submit
 */

import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Account,
  Address,
  BASE_FEE,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  hash,
  xdr,
} from '@stellar/stellar-sdk';
import { runStellarCli } from '../cli-env.js';
import { badInput, networkError } from '../sources/errors.js';
import type { AddContextRuleArgs } from './args.js';

const TESTNET_RPC = 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE = Networks.TESTNET;

async function rpcCall(method: string, params: unknown): Promise<unknown> {
  const response = await fetch(TESTNET_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!response.ok) {
    throw networkError(`RPC HTTP ${response.status} for ${method}`);
  }
  const body = (await response.json()) as {
    result?: unknown;
    error?: { message?: string };
  };
  if (body.error !== undefined) {
    throw networkError(`RPC ${method}: ${body.error.message ?? 'error'}`);
  }
  return body.result;
}

function randomNonce(): xdr.Int64 {
  const bytes = randomBytes(8);
  const view = new DataView(bytes.buffer, bytes.byteOffset, 8);
  return xdr.Int64.fromString(view.getBigInt64(0, false).toString());
}

function buildAuthDigest(signaturePayload: Buffer, contextRuleIds: readonly number[]): Buffer {
  const ruleIdsXdr = xdr.ScVal.scvVec(contextRuleIds.map((id) => xdr.ScVal.scvU32(id))).toXDR();
  return hash(Buffer.concat([signaturePayload, ruleIdsXdr]));
}

function writeAuthPayload(delegatedG: string, contextRuleIds: readonly number[]): xdr.ScVal {
  const signerKey = xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol('Delegated'),
    Address.fromString(delegatedG).toScVal(),
  ]);
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('context_rule_ids'),
      val: xdr.ScVal.scvVec(contextRuleIds.map((id) => xdr.ScVal.scvU32(id))),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('signers'),
      val: xdr.ScVal.scvMap([
        new xdr.ScMapEntry({
          key: signerKey,
          val: xdr.ScVal.scvBytes(Buffer.alloc(0)),
        }),
      ]),
    }),
  ]);
}

function buildAddressSignatureScVal(publicKeyBytes: Buffer, signatureBytes: Buffer): xdr.ScVal {
  return xdr.ScVal.scvVec([
    xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol('public_key'),
        val: xdr.ScVal.scvBytes(publicKeyBytes),
      }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol('signature'),
        val: xdr.ScVal.scvBytes(signatureBytes),
      }),
    ]),
  ]);
}

function signaturePayloadForEntry(
  entry: xdr.SorobanAuthorizationEntry,
  expiration: number,
): Buffer {
  const creds = entry.credentials().address();
  creds.signatureExpirationLedger(expiration);
  const preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
    new xdr.HashIdPreimageSorobanAuthorization({
      networkId: hash(Buffer.from(NETWORK_PASSPHRASE)),
      nonce: creds.nonce(),
      signatureExpirationLedger: expiration,
      invocation: entry.rootInvocation(),
    }),
  );
  return hash(preimage.toXDR());
}

export interface DelegatedInstallInput {
  readonly smartAccount: string;
  readonly secretKey: string;
  readonly callArgs: AddContextRuleArgs;
  /** Context rule id used to authorize the mutation (constructor Default = 0). */
  readonly authContextRuleId?: number;
}

export interface DelegatedInstallResult {
  readonly ok: boolean;
  readonly txHash: string | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error: string | null;
}

/**
 * Build, auth-sign (Delegated), and submit one `add_context_rule` invocation.
 */
export async function submitAddContextRuleDelegated(
  input: DelegatedInstallInput,
): Promise<DelegatedInstallResult> {
  const keypair = Keypair.fromSecret(input.secretKey);
  const parsedSigners = JSON.parse(input.callArgs.signers) as unknown;
  const firstSigner =
    Array.isArray(parsedSigners) &&
    parsedSigners[0] !== null &&
    typeof parsedSigners[0] === 'object'
      ? (parsedSigners[0] as { Delegated?: unknown }).Delegated
      : undefined;
  if (typeof firstSigner === 'string' && firstSigner !== keypair.publicKey()) {
    // Soft check — signers arg should match the local key; continue anyway.
  }
  const ruleId = input.authContextRuleId ?? 0;

  const policiesPath = join(tmpdir(), `pw-pol-${Date.now()}.json`);
  writeFileSync(policiesPath, input.callArgs.policies);

  const build = runStellarCli(
    [
      'contract',
      'invoke',
      '--id',
      input.smartAccount,
      '--network',
      'testnet',
      '--build-only',
      '--',
      'add_context_rule',
      '--context_type',
      input.callArgs.contextType,
      '--name',
      input.callArgs.name,
      '--valid_until',
      String(input.callArgs.validUntil),
      '--signers',
      input.callArgs.signers,
      '--policies-file-path',
      policiesPath,
    ],
    input.secretKey,
  );
  if (!build.ok) {
    return {
      ok: false,
      txHash: null,
      stdout: build.stdout,
      stderr: build.stderr,
      error: build.stderr || 'build-only failed',
    };
  }
  const unsignedXdr = build.stdout.trim().split(/\s+/).pop();
  if (unsignedXdr === undefined || unsignedXdr.length < 20) {
    return {
      ok: false,
      txHash: null,
      stdout: build.stdout,
      stderr: build.stderr,
      error: 'build-only produced no transaction XDR',
    };
  }

  const sim1 = (await rpcCall('simulateTransaction', {
    transaction: unsignedXdr,
  })) as {
    results?: Array<{ auth?: string[] }>;
    transactionData?: string;
    minResourceFee?: string;
    latestLedger?: number;
    error?: string;
  };
  if (sim1.error !== undefined || !sim1.results?.[0]?.auth?.[0]) {
    return {
      ok: false,
      txHash: null,
      stdout: '',
      stderr: JSON.stringify(sim1),
      error: `simulate failed: ${sim1.error ?? 'no auth entries'}`,
    };
  }

  const latestLedger =
    typeof sim1.latestLedger === 'number'
      ? sim1.latestLedger
      : ((await rpcCall('getLatestLedger', null)) as { sequence: number }).sequence;
  const expiration = latestLedger + 1000;

  const auth0 = sim1.results[0].auth[0];
  if (auth0 === undefined) {
    return {
      ok: false,
      txHash: null,
      stdout: '',
      stderr: JSON.stringify(sim1),
      error: 'simulate returned empty auth entry list',
    };
  }
  const smartAuth = xdr.SorobanAuthorizationEntry.fromXDR(auth0, 'base64');
  const creds = smartAuth.credentials().address();
  creds.signatureExpirationLedger(expiration);

  // Bind Default rule (0) — constructor rule that holds the Delegated signer.
  const contextRuleIds = [ruleId];
  const signaturePayload = signaturePayloadForEntry(smartAuth, expiration);
  const authDigest = buildAuthDigest(signaturePayload, contextRuleIds);
  creds.signature(writeAuthPayload(keypair.publicKey(), contextRuleIds));

  // Nested G auth for require_auth_for_args((auth_digest,))
  const delegatedNonce = randomNonce();
  const delegatedInvocation = new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      new xdr.InvokeContractArgs({
        contractAddress: Address.fromString(input.smartAccount).toScAddress(),
        functionName: '__check_auth',
        args: [xdr.ScVal.scvBytes(authDigest)],
      }),
    ),
    subInvocations: [],
  });
  const delegatedPreimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
    new xdr.HashIdPreimageSorobanAuthorization({
      networkId: hash(Buffer.from(NETWORK_PASSPHRASE)),
      nonce: delegatedNonce,
      signatureExpirationLedger: expiration,
      invocation: delegatedInvocation,
    }),
  );
  const delegatedPayload = hash(delegatedPreimage.toXDR());
  const gSig = keypair.sign(delegatedPayload);
  const delegatedEntry = new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: Address.fromString(keypair.publicKey()).toScAddress(),
        nonce: delegatedNonce,
        signatureExpirationLedger: expiration,
        signature: buildAddressSignatureScVal(Buffer.from(keypair.rawPublicKey()), gSig),
      }),
    ),
    rootInvocation: delegatedInvocation,
  });

  // Rebuild invoke with both auth entries; fetch account sequence for fee payer.
  let sequence: string;
  try {
    const hz = await fetch(`https://horizon-testnet.stellar.org/accounts/${keypair.publicKey()}`);
    if (!hz.ok) {
      throw new Error(`horizon ${hz.status}`);
    }
    const hzBody = (await hz.json()) as { sequence: string };
    sequence = hzBody.sequence;
  } catch (cause) {
    throw networkError(`could not load fee-payer sequence: ${(cause as Error).message}`);
  }

  // Extract host function from the unsigned tx.
  const unsignedTx = TransactionBuilder.fromXDR(unsignedXdr, NETWORK_PASSPHRASE);
  const rawOp = unsignedTx.operations[0];
  if (rawOp === undefined || rawOp.type !== 'invokeHostFunction') {
    throw badInput('expected invokeHostFunction operation from build-only');
  }
  const hostFunc = (rawOp as unknown as { func: xdr.HostFunction }).func;

  // One Account instance: TransactionBuilder increments sequence on construct.
  // Build the candidate once for re-sim, then rebuild a FRESH Account for the
  // final assembled tx so we do not burn an extra sequence number.
  const resimSource = new Account(keypair.publicKey(), sequence);
  const resimTx = new TransactionBuilder(resimSource, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.invokeHostFunction({
        func: hostFunc,
        auth: [smartAuth, delegatedEntry],
      }),
    )
    .setTimeout(180)
    .build();

  const sim2 = (await rpcCall('simulateTransaction', {
    transaction: resimTx.toXDR(),
  })) as {
    transactionData?: string;
    minResourceFee?: string;
    error?: string;
    results?: unknown;
  };
  if (sim2.error !== undefined || sim2.transactionData === undefined) {
    return {
      ok: false,
      txHash: null,
      stdout: '',
      stderr: JSON.stringify(sim2),
      error: `re-simulate failed: ${sim2.error ?? 'no transactionData'}`,
    };
  }

  // Fresh Account with the same starting sequence for the fee-bearing tx.
  const finalSource = new Account(keypair.publicKey(), sequence);
  const finalTx = new TransactionBuilder(finalSource, {
    fee: String(BigInt(BASE_FEE) + BigInt(sim2.minResourceFee ?? '0')),
    networkPassphrase: NETWORK_PASSPHRASE,
    sorobanData: xdr.SorobanTransactionData.fromXDR(sim2.transactionData, 'base64'),
  })
    .addOperation(
      Operation.invokeHostFunction({
        func: hostFunc,
        auth: [smartAuth, delegatedEntry],
      }),
    )
    .setTimeout(180)
    .build();

  finalTx.sign(keypair);

  const sent = (await rpcCall('sendTransaction', {
    transaction: finalTx.toXDR(),
  })) as {
    hash?: string;
    status?: string;
    errorResultXdr?: string;
    errorResult?: unknown;
    message?: string;
  };

  if (sent.status === 'ERROR' || sent.hash === undefined) {
    return {
      ok: false,
      txHash: sent.hash ?? null,
      stdout: '',
      stderr: JSON.stringify(sent),
      error: `sendTransaction ${sent.status ?? 'failed'}: ${sent.errorResultXdr ?? sent.message ?? 'unknown'}`,
    };
  }

  // Poll getTransaction until SUCCESS / FAILED
  const hashHex = sent.hash;
  for (let i = 0; i < 30; i += 1) {
    await new Promise((r) => setTimeout(r, 2000));
    const got = (await rpcCall('getTransaction', { hash: hashHex })) as {
      status?: string;
      resultXdr?: string;
    };
    if (got.status === 'SUCCESS') {
      return {
        ok: true,
        txHash: hashHex,
        stdout: JSON.stringify(got),
        stderr: '',
        error: null,
      };
    }
    if (got.status === 'FAILED') {
      return {
        ok: false,
        txHash: hashHex,
        stdout: JSON.stringify(got),
        stderr: '',
        error: 'transaction FAILED on-chain',
      };
    }
  }
  return {
    ok: false,
    txHash: hashHex,
    stdout: '',
    stderr: '',
    error: 'transaction not confirmed within timeout',
  };
}
