/**
 * Core domain types for policywright.
 *
 * The pipeline is: a {@link RecordedTx} (captured from a fixture or the live RPC
 * adapter) is fed to the synthesizer, which produces a {@link SmartAccountSpec}
 * (an OpenZeppelin smart-account context rule plus a minimal set of policies).
 * The dry-run simulator then evaluates candidate calls against that spec.
 *
 * This module is the single source of truth for those shapes; every other module
 * imports from here. Keep it free of behaviour.
 */

/** Stellar networks we recognise. The live adapter only supports public networks. */
export type Network = 'testnet' | 'mainnet' | 'futurenet';

/**
 * A native-decoded Soroban contract argument.
 *
 * Mirrors what `scValToNative` produces: addresses/symbols/strings become
 * `string`, small ints become `number`, 64-bit-and-wider ints become `bigint`,
 * vectors become arrays, maps become objects, and raw bytes become `Uint8Array`.
 */
export type CallArg =
  | string
  | number
  | bigint
  | boolean
  | null
  | Uint8Array
  | readonly CallArg[]
  | { readonly [key: string]: CallArg };

/**
 * A reference to a token (a Soroban contract, typically a Stellar Asset Contract).
 *
 * `symbol`/`decimals` are resolved from on-chain SAC metadata when feasible. When
 * resolution is not possible (e.g. RPC unavailable, non-SAC token) the adapter
 * falls back to a best-effort label and sets `resolved` to `false` so downstream
 * output can say so explicitly rather than presenting a guess as fact.
 */
export interface TokenRef {
  /** The token's Soroban contract id (`C...`). */
  readonly contractId: string;
  /** Human-readable symbol, e.g. `USDC`. */
  readonly symbol: string;
  /** Token decimals (SEP-41 `decimals()`); 7 is the Stellar default. */
  readonly decimals: number;
  /** Whether `symbol`/`decimals` came from real metadata vs. a fallback. */
  readonly resolved: boolean;
}

/** A single observed contract invocation, scoped to a contract + function. */
export interface ScopedCall {
  /** Invoked contract address (`C...`). */
  readonly contract: string;
  /** Invoked function name (the Soroban symbol). */
  readonly fnName: string;
  /** Native-decoded arguments, in positional order. */
  readonly args: readonly CallArg[];
}

/** Direction of value movement relative to the smart account. */
export type FlowDirection = 'in' | 'out';

/** A single token movement into or out of the smart account during the tx. */
export interface AssetFlow {
  readonly asset: TokenRef;
  readonly direction: FlowDirection;
  /** Amount in the token's smallest unit (stroops-equivalent), always positive. */
  readonly amount: bigint;
}

/** Where a {@link RecordedTx} came from. */
export type RecordedTxSource = 'fixture' | 'rpc';

/**
 * A normalised record of a transaction the user already performed (or simulated).
 * This is the synthesizer's only input about what happened on-chain.
 */
export interface RecordedTx {
  /** Transaction hash (hex). */
  readonly hash: string;
  readonly network: Network;
  readonly source: RecordedTxSource;
  /** Ledger sequence the tx was applied in, when known. */
  readonly ledger: number | null;
  /** Unix seconds the tx was applied, when known. */
  readonly timestamp: number | null;
  /** Distinct contract calls observed, in invocation order. */
  readonly calls: readonly ScopedCall[];
  /** Token movements observed, derived from contract (transfer) events. */
  readonly flows: readonly AssetFlow[];
}

/**
 * Knobs that shape synthesis. All have documented defaults
 * (see {@link DEFAULT_SYNTH_CONFIG}); the CLI exposes each as a flag.
 */
export interface SynthConfig {
  /** Context-rule lifetime in seconds (sets `valid_until` = synth time + this). */
  readonly lifetimeSecs: number;
  /** Rolling window, in seconds, the spend cap is measured over. */
  readonly spendWindowSecs: number;
  /** Multiplier applied to observed gross outflow to set each spend cap. */
  readonly capMultiplier: number;
  /** Rolling window, in seconds, for the frequency-limit policy. */
  readonly frequencyWindowSecs: number;
  /** Maximum calls permitted within {@link frequencyWindowSecs}. */
  readonly frequencyMaxCalls: number;
  /**
   * When `true`, derive constraints on observed call arguments (the Soroswap
   * swap `path`). When `false`, arguments are unconstrained and unobserved-asset
   * routes are flagged rather than denied (preserves the v0 behaviour).
   */
  readonly constrainArguments: boolean;
}

