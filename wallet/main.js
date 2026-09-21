/**
 * Freighter install UI for policywright.
 * Served as static ESM (`npx serve wallet`). Secrets never enter this page.
 */

import freighterApi from 'https://esm.sh/@stellar/freighter-api@3.0.0';
import * as StellarSdk from 'https://esm.sh/@stellar/stellar-sdk@13.1.0';

const {
  isConnected,
  isAllowed,
  requestAccess,
  getAddress,
  getNetwork,
  signTransaction,
} = freighterApi;

const { Account, BASE_FEE, Contract, TransactionBuilder, rpc, Address, nativeToScVal, xdr } =
  StellarSdk;

const RPC_BY_PASSPHRASE = {
  'Test SDF Network ; September 2015': 'https://soroban-testnet.stellar.org',
  'Public Global Stellar Network ; September 2015': 'https://mainnet.sorobanrpc.com',
  'Test SDF Future Network ; October 2022': 'https://rpc-futurenet.stellar.org',
};

const planEl = document.getElementById('plan');
const planStatus = document.getElementById('plan-status');
const review = document.getElementById('review');
const reviewDl = document.getElementById('review-dl');
const blockersEl = document.getElementById('blockers');
const signPanel = document.getElementById('sign-panel');
const walletStatus = document.getElementById('wallet-status');
const connectBtn = document.getElementById('btn-connect');
const signBtn = document.getElementById('btn-sign');

let plan = null;
let freighterPublicKey = null;

function showStatus(el, text, ok) {
  el.hidden = false;
  el.textContent = text;
  el.classList.toggle('ok', ok === true);
  el.classList.toggle('err', ok === false);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Encode plan signers as Vec&lt;Signer&gt; with Delegated(Address) variants.
 * Plans carry plain G-strings; OZ expects enum XDR, not ScSymbol.
 */
function signersToScVal(signers) {
  const entries = (signers ?? []).map((entry) => {
    const g =
      typeof entry === 'string'
        ? entry
        : entry && typeof entry === 'object' && typeof entry.Delegated === 'string'
          ? entry.Delegated
          : null;
    if (typeof g !== 'string' || !g.startsWith('G')) {
      throw new Error(`signer must be a G… address, got ${JSON.stringify(entry)}`);
    }
    return xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Delegated'), Address.fromString(g).toScVal()]);
  });
  return xdr.ScVal.scvVec(entries);
}

document.getElementById('btn-sample').addEventListener('click', () => {
  planEl.value = JSON.stringify(
    {
      schemaVersion: 1,
      network: 'testnet',
      smartAccount: 'CALCGK5RRRVOV5XUGRUPX3NT5XZF3XUDL3SHM7ZXZEPNFMLFGJNCTV5W',
      readyToSign: false,
      ledger: {
        latestLedger: 0,
        lifetimeSecs: 2592000,
        lifetimeLedgers: 518400,
        estimatedSecsPerLedger: 5,
      },
      rules: [
        {
          name: 'pw:xfer:native',
          contextType: {
            type: 'CallContract',
            contract: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
          },
          validUntilLedger: 0,
          observedFns: ['transfer'],
          signers: [],
          policies: [
            {
              policy: 'stock:spending_limit',
              address: null,
              installParams: { spending_limit: '11000000', period_ledgers: 17280 },
            },
          ],
          blockers: ['sample only — load a real install plan JSON'],
        },
      ],
      freighter: {
        networkPassphrase: 'Test SDF Network ; September 2015',
        tip: 'Replace this sample with a real install-plan.json from prepare-install.',
      },
      notes: ['Sample only.'],
    },
    null,
    2,
  );
});

document.getElementById('btn-parse').addEventListener('click', () => {
  try {
    plan = JSON.parse(planEl.value);
  } catch (error) {
    showStatus(planStatus, `Invalid JSON: ${error.message}`, false);
    review.hidden = true;
    signPanel.hidden = true;
    return;
  }
  if (plan.schemaVersion !== 1) {
    showStatus(planStatus, 'schemaVersion must be 1', false);
    return;
  }

  const rules = plan.rules ?? [];
  const readyToSign = Boolean(plan.readyToSign);
  const blockers = rules.flatMap((r) => (r.blockers ?? []).map((b) => `${r.name}: ${b}`));

  reviewDl.innerHTML = '';
  for (const [k, v] of [
    ['Smart account', plan.smartAccount],
    ['Network', plan.network],
    ['Latest ledger', String(plan.ledger?.latestLedger ?? '')],
    ['validUntilLedger', String(rules[0]?.validUntilLedger ?? '')],
    ['Rules', String(rules.length)],
    ['Ready to sign', String(readyToSign)],
  ]) {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    reviewDl.append(dt, dd);
  }

  blockersEl.innerHTML = '';
  for (const b of blockers) {
    const li = document.createElement('li');
    li.textContent = b;
    blockersEl.append(li);
  }

  showStatus(
    planStatus,
    readyToSign
      ? (plan.freighter?.tip ?? 'Plan looks ready.')
      : `Plan has ${blockers.length} blocker(s). Resolve them before signing.`,
    readyToSign,
  );
  review.hidden = false;
  signPanel.hidden = false;
  signBtn.disabled = !readyToSign || !freighterPublicKey;
});

connectBtn.addEventListener('click', async () => {
  try {
    const connected = await isConnected();
    if (!connected.isConnected) {
      showStatus(
        walletStatus,
        'Freighter not detected. Install the Freighter extension and reload.',
        false,
      );
      return;
    }
    const allowed = await isAllowed();
    if (!allowed.isAllowed) {
      const access = await requestAccess();
      if (access.error) throw new Error(String(access.error));
      freighterPublicKey = access.address;
    } else {
      const addr = await getAddress();
      if (addr.error) throw new Error(String(addr.error));
      freighterPublicKey = addr.address;
    }
    const network = await getNetwork();
    showStatus(
      walletStatus,
      `Connected ${freighterPublicKey}\nFreighter network: ${network.network}\n${network.networkPassphrase}`,
      true,
    );
    signBtn.disabled = !plan?.readyToSign;
  } catch (error) {
    showStatus(walletStatus, error.message ?? String(error), false);
  }
});

function policyParamsScVal(params) {
  if (params.spending_limit !== undefined) {
    return nativeToScVal(
      {
        spending_limit: BigInt(params.spending_limit),
        period_ledgers: Number(params.period_ledgers),
      },
      { type: { spending_limit: ['symbol', 'i128'], period_ledgers: ['symbol', 'u32'] } },
    );
  }
  if (params.window_secs !== undefined) {
    return nativeToScVal(
      {
        window_secs: BigInt(params.window_secs),
        max_calls: Number(params.max_calls),
      },
      { type: { window_secs: ['symbol', 'u64'], max_calls: ['symbol', 'u32'] } },
    );
  }
  return nativeToScVal(params);
}

function buildAddContextRuleOp(smartAccount, rule) {
  const contract = new Contract(smartAccount);
  const mapEntries = [];
  for (const policy of rule.policies) {
    if (!policy.address) throw new Error(`policy ${policy.policy} missing address`);
    mapEntries.push(
      new xdr.ScMapEntry({
        key: Address.fromString(policy.address).toScVal(),
        val: policyParamsScVal(policy.installParams ?? {}),
      }),
    );
  }
  const contextType = rule.contextType ?? {};
  const contractId = contextType.contract;
  if (typeof contractId !== 'string') {
    throw new Error(`rule ${rule.name}: contextType.contract missing`);
  }
  return contract.call(
    'add_context_rule',
    nativeToScVal(
      { CallContract: Address.fromString(contractId) },
      { type: { CallContract: ['symbol', 'address'] } },
    ),
    nativeToScVal(rule.name, { type: 'string' }),
    nativeToScVal(Number(rule.validUntilLedger), { type: 'u32' }),
    signersToScVal(rule.signers),
    xdr.ScVal.scvMap(mapEntries),
  );
}

/**
 * Wait until RPC reports SUCCESS (or fail). sendTransaction often returns
 * PENDING before inclusion — reloading the account too early reuses a stale
 * sequence for the next rule.
 */
async function waitForSuccess(server, sent, ruleName) {
  if (sent.status === 'ERROR') {
    const detail =
      sent.errorResultXdr ??
      sent.errorResult?.toXDR?.('base64') ??
      JSON.stringify(sent);
    throw new Error(`send ${ruleName} ERROR: ${detail}`);
  }
  if (sent.status === 'SUCCESS') {
    return { rule: ruleName, status: 'SUCCESS', hash: sent.hash };
  }

  const hash = sent.hash;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await sleep(1500);
    const got = await server.getTransaction(hash);
    if (got.status === 'SUCCESS') {
      return { rule: ruleName, status: 'SUCCESS', hash };
    }
    if (got.status === 'FAILED') {
      throw new Error(`getTransaction ${ruleName} FAILED hash=${hash}`);
    }
    // NOT_FOUND / PENDING — keep polling
  }
  throw new Error(
    `timed out waiting for ${ruleName} (hash=${hash}, lastSendStatus=${sent.status})`,
  );
}

