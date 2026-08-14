# walras × policywright — paid `synthesize` MCP tool

This directory makes policywright's `synthesize` capability callable as a
**paid MCP tool** behind the [walras](https://github.com/kunaldrall29/walras)
x402 facilitator on Stellar testnet, priced in testnet USDC.

## What this is (and is not)

- The first, deliberately minimal slice of the **Tranche 2 "MCP server"**
  deliverable ([docs/T2-NOTES.md](../../docs/T2-NOTES.md)): the one pure tool
  (`synthesize`), payment-gated. T2 proper (all four tools, Claude skill,
  wallet integration) remains **not started** and its tracker rows on `main`
  say so; this branch is an integration spike, not that deliverable.
- Provenance: policywright code stays here. The payment layer is entirely the
  stock Apache-2.0 x402 SDK (`@x402/mcp` `createPaymentWrapper`,
  `@x402/core`, `@x402/stellar`, `@x402/extensions`); no walras source is
  imported and walras imports nothing from policywright.

## How it works

`server.ts` wraps policywright's pure pipeline — `parseRecordedJson` →
`synthesize` → `emit` (no I/O, no network, no clock reads) — in
`createPaymentWrapper`: verify → execute → settle per the x402 MCP transport
spec. `declareDiscoveryExtension({ toolName: "synthesize", … })` rides the
settled payment, which is the **only** way the tool enters the walras Bazaar
catalog: no registration call exists. First real payment ⇒ listed.

## Run

```sh
npm install                       # in this directory
npm run setup-payto               # fresh policywright-owned testnet account + USDC trustline
# start a walras facilitator (see the walras repo), then:
PW_PAYTO_ADDRESS=G... FACILITATOR_URL=http://127.0.0.1:4021 npm run serve
```

Environment: `PW_PAYTO_ADDRESS` (required — payments settle here),
`FACILITATOR_URL` (default `http://127.0.0.1:4021`), `PW_MCP_PORT` (default
`4024`), `PW_PRICE` (default `$0.05`). The server holds **no secrets**: it
needs only the public payTo address.
