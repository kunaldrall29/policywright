/**
 * Creates the policywright-owned testnet account that paid `synthesize`
 * calls settle to: fresh keypair, Friendbot-funded XLM, USDC trustline
 * (Circle testnet USDC — the asset walras settles by default).
 *
 * Prints the address + an env fragment. The secret is shown ONCE and never
 * written to disk; only the G... address is needed by the server (payTo).
 */
import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

const HORIZON_URL = process.env.HORIZON_URL ?? "https://horizon-testnet.stellar.org";
const USDC = new Asset("USDC", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");

const server = new Horizon.Server(HORIZON_URL);

async function friendbot(address) {
  const res = await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`);
  if (!res.ok) throw new Error(`friendbot ${res.status}: ${await res.text()}`);
}

async function addTrustline(keypair) {
  const account = await server.loadAccount(keypair.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.changeTrust({ asset: USDC }))
    .setTimeout(60)
    .build();
  tx.sign(keypair);
  await server.submitTransaction(tx);
}

const pair = Keypair.random();
console.log(`policywright payTo account: ${pair.publicKey()}`);
console.log("funding via Friendbot …");
await friendbot(pair.publicKey());
console.log("adding USDC trustline …");
await addTrustline(pair);
console.log("done — funded, trustlined, ready to receive USDC.\n");
console.log("--- env fragment (secret shown once; store it with policywright's owner) ---");
console.log(`PW_PAYTO_ADDRESS=${pair.publicKey()}`);
console.log(`# PW_PAYTO_SECRET=${pair.secret()}   <- NOT read by the server; safekeeping only`);
