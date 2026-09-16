import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  assembleRecording,
  decodeTx,
  decodedTxInputFromCapture,
  fallbackToken,
} from '../src/sources/decode.js';
import { toolRecord } from '../src/mcp/tools.js';
import { toMcpError } from '../src/mcp/errors.js';

function run(args: string[]): string {
  const r = spawnSync('npx', ['tsx', 'src/cli.ts', ...args], {
    encoding: 'utf8',
    cwd: new URL('..', import.meta.url).pathname,
  });
  return `${r.stderr ?? ''}${r.stdout ?? ''}`.trim();
}

const lines: string[] = [];

lines.push('## garbage hash', run(['record', 'not-a-hash', '--network', 'testnet']), '');
lines.push('## nonexistent 64-hex', run(['record', 'a'.repeat(64), '--network', 'testnet']), '');
lines.push('## empty sequence', run(['record', '--network', 'testnet']), '');
const H = 'acf256a0688e7f9c36520f4fc20cfa924d1b2e593033d85b0e443ce770b2d452';
lines.push('## duplicates', run(['record', H, H, '--network', 'testnet']), '');
lines.push(
  '## mainnet hash vs testnet',
  run([
    'record',
    '79177c10c74e1ca1e1bf1b2bc1381dd41d1295efc134722d18a99aa452355e88',
    '--network',
    'testnet',
  ]),
  '',
);

lines.push('## zero involvement');
const SWAP = '2dcff6618ff12fb629700cab627b3870afa3f0dd000becf88b2eb7826d0b2c1b';
const doc = JSON.parse(readFileSync(`examples/live/${SWAP}.json`, 'utf8')) as unknown;
const decoded = decodeTx(decodedTxInputFromCapture(doc));
try {
  await assembleRecording([decoded], {
    network: 'testnet',
    source: 'rpc',
    subject: 'GAFE247TQEPDPTCE7RIHOEXFD5VEGCJIZGLIHPGAITG2BCZ7ATFY4ZLY',
    resolveToken: (id) => Promise.resolve(fallbackToken(id)),
  });
  lines.push('UNEXPECTED SUCCESS');
} catch (e) {
  lines.push((e as Error).message);
}
lines.push('');

lines.push('## MCP malformed');
try {
  await toolRecord({ hashes: 'not-an-array', network: 'testnet' });
} catch (e) {
  lines.push(JSON.stringify(toMcpError(e, 1)));
}

writeFileSync('evidence/s6/hostile-inputs.txt', `${lines.join('\n')}\n`);
console.log('wrote evidence/s6/hostile-inputs.txt');
