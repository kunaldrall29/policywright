/**
 * policywright × walras — paid `synthesize` MCP tool (integration spike).
 *
 * What this is: the first, deliberately minimal slice of the Tranche 2
 * "MCP server" deliverable (docs/T2-NOTES.md — tools record / synthesize /
 * simulate / verify), built early so policywright can run as a REAL paid
 * MCP tool behind the walras x402 facilitator on Stellar testnet. It is
 * NOT the T2 deliverable: one tool, no Claude skill, no wallet
 * integration. T2's tracker rows stay "Not started" on main; this lives
 * on the walras-x402-integration branch until T2 lands properly.
 *
 * Provenance rule (walras session S6, G6.2): policywright code stays in
 * this repository. Everything payment-shaped below is the stock SDK —
 * `createPaymentWrapper` from `@x402/mcp` (verify → execute → settle per
 * the MCP transport spec), `x402ResourceServer` + `HTTPFacilitatorClient`
 * from `@x402/core` pointed at a walras facilitator, the server-side
 * `ExactStellarScheme`, and `declareDiscoveryExtension` from
 * `@x402/extensions/bazaar`, whose settle-time echo is what catalogs this
 * tool in the walras Bazaar under the (resource.url, toolName) tuple.
 * No walras source is imported, and no registration call exists anywhere:
 * the tool is listed by its first settled payment, or not at all.
 *
 * The tool itself wraps policywright's pure pipeline — parseRecordedJson →
 * synthesize → emit — which does no I/O, no network, and no clock reads
 * (`now` is a parameter), so a paid call is deterministic: identical
 * inputs return identical bytes.
 */
import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { ExactStellarScheme } from "@x402/stellar/exact/server";
import { createPaymentWrapper } from "@x402/mcp";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";

import { parseRecordedJson } from "../../src/sources/recorded.js";
import { synthesize, validateConfig } from "../../src/synthesizer.js";
import { emit } from "../../src/emitter.js";
import { DEFAULT_SYNTH_CONFIG, type SynthConfig } from "../../src/types.js";

const FACILITATOR_URL = process.env.FACILITATOR_URL ?? "http://127.0.0.1:4021";
const PAY_TO = process.env.PW_PAYTO_ADDRESS;
const PORT = Number(process.env.PW_MCP_PORT ?? 4024);
const PRICE = process.env.PW_PRICE ?? "$0.05";
const RESOURCE_URL = `http://127.0.0.1:${PORT}/mcp`;

if (!PAY_TO) {
  console.error(
    "PW_PAYTO_ADDRESS is required — the policywright-owned G... account payments settle to " +
      "(create one with: npm run setup-payto)",
  );
  process.exit(1);
}

const resourceServer = new x402ResourceServer([
  new HTTPFacilitatorClient({ url: FACILITATOR_URL }),
]);
resourceServer.register("stellar:*", new ExactStellarScheme());
// The facilitator's /supported kinds must be fetched first —
// buildPaymentRequirements refuses kinds no facilitator has advertised,
// so the walras facilitator must be up before this process boots.
await resourceServer.initialize();

const accepts = await resourceServer.buildPaymentRequirements({
  scheme: "exact",
  network: "stellar:testnet",
  payTo: PAY_TO,
  price: PRICE,
});

/**
 * Discovery metadata. These per-parameter descriptions are the search
 * corpus an agent's natural-language query lands on — they describe what
 * the code actually does with each field, nothing more.
 */
const INPUT_SCHEMA = {
  type: "object",
  properties: {
    recordedTx: {
      type: "object",
      description:
        "A recorded Soroban transaction: the JSON document policywright's record command " +
        "produces. Fields: network ('testnet'|'mainnet'|'futurenet'), source " +
        "('fixture'|'rpc'|'simulation'), hash and ledger and timestamp of the recorded " +
        "transaction (nullable), subject (the G.../C... account the flows are attributed " +
        "to, nullable), a non-empty calls array ({contract, fnName, args, sourceHash, " +
        "authorizations}), a flows array of observed asset movements ({asset {contractId, " +
        "symbol, decimals, resolved}, direction 'in'|'out', amount as a decimal string in " +
        "stroops-style base units}), and a warnings array from the recorder. The " +
        "synthesized authorization covers exactly the contract calls and outflows observed " +
        "in this document.",
    },
    config: {
      type: "object",
      description:
        "Optional overrides for the synthesis defaults; omitted fields keep policywright's " +
        "documented defaults.",
      properties: {
        lifetimeSecs: {
          type: "integer",
          description:
            "Context-rule lifetime in seconds; valid-until = synthesis time + this. " +
            "Default 2592000 (30 days).",
        },
        spendWindowSecs: {
          type: "integer",
          description:
            "Rolling window, in seconds, each spending cap is measured over. Default 86400.",
        },
        capMultiplier: {
          type: "number",
          description:
            "Headroom multiplier applied to each asset's observed gross outflow to set its " +
            "spending cap. Default 1.1.",
        },
        frequencyWindowSecs: {
          type: "integer",
          description:
            "Rolling window, in seconds, for the frequency-limit policy. Default 86400.",
        },
        frequencyMaxCalls: {
          type: "integer",
          description: "Maximum calls permitted inside the frequency window. Default 5.",
        },
        constrainArguments: {
          type: "boolean",
          description:
            "When true, also derive allow-list constraints on observed swap-path arguments. " +
            "Default false — unobserved routes are then flagged as advisory, not denied.",
        },
      },
    },
    now: {
      type: "integer",
      description:
        "Unix seconds used as the synthesis time for the rule's validity horizon. Defaults " +
        "to the recorded transaction's own timestamp (or 0), so identical inputs produce " +
        "identical output.",
    },
  },
  required: ["recordedTx"],
};

