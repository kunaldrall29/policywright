# MCP reference session (scripted stdio)

Captured: 2026-09-17T02:46:20.369Z
Transport: stdio → `tsx src/mcp/server.ts`
Fixtures: sample-vault 2026-09-17 recording + verify fixtures

Built in response to the SCF 'OZ accounts policy builder' RFP (Q2 2026), funded in round SCF #44 as the awarded submission 'Record-to-Policy MCP + Agent skill.'

## tools/list
- `record`: Record one or more Soroban transactions (by hash) — or ingest a saved simulateTransaction exchange / inline RecordedTx —…
- `synthesize`: Synthesize the least-privilege OpenZeppelin smart-account authorization (context rules + policies) from a RecordedTx or …
- `simulate`: Dry-run the built-in scenario suite against a synthesized spec (permit / deny / flag). Pure given the recording + SynthC…
- `verify`: Diff emitted context-rule.json (+ attached policy install params) against an on-chain smart-account snapshot (fixture pa…

Confirmed: exactly four tools; no install/deploy.

### tool: record
```json
{
  "recordedTx": {
    "hash": "af094330a3f86a500679fc011a847c000e5a6018c83a73c429496f54ee532445",
    "network": "testnet",
    "source": "rpc",
    "ledger": 4717760,
    "timestamp": 1789612387,
    "subject": "GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK",
    "calls": [
      {
        "contract": "CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET",
        "fnName": "deposit",
        "args": [
          "GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK",
          "10000000"
        ],
        "sourceHash": "af094330a3f86a500679fc011a847c000e5a6018c83a73c429496f54ee532445",
        "authorizations": [
          {
            "contract": "CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET",
            "fnName": "deposit",
            "args": [
              "GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK",
              "10000000"
            ],
            "subInvocations": [
              {
                "contract": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7",
                "fnName": "transfer",
                "args": [
                  "GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK",
                  "CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET",
                  "10000000"
                ],
                "subInvocations": []
              }
            ]
          }
        ]
      },
      {
        "contract": "CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET",
        "fnName": "withdraw",
        "args": [
          "GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK",
          "4000000"
        ],
        "sourceHash": "2f0a27b953635f9de1762bcf6133d62d432ea66ef32439509aa4b14768f4facf",
        "authorizations": [
          {
            "contract": "CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET",
            "fnName": "withdraw",
            "args": [
              "GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK",
              "4000000"
            ],
            "subInvocations": []
          }
        ]
      }
    ],
    "flows": [
      {
        "asset": {
          "contractId": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7",
          "symbol": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7",
          "decimals": 7,
          "resolved": false
        },
        "direction": "out",
        "amount": "10000000"
      },
      {
        "asset": {
          "contractId": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7",
          "symbol": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7",
          "decimals": 7,
          "resolved": false
        },
        "direction": "in",
        "amount": "4000000"
      }
    ],
    "warnings": [
      "token metadata for CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7 could not be resolved; symbol falls back to the contract id and decimals to 7 (flagged resolved: false)",
      "token metadata for CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7 could not be resolved; symbol falls back to the contract id and decimals to 7 (flagged resolved: false)"
    ]
  }
}
```

**result (truncated if long):**

```json
{
  "schemaVersion": 1,
  "recordedTx": {
    "hash": "af094330a3f86a500679fc011a847c000e5a6018c83a73c429496f54ee532445",
    "network": "testnet",
    "source": "rpc",
    "ledger": 4717760,
    "timestamp": 1789612387,
    "subject": "GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK",
    "calls": [
      {
        "contract": "CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET",
        "fnName": "deposit",
        "args": [
          "GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK",
          "10000000"
        ],
        "sourceHash": "af094330a3f86a500679fc011a847c000e5a6018c83a73c429496f54ee532445",
        "authorizations": [
          {
            "contract": "CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET",
            "fnName": "deposit",
            "args": [
              "GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK",
              "10000000"
            ],
            "subInvocations": [
              {
                "contract": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7",
                "fnName": "transfer",
                "args": [
                  "GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK",
                  "CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET",
                  "10000000"
                ],
                "subInvocations": []
              }
            ]
          }
        ]
      },
      {
        "contract": "CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET",
        "fnName": "withdraw",
        "args": [
          "GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK",
          "4000000"
        ],
        "sourceHash": "2f0a27b953635f9de1762bcf6133d62d432ea66ef32439509aa4b14768f4facf",
        "authorizations": [
          {
            "contract": "CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET",
            "fnName": "withdraw",
            "args": [
              "GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK",
              "4000000"
            ],
            "subInvocations": []
          }
        ]
      }
    ],
    "flows": [
      {
        "asset": {
          "contractId": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7",
          "symbol": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7",
          "decimals": 7,
          "resolved": false
        },
        "direction": "out",
        "amount": "10000000"
      },
      {
        "asset": {
          "contractId": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7",
          "symbol": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7",
          "decimals": 7,
          "resolved": false
        },
        "direction": "in",
        "amount": "4000000"
      }
    ],
    "warnings": [
      "token metadata for CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7 could not be resolved; symbol falls back to the contract id and decimals to 7 (flagged resolved: false)",
      "token metadata for CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7 could not be resolved; symbol falls back to the contract id and decimals to 7 (flagged resolved: false)"
    ]
  }
}
```

### tool: synthesize
```json
{
  "recordedTx": {
    "hash": "af094330a3f86a500679fc011a847c000e5a6018c83a73c429496f54ee532445",
    "network": "testnet",
    "source": "rpc",
    "ledger": 4717760,
    "timestamp": 1789612387,
    "subject": "GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK",
    "calls": [
      {
        "contract": "CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET",
        "fnName": "deposit",
        "args": [
          "GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK",
          "10000000"
        ],
        "sourceHash": "af094330a3f86a500679fc011a847c000e5a6018c83a73c429496f54ee532445",
        "authorizations": [
          {
            "contract": "CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET",
            "fnName": "deposit",
            "args": [
              "GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK",
              "10000000"
            ],
            "subInvocations": [
              {
                "contract": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7",
                "fnName": "transfer",
                "args": [
                  "GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK",
                  "CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET",
                  "10000000"
                ],
                "subInvocations": []
              }
            ]
          }
        ]
      },
      {
        "contract": "CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET",
        "fnName": "withdraw",
        "args": [
          "GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK",
          "4000000"
        ],
        "sourceHash": "2f0a27b953635f9de1762bcf6133d62d432ea66ef32439509aa4b14768f4facf",
        "authorizations": [
          {
            "contract": "CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET",
            "fnName": "withdraw",
            "args": [
              "GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK",
              "4000000"
            ],
            "subInvocations": []
          }
        ]
      }
    ],
    "flows": [
      {
        "asset": {
          "contractId": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7",
          "symbol": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7",
          "decimals": 7,
          "resolved": false
        },
        "direction": "out",
        "amount": "10000000"
      },
      {
        "asset": {
          "contractId": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7",
          "symbol": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7",
          "decimals": 7,
          "resolved": false
        },
        "direction": "in",
        "amount": "4000000"
      }
    ],
    "warnings": [
      "token metadata for CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7 could not be resolved; symbol falls back to the contract id and decimals to 7 (flagged resolved: false)",
      "token metadata for CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7 could not be resolved; symbol falls back to the contract id and decimals to 7 (flagged resolved: false)"
    ]
  },
  "constrainArguments": false
}
```

**result (truncated if long):**

```json
{
  "schemaVersion": 1,
  "summary": "policywright — synthesized smart-account authorization\n======================================================\n\nSource tx : af094330a3f86a500679fc011a847c000e5a6018c83a73c429496f54ee532445\nNetwork   : testnet (recorded from rpc)\n\nObserved flow\n-------------\n  call deposit @ CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET\n  call withdraw @ CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET\n  out  1 CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7 (unresolved)\n  in   0.4 CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7 (unresolved)\n\nContext rule\n------------\n  name        : pw:deposit+withdraw\n  valid until : 1792204387 (unix)\n  scope       :\n    - deposit @ CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET\n    - withdraw @ CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET\n\nPolicies (2)\n--------\n  - spending-limit: CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7 (unresolved) <= 1.1 per 86400s (observed gross out 1)\n  - frequency-limit: <= 5 call(s) per 86400s\n\nInstallable OZ context rules (2) — see context-rule.json\n----------------------------\n  pw:deposit+withdraw  CallContract(CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET)\n    valid until ledger 5236160; observed fns: deposit, withdraw\n    - custom:FrequencyLimitPolicy { window_secs: 86400, max_calls: 5 }\n  pw:xfer:CDOEGWQS  CallContract(CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7)\n    valid until ledger 5236160; observed fns: transfer\n    - stock:spending_limit { spending_limit: 11000000, period_ledgers: 17280 } (caps CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7 (unresolved) transfers)\n\n  5 composition note(s) in context-rule.json (unit conversions,\n  deltas the stock policies cannot express).\n\nNote: the generated FrequencyLimitPolicy Rust is ILLUSTRATIVE and\nUNAUDITED — a starting point, not deploy-ready code.\n",
  "spec": {
    "contextRule": {
      "name": "pw:deposit+withdraw",
      "scopedCalls": [
        {
          "contract": "CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET",
          "fnName": "deposit"
        },
        {
          "contract": "CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET",
          "fnName": "withdraw"
        }
      ],
      "validUntil": 1792204387
    },
    "policies": [
      {
        "kind": "spending-limit",
        "asset": {
          "contractId": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7",
          "symbol": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7",
          "decimals": 7,
          "resolved": false
        },
        "cap": "11000000",
        "windowSecs": 86400,
        "observedGrossOut": "10000000"
      },
      {
        "kind": "frequency-limit",
        "windowSecs": 86400,
        "maxCalls": 5
      }
    ],
    "argumentScopes": [],
    "argumentScopesEnforced": false,
    "warnings": [],
    "config": {
      "lifetimeSecs": 2592000,
      "spendWindowSecs": 86400,
      "capMultiplier": 1.1,
      "frequencyWindowSecs": 86400,
      "frequencyMaxCalls": 5,
      "constrainArguments": false
    }
  },
  "contextRule": {
    "schemaVersion": 1,
    "generatedBy": "policywright",
    "target": {
      "package": "stellar-accounts (OpenZeppelin/stellar-contracts)",
      "version": "v0.7.2",
      "commit": "a9c42169000638da937577f592ebf61a7a3c94ca",
      "installEntryPoint": "SmartAccount::add_context_rule(context_type, name, valid_until, signers, policies: Map<Address, Val>) — packages/accounts/src/smart_account/mod.rs:238-248"
    },
    "source": {
      "network": "testnet",
      "recordedFrom": "rpc",
      "subject": "GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK",
      "ledger": 4717760,
      "sourceHashes": [
        "af094330a3f86a500679fc011a847c000e5a6018c83a73c429496f54ee532445",
        "2f0a27b953635f9de1762bcf6133d62d432ea66ef32439509aa4b14768f4facf"
      ]
    },
  
… [truncated 20925 chars]
```

### tool: simulate
```json
{
  "recordedTx": {
    "hash": "af094330a3f86a500679fc011a847c000e5a6018c83a73c429496f54ee532445",
    "network": "testnet",
    "source": "rpc",
    "ledger": 4717760,
    "timestamp": 1789612387,
    "subject": "GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK",
    "calls": [
      {
        "contract": "CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET",
        "fnName": "deposit",
        "args": [
          "GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK",
          "10000000"
        ],
        "sourceHash": "af094330a3f86a500679fc011a847c000e5a6018c83a73c429496f54ee532445",
        "authorizations": [
          {
            "contract": "CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET",
            "fnName": "deposit",
            "args": [
              "GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK",
              "10000000"
            ],
            "subInvocations": [
              {
                "contract": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7",
                "fnName": "transfer",
                "args": [
                  "GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK",
                  "CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET",
                  "10000000"
                ],
                "subInvocations": []
              }
            ]
          }
        ]
      },
      {
        "contract": "CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET",
        "fnName": "withdraw",
        "args": [
          "GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK",
          "4000000"
        ],
        "sourceHash": "2f0a27b953635f9de1762bcf6133d62d432ea66ef32439509aa4b14768f4facf",
        "authorizations": [
          {
            "contract": "CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET",
            "fnName": "withdraw",
            "args": [
              "GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK",
              "4000000"
            ],
            "subInvocations": []
          }
        ]
      }
    ],
    "flows": [
      {
        "asset": {
          "contractId": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7",
          "symbol": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7",
          "decimals": 7,
          "resolved": false
        },
        "direction": "out",
        "amount": "10000000"
      },
      {
        "asset": {
          "contractId": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7",
          "symbol": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7",
          "decimals": 7,
          "resolved": false
        },
        "direction": "in",
        "amount": "4000000"
      }
    ],
    "warnings": [
      "token metadata for CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7 could not be resolved; symbol falls back to the contract id and decimals to 7 (flagged resolved: false)",
      "token metadata for CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7 could not be resolved; symbol falls back to the contract id and decimals to 7 (flagged resolved: false)"
    ]
  },
  "constrainArguments": false
}
```

**result (truncated if long):**

```json
{
  "schemaVersion": 1,
  "report": "# policywright dry-run report\n\n| Scenario | Decision | Reason |\n| --- | --- | --- |\n| replay recorded flow | ✅ permit (permit) | within scope, lifetime, argument, spend cap, and frequency limits |\n| over the spend cap | ⛔ deny (spending-limit) | outflow of 1.1000001 CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7 exceeds the 1.1 cap per 86400s |\n| call to an unseen function | ⛔ deny (scope) | set_admin @ CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET is outside the context rule's scope |\n| call after rule expiry | ⛔ deny (lifetime) | call at 1792204388 is after the rule expires at 1792204387 |\n| over the frequency limit | ⛔ deny (frequency-limit) | this would be call 6 within 86400s, over the cap of 5 |\n",
  "results": [
    {
      "label": "replay recorded flow",
      "decision": "permit",
      "reasonCode": "permit",
      "reason": "within scope, lifetime, argument, spend cap, and frequency limits"
    },
    {
      "label": "over the spend cap",
      "decision": "deny",
      "reasonCode": "spending-limit",
      "reason": "outflow of 1.1000001 CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7 exceeds the 1.1 cap per 86400s"
    },
    {
      "label": "call to an unseen function",
      "decision": "deny",
      "reasonCode": "scope",
      "reason": "set_admin @ CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET is outside the context rule's scope"
    },
    {
      "label": "call after rule expiry",
      "decision": "deny",
      "reasonCode": "lifetime",
      "reason": "call at 1792204388 is after the rule expires at 1792204387"
    },
    {
      "label": "over the frequency limit",
      "decision": "deny",
      "reasonCode": "frequency-limit",
      "reason": "this would be call 6 within 86400s, over the cap of 5"
    }
  ],
  "constrainArguments": false
}
```

### tool: simulate
```json
{
  "recordedTx": {
    "hash": "af094330a3f86a500679fc011a847c000e5a6018c83a73c429496f54ee532445",
    "network": "testnet",
    "source": "rpc",
    "ledger": 4717760,
    "timestamp": 1789612387,
    "subject": "GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK",
    "calls": [
      {
        "contract": "CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET",
        "fnName": "deposit",
        "args": [
          "GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK",
          "10000000"
        ],
        "sourceHash": "af094330a3f86a500679fc011a847c000e5a6018c83a73c429496f54ee532445",
        "authorizations": [
          {
            "contract": "CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET",
            "fnName": "deposit",
            "args": [
              "GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK",
              "10000000"
            ],
            "subInvocations": [
              {
                "contract": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7",
                "fnName": "transfer",
                "args": [
                  "GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK",
                  "CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET",
                  "10000000"
                ],
                "subInvocations": []
              }
            ]
          }
        ]
      },
      {
        "contract": "CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET",
        "fnName": "withdraw",
        "args": [
          "GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK",
          "4000000"
        ],
        "sourceHash": "2f0a27b953635f9de1762bcf6133d62d432ea66ef32439509aa4b14768f4facf",
        "authorizations": [
          {
            "contract": "CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET",
            "fnName": "withdraw",
            "args": [
              "GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK",
              "4000000"
            ],
            "subInvocations": []
          }
        ]
      }
    ],
    "flows": [
      {
        "asset": {
          "contractId": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7",
          "symbol": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7",
          "decimals": 7,
          "resolved": false
        },
        "direction": "out",
        "amount": "10000000"
      },
      {
        "asset": {
          "contractId": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7",
          "symbol": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7",
          "decimals": 7,
          "resolved": false
        },
        "direction": "in",
        "amount": "4000000"
      }
    ],
    "warnings": [
      "token metadata for CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7 could not be resolved; symbol falls back to the contract id and decimals to 7 (flagged resolved: false)",
      "token metadata for CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7 could not be resolved; symbol falls back to the contract id and decimals to 7 (flagged resolved: false)"
    ]
  },
  "constrainArguments": true
}
```

**result (truncated if long):**

```json
{
  "schemaVersion": 1,
  "report": "# policywright dry-run report\n\n| Scenario | Decision | Reason |\n| --- | --- | --- |\n| replay recorded flow | ✅ permit (permit) | within scope, lifetime, argument, spend cap, and frequency limits |\n| over the spend cap | ⛔ deny (spending-limit) | outflow of 1.1000001 CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7 exceeds the 1.1 cap per 86400s |\n| call to an unseen function | ⛔ deny (scope) | set_admin @ CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET is outside the context rule's scope |\n| call after rule expiry | ⛔ deny (lifetime) | call at 1792204388 is after the rule expires at 1792204387 |\n| over the frequency limit | ⛔ deny (frequency-limit) | this would be call 6 within 86400s, over the cap of 5 |\n",
  "results": [
    {
      "label": "replay recorded flow",
      "decision": "permit",
      "reasonCode": "permit",
      "reason": "within scope, lifetime, argument, spend cap, and frequency limits"
    },
    {
      "label": "over the spend cap",
      "decision": "deny",
      "reasonCode": "spending-limit",
      "reason": "outflow of 1.1000001 CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7 exceeds the 1.1 cap per 86400s"
    },
    {
      "label": "call to an unseen function",
      "decision": "deny",
      "reasonCode": "scope",
      "reason": "set_admin @ CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET is outside the context rule's scope"
    },
    {
      "label": "call after rule expiry",
      "decision": "deny",
      "reasonCode": "lifetime",
      "reason": "call at 1792204388 is after the rule expires at 1792204387"
    },
    {
      "label": "over the frequency limit",
      "decision": "deny",
      "reasonCode": "frequency-limit",
      "reason": "this would be call 6 within 86400s, over the cap of 5"
    }
  ],
  "constrainArguments": true
}
```

### tool: verify
```json
{
  "contextRule": {
    "schemaVersion": 1,
    "generatedBy": "policywright",
    "target": {
      "package": "stellar-accounts (OpenZeppelin/stellar-contracts)",
      "version": "v0.7.2",
      "commit": "a9c42169000638da937577f592ebf61a7a3c94ca",
      "installEntryPoint": "SmartAccount::add_context_rule(context_type, name, valid_until, signers, policies: Map<Address, Val>) — packages/accounts/src/smart_account/mod.rs:238-248"
    },
    "source": {
      "network": "testnet",
      "recordedFrom": "rpc",
      "subject": "GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK",
      "ledger": 4717760,
      "sourceHashes": [
        "af094330a3f86a500679fc011a847c000e5a6018c83a73c429496f54ee532445",
        "2f0a27b953635f9de1762bcf6133d62d432ea66ef32439509aa4b14768f4facf"
      ]
    },
    "ledgerTimeBasis": {
      "estimatedSecsPerLedger": 5,
      "note": "every *_ledgers and validUntilLedger value was converted from configured seconds at this estimated rate; recompute validUntilLedger from the live ledger head at install"
    },
    "contextRules": [
      {
        "contextType": {
          "type": "CallContract",
          "contract": "CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET"
        },
        "name": "pw:deposit+withdraw",
        "validUntilLedger": 5236160,
        "signers": [],
        "observedFns": [
          "deposit",
          "withdraw"
        ],
        "policies": [
          {
            "policy": "custom:FrequencyLimitPolicy",
            "address": null,
            "installParams": {
              "window_secs": 86400,
              "max_calls": 5
            },
            "paramsSource": "policywright-generated FrequencyLimitPolicy (contracts/frequency-limit-policy, emitted by src/rust-policy.ts) — FrequencyLimitParams { window_secs: u64, max_calls: u32 }"
          }
        ]
      },
      {
        "contextType": {
          "type": "CallContract",
          "contract": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7"
        },
        "name": "pw:xfer:CDOEGWQS",
        "validUntilLedger": 5236160,
        "signers": [],
        "observedFns": [
          "transfer"
        ],
        "policies": [
          {
            "policy": "stock:spending_limit",
            "address": null,
            "installParams": {
              "spending_limit": "11000000",
              "period_ledgers": 17280
            },
            "paramsSource": "OpenZeppelin/stellar-contracts@v0.7.2 packages/accounts/src/policies/spending_limit.rs:88-94 — SpendingLimitAccountParams { spending_limit: i128, period_ledgers: u32 }; install guards :367-405 (CallContract-only, positive params, AlreadyInstalled)",
            "derivedFrom": {
              "asset": {
                "contractId": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7",
                "symbol": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7",
                "decimals": 7,
                "resolved": false
              },
              "observedGrossOut": "10000000",
              "spendWindowSecs": 86400
            }
          }
        ]
      }
    ],
    "notes": [
      "spend windows are measured in LEDGERS on-chain: 86400s → 17280 ledgers at an estimated 5s/ledger (spending_limit.rs:88-94; OZ's own DAY_IN_LEDGERS = 17280 = 86400s at this rate).",
      "spending_limit is asset-blind: it meters whatever transfer amounts pass through its rule, so the metered token is the rule's CallContract target (one instance per token rule).",
      "valid_until is a LEDGER SEQUENCE, not a Unix time (storage.rs:282; RECONCILIATION row 15): emitted 5236160 = recording ledger 4717760 + 518400 ledgers (2592000s at 5s/ledger). Recompute from the live ledger head at install — the recording ledger is in the past.",
      "context rules cannot carry function names (matching is contract-level — storage.rs:289-304; RECONCILIATION rows 13-14): observedFns is advisory. Function-level narrowing must live in a policy's enforce; that codegen is Tranche 2 (docs/T2-NOTES.md).",
      "emitted rules carry no signers: attach the smart account's signer(s) at install. add_context_rule requires at least one signer or policy per rule (mod.rs:20-21), and stock spending_limit::enforce rejects when no signers authenticated (spending_limit.rs:232-234)."
    ],
    "config": {
      "lifetimeSecs": 2592000,
      "spendWindowSecs": 86400,
      "capMultiplier": 1.1,
      "frequencyWindowSecs": 86400,
      "frequencyMaxCalls": 5,
      "constrainArguments": false
    }
  },
  "onChainSnapshot": {
    "schemaVersion": 1,
    "smartAccount": "CCW6R5ZKEIJJ75YT54TEHMRUYTP4XQGUI6H63EE3W65H4P4FAUICXP3Q",
    "network": "testnet",
    "ledger": 4336170,
    "contextRules": [
      {
        "id": 1,
        "name": "pw:swap",
        "contextType": {
          "type": "CallContract",
          "contract": "CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD"
        },
        "validUntilLedger": 4336170,
        "policies": [
          {
            "address": "C0000AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            "policy": "custom:FrequencyLimitPolicy",
            "installParams": {
              "window_secs": 86400,
              "max_calls": 5
            }
          }
        ]
      },
      {
        "id": 2,
        "name": "pw:harvest",
        "contextType": {
          "type": "CallContract",
          "contract": "CCSLYYVQ575EAPCDOEYGVOI4NVYD2V7RP3F5HRP4LVDUWEJ4HOLVL357"
        },
        "validUntilLedger": 4336170,
        "policies": [
          {
            "address": "C0100AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            "policy": "custom:FrequencyLimitPolicy",
            "installParams": {
              "window_secs": 86400,
              "max_calls": 5
            }
          }
        ]
      },
      {
        "id": 3,
        "name": "pw:xfer:native",
        "contextType": {
          "type": "CallContract",
          "contract": "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"
        },
        "validUntilLedger": 4336170,
        "policies": [
          {
            "address": "C0200AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            "policy": "stock:spending_limit",
            "installParams": {
              "spending_limit": "999",
              "period_ledgers": 17280
            }
          }
        ]
      }
    ],
    "source": "fixture"
  }
}
```

**result (truncated if long):**

```json
{
  "schemaVersion": 1,
  "ok": false,
  "diffs": [
    {
      "path": "contextRules[0]",
      "expected": "CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET",
      "actual": null,
      "message": "emitted rule \"pw:deposit+withdraw\" (CallContract CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET) not found on-chain"
    },
    {
      "path": "contextRules[1]",
      "expected": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7",
      "actual": null,
      "message": "emitted rule \"pw:xfer:CDOEGWQS\" (CallContract CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7) not found on-chain"
    },
    {
      "path": "onChain.extra(pw:swap)",
      "expected": null,
      "actual": "CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD",
      "message": "on-chain rule CallContract(CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD) not present in emitted spec"
    },
    {
      "path": "onChain.extra(pw:harvest)",
      "expected": null,
      "actual": "CCSLYYVQ575EAPCDOEYGVOI4NVYD2V7RP3F5HRP4LVDUWEJ4HOLVL357",
      "message": "on-chain rule CallContract(CCSLYYVQ575EAPCDOEYGVOI4NVYD2V7RP3F5HRP4LVDUWEJ4HOLVL357) not present in emitted spec"
    },
    {
      "path": "onChain.extra(pw:xfer:native)",
      "expected": null,
      "actual": "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
      "message": "on-chain rule CallContract(CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC) not present in emitted spec"
    }
  ],
  "matchedRules": 0,
  "expectedRuleCount": 2,
  "actualRuleCount": 3
}
```

### tool: verify
```json
{
  "contextRule": {
    "schemaVersion": 1,
    "generatedBy": "policywright",
    "target": {
      "package": "stellar-accounts (OpenZeppelin/stellar-contracts)",
      "version": "v0.7.2",
      "commit": "a9c42169000638da937577f592ebf61a7a3c94ca",
      "installEntryPoint": "SmartAccount::add_context_rule(context_type, name, valid_until, signers, policies: Map<Address, Val>) — packages/accounts/src/smart_account/mod.rs:238-248"
    },
    "source": {
      "network": "testnet",
      "recordedFrom": "rpc",
      "subject": "GCODZM35QUK7HD4JODIBMRTK7DOTF2AVNIPPYIYYPRJFJCNH6CMWVZAK",
      "ledger": 4717760,
      "sourceHashes": [
        "af094330a3f86a500679fc011a847c000e5a6018c83a73c429496f54ee532445",
        "2f0a27b953635f9de1762bcf6133d62d432ea66ef32439509aa4b14768f4facf"
      ]
    },
    "ledgerTimeBasis": {
      "estimatedSecsPerLedger": 5,
      "note": "every *_ledgers and validUntilLedger value was converted from configured seconds at this estimated rate; recompute validUntilLedger from the live ledger head at install"
    },
    "contextRules": [
      {
        "contextType": {
          "type": "CallContract",
          "contract": "CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET"
        },
        "name": "pw:deposit+withdraw",
        "validUntilLedger": 5236160,
        "signers": [],
        "observedFns": [
          "deposit",
          "withdraw"
        ],
        "policies": [
          {
            "policy": "custom:FrequencyLimitPolicy",
            "address": null,
            "installParams": {
              "window_secs": 86400,
              "max_calls": 5
            },
            "paramsSource": "policywright-generated FrequencyLimitPolicy (contracts/frequency-limit-policy, emitted by src/rust-policy.ts) — FrequencyLimitParams { window_secs: u64, max_calls: u32 }"
          }
        ]
      },
      {
        "contextType": {
          "type": "CallContract",
          "contract": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7"
        },
        "name": "pw:xfer:CDOEGWQS",
        "validUntilLedger": 5236160,
        "signers": [],
        "observedFns": [
          "transfer"
        ],
        "policies": [
          {
            "policy": "stock:spending_limit",
            "address": null,
            "installParams": {
              "spending_limit": "11000000",
              "period_ledgers": 17280
            },
            "paramsSource": "OpenZeppelin/stellar-contracts@v0.7.2 packages/accounts/src/policies/spending_limit.rs:88-94 — SpendingLimitAccountParams { spending_limit: i128, period_ledgers: u32 }; install guards :367-405 (CallContract-only, positive params, AlreadyInstalled)",
            "derivedFrom": {
              "asset": {
                "contractId": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7",
                "symbol": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7",
                "decimals": 7,
                "resolved": false
              },
              "observedGrossOut": "10000000",
              "spendWindowSecs": 86400
            }
          }
        ]
      }
    ],
    "notes": [
      "spend windows are measured in LEDGERS on-chain: 86400s → 17280 ledgers at an estimated 5s/ledger (spending_limit.rs:88-94; OZ's own DAY_IN_LEDGERS = 17280 = 86400s at this rate).",
      "spending_limit is asset-blind: it meters whatever transfer amounts pass through its rule, so the metered token is the rule's CallContract target (one instance per token rule).",
      "valid_until is a LEDGER SEQUENCE, not a Unix time (storage.rs:282; RECONCILIATION row 15): emitted 5236160 = recording ledger 4717760 + 518400 ledgers (2592000s at 5s/ledger). Recompute from the live ledger head at install — the recording ledger is in the past.",
      "context rules cannot carry function names (matching is contract-level — storage.rs:289-304; RECONCILIATION rows 13-14): observedFns is advisory. Function-level narrowing must live in a policy's enforce; that codegen is Tranche 2 (docs/T2-NOTES.md).",
      "emitted rules carry no signers: attach the smart account's signer(s) at install. add_context_rule requires at least one signer or policy per rule (mod.rs:20-21), and stock spending_limit::enforce rejects when no signers authenticated (spending_limit.rs:232-234)."
    ],
    "config": {
      "lifetimeSecs": 2592000,
      "spendWindowSecs": 86400,
      "capMultiplier": 1.1,
      "frequencyWindowSecs": 86400,
      "frequencyMaxCalls": 5,
      "constrainArguments": false
    }
  },
  "onChainSnapshot": {
    "schemaVersion": 1,
    "network": "testnet",
    "smartAccount": "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2LUM",
    "ledger": 4718000,
    "source": "fixture",
    "contextRules": [
      {
        "id": 1,
        "name": "pw:deposit+withdraw",
        "contextType": {
          "type": "CallContract",
          "contract": "CCJSSLAEVUEE2G5MEPGTN4C4RZKC3QMERU2VWUHET6DFQ6BPEYXW5MET"
        },
        "validUntilLedger": 5236160,
        "policies": [
          {
            "address": "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4S",
            "policy": "custom:FrequencyLimitPolicy",
            "installParams": {
              "window_secs": 86400,
              "max_calls": 5
            }
          }
        ]
      },
      {
        "id": 2,
        "name": "pw:xfer:CDOEGWQS",
        "contextType": {
          "type": "CallContract",
          "contract": "CDOEGWQSTV4FEY344WTANJKH7OWSOCIBOIAF2N5EHKS7RO33XMKX5TD7"
        },
        "validUntilLedger": 5236160,
        "policies": [
          {
            "address": "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4S",
            "policy": "stock:spending_limit",
            "installParams": {
              "spending_limit": "11000000",
              "period_ledgers": 17280
            }
          }
        ]
      }
    ]
  }
}
```

**result (truncated if long):**

```json
{
  "schemaVersion": 1,
  "ok": true,
  "diffs": [],
  "matchedRules": 2,
  "expectedRuleCount": 2,
  "actualRuleCount": 2
}
```
