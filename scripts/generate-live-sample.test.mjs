import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const source = await readFile(fileURLToPath(new URL('./generate-live-sample.mjs', import.meta.url)), 'utf8');
const script = fileURLToPath(new URL('./generate-live-sample.mjs', import.meta.url));

function blockedSubprocess(args, extraEnv) {
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec,
    OPENAI_API_KEY: 'dummy-only', SILVIA_WS_MODULE: 'module-that-must-not-load', ...extraEnv };
  const result = spawnSync(process.execPath, [script, ...args], { env, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /synthetisch|DATABASE_URL|HTTP_PROXY|SILVIA_DATA_DIR/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /Cannot find package|ERR_MODULE_NOT_FOUND/);
}

test('Live-Sample blockiert fehlende Bestätigung im Subprozess vor ws-Import', () => {
  blockedSubprocess([], {});
});

test('Live-Sample blockiert DATABASE_URL im Subprozess vor ws-Import', () => {
  blockedSubprocess(['--confirm-synthetic'], { DATABASE_URL: 'postgres://dummy' });
});

test('Live-Sample blockiert HTTP_PROXY im Subprozess vor ws-Import', () => {
  blockedSubprocess(['--confirm-synthetic'], { HTTP_PROXY: 'http://proxy.invalid' });
});

test('Live-Sample blockiert SILVIA_DATA_DIR im Subprozess vor ws-Import', () => {
  blockedSubprocess(['--confirm-synthetic'], { SILVIA_DATA_DIR: 'C:\\silvia\\persistent-dummy' });
});

test('Live-Sample verlangt synthetische Bestätigung und blockiert echte/proxy Umgebungen vor ws-import', () => {
  for (const required of [
    "args[0] !== '--confirm-synthetic'",
    "'HTTP_PROXY'",
    "'HTTPS_PROXY'",
    "'ALL_PROXY'",
    "process.env.DATABASE_URL",
    "process.env.SILVIA_DATA_DIR",
  ]) assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.ok(source.indexOf('const args') < source.indexOf('await import('));
  assert.ok(source.indexOf('configuredProxy') < source.indexOf('await import('));
});

test('Live-Sample behält statischen Marin-Prompt und unüberschreibbare WAV-Ausgabe', () => {
  assert.match(source, /model: 'gpt-live-1'/);
  assert.match(source, /voice: 'marin'/);
  assert.match(source, /Keine echten Termine, keine Patientendaten, keine Werkzeuge/);
  assert.match(source, /flag: 'wx'/);
});