/** Minimal valid RecordedTx — small enough for the discovery example, real enough to run. */
const EXAMPLE_INPUT = {
  recordedTx: {
    hash: null,
    network: "testnet",
    source: "simulation",
    ledger: null,
    timestamp: 1755100800,
    subject: null,
    calls: [
      {
        contract: "CCFZSK3W5W54JT2QPLBDDQ5W4JEIVBG3PUFONKE5YOMS52L6GQIPIV4V",
        fnName: "claim",
        args: [],
        sourceHash: null,
        authorizations: [],
      },
    ],
    flows: [],
    warnings: [],
  },
};

const paid = createPaymentWrapper(resourceServer, {
  accepts,
  resource: {
    url: RESOURCE_URL,
    description:
      "Synthesizes a least-privilege OpenZeppelin smart-account authorization from a " +
      "recorded Soroban transaction: a context rule scoped to the observed contract " +
      "calls, spending-limit and frequency-limit policies derived from the observed " +
      "asset flows, and installable OpenZeppelin context rules with install parameters.",
    mimeType: "application/json",
    serviceName: "Policywright",
    tags: ["soroban", "smart-account", "authorization", "least-privilege", "openzeppelin"],
  },
  extensions: declareDiscoveryExtension({
    toolName: "synthesize",
    description:
      "Turn a transaction a user already performed (or simulated) into the " +
      "least-privilege smart-account authorization that permits exactly that flow — " +
      "a context rule plus the minimum set of policies, with a dry-run report.",
    inputSchema: INPUT_SCHEMA,
    example: EXAMPLE_INPUT,
    output: {
      example: {
        spec: {
          contextRule: {
            name: "pw:claim",
            scopedCalls: [
              {
                contract: "CCFZSK3W5W54JT2QPLBDDQ5W4JEIVBG3PUFONKE5YOMS52L6GQIPIV4V",
                fnName: "claim",
              },
            ],
            validUntil: 1757692800,
          },
          policies: [{ kind: "frequency-limit", windowSecs: 86400, maxCalls: 5 }],
        },
        summary: "policywright — synthesized smart-account authorization …",
      },
    },
  } as Parameters<typeof declareDiscoveryExtension>[0]),
});

const ConfigShape = z
  .object({
    lifetimeSecs: z.number().int().optional(),
    spendWindowSecs: z.number().int().optional(),
    capMultiplier: z.number().optional(),
    frequencyWindowSecs: z.number().int().optional(),
    frequencyMaxCalls: z.number().int().optional(),
    constrainArguments: z.boolean().optional(),
  })
  .optional();

function makeMcpServer(): McpServer {
  const mcp = new McpServer({ name: "policywright", version: "0.1.0" });
  mcp.registerTool(
    "synthesize",
    {
      description:
        "Synthesize a least-privilege OpenZeppelin smart-account authorization from a " +
        `recorded Soroban transaction (${PRICE})`,
      inputSchema: {
        recordedTx: z.record(z.unknown()),
        config: ConfigShape,
        now: z.number().int().optional(),
      },
    },
    paid(
      async (args: {
        recordedTx: Record<string, unknown>;
        config?: Partial<SynthConfig>;
        now?: number;
      }) => {
        try {
          const tx = parseRecordedJson(args.recordedTx);
          const config: SynthConfig = { ...DEFAULT_SYNTH_CONFIG, ...(args.config ?? {}) };
          validateConfig(config);
          const now = args.now ?? tx.timestamp ?? 0;
          const spec = synthesize(tx, config, now);
          const artifacts = emit(tx, spec);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  spec: JSON.parse(artifacts.specJson),
                  contextRule: JSON.parse(artifacts.contextRuleJson),
                  summary: artifacts.summary,
                  rustPolicy: artifacts.rustPolicy,
                }),
              },
            ],
          };
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "policywright_synth_failed",
                  reason: error instanceof Error ? error.message : String(error),
                }),
              },
            ],
          };
        }
      },
    ),
  );
  return mcp;
}

// Stateless streamable-HTTP hosting: one server+transport pair per request.
const app = express();
app.use(express.json({ limit: "1mb" }));
app.post("/mcp", (req, res) => {
  void (async () => {
    const mcp = makeMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
      void mcp.close();
    });
    await mcp.connect(transport);
    await transport.handleRequest(req, res, req.body);
  })().catch(error => {
    console.error("policywright-walras-x402 request failed:", error);
    if (!res.headersSent) res.status(500).json({ error: "internal error" });
  });
});

app.listen(PORT, () => {
  console.log(
    `policywright-walras-x402 listening on :${PORT} — paid tool "synthesize" at ` +
      `${RESOURCE_URL}, ${PRICE}, payTo ${PAY_TO}, facilitator ${FACILITATOR_URL}`,
  );
});