signBtn.addEventListener('click', async () => {
  if (!plan?.readyToSign || !freighterPublicKey) return;
  try {
    const passphrase = plan.freighter.networkPassphrase;
    const rpcUrl = RPC_BY_PASSPHRASE[passphrase];
    if (!rpcUrl) throw new Error(`Unsupported passphrase: ${passphrase}`);
    const server = new rpc.Server(rpcUrl);
    let account = await server.getAccount(freighterPublicKey);
    const results = [];

    for (const rule of plan.rules) {
      const tx = new TransactionBuilder(new Account(account.accountId(), account.sequenceNumber()), {
        fee: BASE_FEE,
        networkPassphrase: passphrase,
      })
        .addOperation(buildAddContextRuleOp(plan.smartAccount, rule))
        .setTimeout(180)
        .build();

      const simulated = await server.simulateTransaction(tx);
      if (rpc.Api.isSimulationError(simulated)) {
        throw new Error(`simulate ${rule.name}: ${simulated.error}`);
      }
      const prepared = rpc.assembleTransaction(tx, simulated).build();
      const signed = await signTransaction(prepared.toXDR(), {
        networkPassphrase: passphrase,
        address: freighterPublicKey,
      });
      if (signed.error) throw new Error(String(signed.error));
      const envelope = TransactionBuilder.fromXDR(signed.signedTxXdr, passphrase);
      const sent = await server.sendTransaction(envelope);
      const confirmed = await waitForSuccess(server, sent, rule.name);
      results.push(confirmed);
      account = await server.getAccount(freighterPublicKey);
    }

    showStatus(walletStatus, JSON.stringify(results, null, 2), true);
  } catch (error) {
    showStatus(walletStatus, error.message ?? String(error), false);
  }
});
