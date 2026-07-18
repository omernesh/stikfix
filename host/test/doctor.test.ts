/**
 * Tests for doctor.ts — environment / registration diagnostics.
 *
 * Covers:
 * - parseRegDefaultOutput / parseRegValues: pure `reg QUERY` output parsers
 *   (no real registry access — deterministic strings in, structured data out).
 * - collectDoctorResult: full pipeline against an isolated tmp "home" + "root"
 *   so it never touches (or depends on) the developer's real config.json,
 *   native-messaging manifest, or registry state. Registry-dependent checks
 *   (native-manifest/native-registry/forcelist) are expected to report
 *   'fail'/'warn' against a manifest path that does not exist under the tmp
 *   home — this test asserts the check NEVER throws and always returns all
 *   7 checks, not that a specific browser is (or isn't) installed on the
 *   machine running the suite.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseRegDefaultOutput, parseRegValues, collectDoctorResult } from '../src/doctor.js';

describe('parseRegDefaultOutput', () => {
  test('extracts the (Default) REG_SZ value from reg QUERY /ve output', () => {
    const output = [
      'HKEY_CURRENT_USER\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.stikfix.host',
      '    (Default)    REG_SZ    C:\\Users\\dev\\.local\\share\\stikfix\\com.stikfix.host.json',
      '',
    ].join('\r\n');
    assert.strictEqual(
      parseRegDefaultOutput(output),
      'C:\\Users\\dev\\.local\\share\\stikfix\\com.stikfix.host.json',
    );
  });

  test('returns null when no REG_SZ line is present (key not found)', () => {
    assert.strictEqual(parseRegDefaultOutput(''), null);
    assert.strictEqual(parseRegDefaultOutput('ERROR: The system was unable to find the specified registry key.'), null);
  });
});

describe('parseRegValues', () => {
  test('extracts every named REG_SZ value, ignoring the header line', () => {
    const output = [
      'HKEY_LOCAL_MACHINE\\Software\\Policies\\Google\\Chrome\\ExtensionInstallForcelist',
      '    1    REG_SZ    ccdfmbhdcafhmnnnfjpbhgebfkfgjgca;https://example.com/update.xml',
      '    2    REG_SZ    otherextensionid00000000000000aa;https://example.com/other.xml',
      '',
    ].join('\r\n');
    const values = parseRegValues(output);
    assert.strictEqual(values.length, 2);
    assert.deepStrictEqual(values[0], {
      name: '1',
      data: 'ccdfmbhdcafhmnnnfjpbhgebfkfgjgca;https://example.com/update.xml',
    });
    assert.deepStrictEqual(values[1], {
      name: '2',
      data: 'otherextensionid00000000000000aa;https://example.com/other.xml',
    });
  });

  test('returns an empty array for empty or error output', () => {
    assert.deepStrictEqual(parseRegValues(''), []);
    assert.deepStrictEqual(
      parseRegValues('ERROR: The system was unable to find the specified registry key or value.'),
      [],
    );
  });
});

describe('collectDoctorResult — isolated tmp home/root', () => {
  let tmpHome: string;
  let tmpRoot: string;

  before(() => {
    tmpHome = mkdtempSync(join(tmpdir(), 'stikfix-doctor-home-'));
    tmpRoot = mkdtempSync(join(tmpdir(), 'stikfix-doctor-root-'));
    mkdirSync(join(tmpRoot, 'notes'), { recursive: true });
  });

  after(() => {
    rmSync(tmpHome, { recursive: true, force: true });
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('runs all 7 checks and never throws, even with no config.json present', async () => {
    const result = await collectDoctorResult({
      home: tmpHome,
      rootOverride: tmpRoot,
      extensionIdOverride: 'ccdfmbhdcafhmnnnfjpbhgebfkfgjgca',
    });

    assert.strictEqual(result.checks.length, 7);
    const ids = result.checks.map((c) => c.id);
    assert.deepStrictEqual(ids, [
      'config',
      'host-running',
      'token-port-files',
      'native-manifest',
      'native-registry',
      'forcelist-policy',
      'notes-dir',
    ]);

    // summary counts must match the actual checks
    const counted = { pass: 0, warn: 0, fail: 0 };
    for (const c of result.checks) counted[c.status] += 1;
    assert.deepStrictEqual(result.summary, counted);
    assert.strictEqual(result.ok, result.summary.fail === 0);
  });

  test('config check fails when config.json is absent, but still reports a root+extensionId default', () => {
    return collectDoctorResult({ home: tmpHome, rootOverride: tmpRoot }).then((result) => {
      const configCheck = result.checks.find((c) => c.id === 'config');
      assert.ok(configCheck);
      assert.strictEqual(configCheck!.status, 'fail');
      assert.match(configCheck!.detail, /config\.json not found/);
    });
  });

  test('host-running warns (not fails, does not hang) when no .stikfix-port file exists', async () => {
    const result = await collectDoctorResult({ home: tmpHome, rootOverride: tmpRoot });
    const hostCheck = result.checks.find((c) => c.id === 'host-running');
    assert.ok(hostCheck);
    assert.strictEqual(hostCheck!.status, 'warn');
    assert.match(hostCheck!.detail, /host not running/);
  });

  test('token-port-files fails when neither file exists under the tmp root', async () => {
    const result = await collectDoctorResult({ home: tmpHome, rootOverride: tmpRoot });
    const tokenCheck = result.checks.find((c) => c.id === 'token-port-files');
    assert.ok(tokenCheck);
    assert.strictEqual(tokenCheck!.status, 'fail');
  });

  test('token-port-files passes once both files are created', async () => {
    writeFileSync(join(tmpRoot, '.stikfix-port'), '39240', 'utf8');
    writeFileSync(join(tmpRoot, '.stikfix-token'), 'test-token', 'utf8');
    const result = await collectDoctorResult({ home: tmpHome, rootOverride: tmpRoot });
    const tokenCheck = result.checks.find((c) => c.id === 'token-port-files');
    assert.ok(tokenCheck);
    assert.strictEqual(tokenCheck!.status, 'pass');
  });

  test('notes-dir passes (exists + writable) since the tmp root has a notes/ dir', async () => {
    const result = await collectDoctorResult({ home: tmpHome, rootOverride: tmpRoot });
    const notesCheck = result.checks.find((c) => c.id === 'notes-dir');
    assert.ok(notesCheck);
    assert.strictEqual(notesCheck!.status, 'pass');
  });

  test('no check ever throws (every entry has a well-formed status)', async () => {
    const result = await collectDoctorResult({ home: tmpHome, rootOverride: tmpRoot });
    for (const c of result.checks) {
      assert.ok(['pass', 'warn', 'fail'].includes(c.status), `unexpected status for ${c.id}: ${c.status}`);
      assert.strictEqual(typeof c.detail, 'string');
      assert.ok(c.detail.length > 0);
    }
  });
});
