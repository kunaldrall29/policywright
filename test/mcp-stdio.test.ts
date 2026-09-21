/**
 * Network-free MCP stdio tests: spawn the server, call all four tools against
 * committed fixtures, assert schemas / outputs / error codes.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MCP_SCHEMA_VERSION, TOOL_OUTPUT_FIELDS, UNAUDITED_BANNER } from '../src/mcp/schemas.js';

/** Saved recorder output (not the raw bake-in fixture file — that needs loadFixture()). */
const RECORDED_TX = JSON.parse(
  readFileSync('examples/live/recorded-claim-swap.json', 'utf8'),
) as unknown;
const LIVE_CONTEXT_RULE = JSON.parse(
  readFileSync('examples/live/context-rule.json', 'utf8'),
) as unknown;

function parseToolJson(result: {
  content: { type: string; text?: string }[];
  isError?: boolean;
  structuredContent?: unknown;
}): Record<string, unknown> {
  if (result.structuredContent !== undefined && result.structuredContent !== null) {
    return result.structuredContent as Record<string, unknown>;
  }
  const text = result.content.find((c) => c.type === 'text')?.text;
  if (text === undefined) {
    throw new Error('tool result had no text content');
  }
  return JSON.parse(text) as Record<string, unknown>;
}

describe('MCP stdio server (four tools, network-free)', () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: 'npx',
      args: ['tsx', 'src/mcp/server.ts'],
      cwd: process.cwd(),
      stderr: 'pipe',
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
        ),
        STELLAR_RPC_URL: '',
      },
    });
    client = new Client({ name: 'policywright-test', version: '0.0.0' });
    await client.connect(transport);
  }, 60_000);

  afterAll(async () => {
    await client.close();
    await transport.close();
  });

  it('lists exactly the four tools and never install/deploy/prepare_install', async () => {
    const listed = await client.listTools();
    const names = listed.tools.map((t) => t.name).sort();
    expect(names).toEqual(['record', 'simulate', 'synthesize', 'verify']);
    for (const banned of ['prepare_install', 'install', 'deploy', 'prepare-install']) {
      expect(names).not.toContain(banned);
    }
    expect(listed.tools).toHaveLength(4);
  });

  it('record accepts an inline RecordedTx (no network)', async () => {
    const raw = await client.callTool({
      name: 'record',
      arguments: { recordedTx: RECORDED_TX },
    });
    expect(raw.isError).not.toBe(true);
    const body = parseToolJson(raw as never);
    expect(body['schemaVersion']).toBe(MCP_SCHEMA_VERSION);
    for (const field of TOOL_OUTPUT_FIELDS.record) {
      expect(body).toHaveProperty(field);
    }
    const tx = body['recordedTx'] as { source: string };
    expect(tx.source).toBe('rpc');
  });

  it('synthesize returns notes/warnings + UNAUDITED banner', async () => {
    const raw = await client.callTool({
      name: 'synthesize',
      arguments: {},
    });
    expect(raw.isError).not.toBe(true);
    const body = parseToolJson(raw as never);
    expect(body['schemaVersion']).toBe(MCP_SCHEMA_VERSION);
    for (const field of TOOL_OUTPUT_FIELDS.synthesize) {
      expect(body).toHaveProperty(field);
    }
    expect(body['unauditedBanner']).toBe(UNAUDITED_BANNER);
    expect(Array.isArray(body['notes'])).toBe(true);
    expect(Array.isArray(body['warnings'])).toBe(true);
    expect(String(body['rustPolicy'])).toMatch(/UNAUDITED|ILLUSTRATIVE/);
    const contextRule = body['contextRule'] as { contextRules: unknown[] };
    expect(contextRule.contextRules.length).toBeGreaterThan(0);
  });

  it('simulate returns permit/deny/flag results from the fixture', async () => {
    const raw = await client.callTool({
      name: 'simulate',
      arguments: { constrainArguments: false },
    });
    expect(raw.isError).not.toBe(true);
    const body = parseToolJson(raw as never);
    expect(body['schemaVersion']).toBe(MCP_SCHEMA_VERSION);
    for (const field of TOOL_OUTPUT_FIELDS.simulate) {
      expect(body).toHaveProperty(field);
    }
    const results = body['results'] as { decision: string }[];
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.decision === 'permit')).toBe(true);
  });

  it('verify passes against the committed matching on-chain snapshot', async () => {
    const raw = await client.callTool({
      name: 'verify',
      arguments: {
        contextRule: LIVE_CONTEXT_RULE,
        onChainSnapshotPath: 'fixtures/verify/on-chain-snapshot-match.json',
      },
    });
    expect(raw.isError).not.toBe(true);
    const body = parseToolJson(raw as never);
    expect(body['schemaVersion']).toBe(MCP_SCHEMA_VERSION);
    for (const field of TOOL_OUTPUT_FIELDS.verify) {
      expect(body).toHaveProperty(field);
    }
    expect(body['ok']).toBe(true);
    expect(body['diffs']).toEqual([]);
  });

  it('verify reports ok=false (not a transport error) on mismatch snapshot', async () => {
    const raw = await client.callTool({
      name: 'verify',
      arguments: {
        contextRulePath: 'examples/live/context-rule.json',
        onChainSnapshotPath: 'fixtures/verify/on-chain-snapshot-mismatch.json',
      },
    });
    expect(raw.isError).not.toBe(true);
    const body = parseToolJson(raw as never);
    expect(body['ok']).toBe(false);
    const diffs = body['diffs'] as unknown[];
    expect(diffs.length).toBeGreaterThan(0);
  });

  it('verify returns BAD_INPUT error code when snapshot is missing', async () => {
    const raw = await client.callTool({
      name: 'verify',
      arguments: { contextRule: LIVE_CONTEXT_RULE },
    });
    expect(raw.isError).toBe(true);
    const body = parseToolJson(raw as never);
    expect(body['ok']).toBe(false);
    expect(body['code']).toBe('BAD_INPUT');
    expect(body['schemaVersion']).toBe(MCP_SCHEMA_VERSION);
  });

  it('record returns BAD_INPUT when hashes are empty and no recordedTx', async () => {
    const raw = await client.callTool({
      name: 'record',
      arguments: { hashes: [] },
    });
    expect(raw.isError).toBe(true);
    const body = parseToolJson(raw as never);
    expect(body['code']).toBe('BAD_INPUT');
  });
});