/** OpenZeppelin smart accounts cap a context rule at this many policies. */
export const MAX_POLICIES = 5;

/** Default synthesis configuration. Conservative but demo-friendly. */
export const DEFAULT_SYNTH_CONFIG: SynthConfig = {
  lifetimeSecs: 30 * 24 * 60 * 60, // 30 days
  spendWindowSecs: 24 * 60 * 60, // 1 day
  capMultiplier: 1.1, // 10% headroom over observed gross outflow
  frequencyWindowSecs: 24 * 60 * 60, // 1 day
  frequencyMaxCalls: 5,
  constrainArguments: false,
};

/** Discriminant tags for the policy union. */
export type PolicyKind = 'spending-limit' | 'frequency-limit' | 'argument-constraint';

/**
 * Bounds gross outflow of a single asset over a rolling window. Mirrors OZ's
 * `spending_limit` building block.
 */
export interface SpendingLimitPolicy {
  readonly kind: 'spending-limit';
  readonly asset: TokenRef;
  /** Cap in the asset's smallest unit, over `windowSecs`. */
  readonly cap: bigint;
  readonly windowSecs: number;
  /** Observed gross outflow the cap was derived from (for transparency). */
  readonly observedGrossOut: bigint;
}

/**
 * Bounds how often the scoped calls may run within a rolling window. Emitted as
 * the illustrative custom Rust policy.
 */
export interface FrequencyLimitPolicy {
  readonly kind: 'frequency-limit';
  readonly windowSecs: number;
  readonly maxCalls: number;
}

/**
 * Constrains a positional argument of a specific call to an observed allow-set.
 * Currently used for the Soroswap swap `path`. Only emitted when
 * {@link SynthConfig.constrainArguments} is enabled.
 */
export interface ArgumentConstraintPolicy {
  readonly kind: 'argument-constraint';
  /** Contract the constraint applies to. */
  readonly contract: string;
  /** Function the constraint applies to. */
  readonly fnName: string;
  /** Zero-based index of the constrained argument. */
  readonly argIndex: number;
  /** Human label for the argument (e.g. `path`). */
  readonly argName: string;
  /**
   * Allowed token contract ids observed for this argument. A candidate call
   * routing through any address outside this set is denied.
   */
  readonly allowedTokens: readonly string[];
}

/** The synthesised policy set. */
export type PolicySpec = SpendingLimitPolicy | FrequencyLimitPolicy | ArgumentConstraintPolicy;

/** The scope of the context rule: which (contract, fn) pairs are permitted. */
export interface ContextRule {
  /** Short human-readable rule name (OZ caps names at 20 chars). */
  readonly name: string;
  /** Exact (contract, fn) pairs the rule authorises. */
  readonly scopedCalls: readonly { readonly contract: string; readonly fnName: string }[];
  /** Unix seconds after which the rule is invalid (synth time + lifetime). */
  readonly validUntil: number;
}

/** The synthesised least-privilege authorization for a recorded transaction. */
export interface SmartAccountSpec {
  readonly contextRule: ContextRule;
  readonly policies: readonly PolicySpec[];
  /** Non-fatal advisories surfaced to the user (e.g. policy-count over the cap). */
  readonly warnings: readonly string[];
  /** The config the spec was synthesised with (echoed for reproducibility). */
  readonly config: SynthConfig;
}

/** The outcome of a dry-run evaluation of one candidate call. */
export type SimulationDecision = 'permit' | 'deny' | 'flag';

/** A candidate call to evaluate against a spec in the dry run. */
export interface CandidateCall {
  /** Label shown in reports. */
  readonly label: string;
  readonly contract: string;
  readonly fnName: string;
  readonly args: readonly CallArg[];
  /** Outflows this candidate would cause, by token contract id. */
  readonly outflows: readonly AssetFlow[];
  /** Unix seconds the candidate would execute at. */
  readonly timestamp: number;
  /**
   * Prior call timestamps (Unix seconds) within scope, used to evaluate the
   * frequency policy. Excludes the candidate itself.
   */
  readonly priorCallTimestamps: readonly number[];
}

/** Result of evaluating a {@link CandidateCall}. */
export interface SimulationResult {
  readonly label: string;
  readonly decision: SimulationDecision;
  /** The policy/rule that produced the decision (e.g. `scope`, `spending-limit`). */
  readonly reasonCode: string;
  /** Human-readable explanation. */
  readonly reason: string;
}
