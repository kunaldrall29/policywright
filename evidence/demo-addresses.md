# Demo testnet addresses (public)

Generated for Freighter + smart-account install demos. Secrets stay in
`~/.config/stellar/` only — **never commit seeds**.

| Role | Address |
|------|---------|
| G-key (identity `policywright-demo`, Delegated signer) | `GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK` |
| Smart account (C-address) | `CALCGK5RRRVOV5XUGRUPX3NT5XZF3XUDL3SHM7ZXZEPNFMLFGJNCTV5W` |
| Network | Stellar Testnet |
| Account wasm | OpenZeppelin `stellar-accounts` / `multisig-account-example` from tag `v0.7.2` |
| Explorer | [C-address](https://stellar.expert/explorer/testnet/contract/CALCGK5RRRVOV5XUGRUPX3NT5XZF3XUDL3SHM7ZXZEPNFMLFGJNCTV5W) · [G signer](https://stellar.expert/explorer/testnet/account/GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK) |

## Freighter on this machine

Chrome Stable ≥137 disables `--load-extension`. Use BiDi:

```bash
# 1) Download + unpack Freighter CRX → tools/freighter-extension/ (gitignored)
./scripts/install-freighter-extension.sh

# 2) Load Freighter into Chrome via Selenium BiDi (keeps browser open)
python3 scripts/install-freighter-via-bidi.py

# 3) Import the policywright-demo seed into Freighter, switch to Testnet
#    Public G must match the table above (Delegated signer of the C-account).
```

Re-deploy a fresh smart account (optional):

```bash
./scripts/create-demo-smart-account.sh policywright-demo testnet
```
