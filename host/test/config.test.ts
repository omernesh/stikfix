import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveConfig, resolveConfigValues } from '../src/config.js';

// ---------------------------------------------------------------------------
// resolveConfig -- WR-05: --port validation
// ---------------------------------------------------------------------------

describe('resolveConfig — port validation (WR-05)', () => {
  let tmpRoot: string;

  test.before(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'sfx-config-test-'));
  });

  test.after(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('valid integer port is accepted', () => {
    const cfg = resolveConfig({ root: tmpRoot, port: '39240' });
    assert.strictEqual(cfg.port, 39240);
  });

  test('undefined port results in undefined cfg.port', () => {
    const cfg = resolveConfig({ root: tmpRoot });
    assert.strictEqual(cfg.port, undefined);
  });

  test('WR-05: non-numeric port string throws', () => {
    assert.throws(
      () => resolveConfig({ root: tmpRoot, port: 'garbage' }),
      (err: any) => {
        assert.ok(err.message.includes('--port'), `expected --port in message, got: ${err.message}`);
        return true;
      }
    );
  });

  test('WR-05: port 0 (out of range) throws', () => {
    assert.throws(
      () => resolveConfig({ root: tmpRoot, port: '0' }),
      (err: any) => {
        assert.ok(err.message.includes('--port'));
        return true;
      }
    );
  });

  test('WR-05: port 99999 (above 65535) throws', () => {
    assert.throws(
      () => resolveConfig({ root: tmpRoot, port: '99999' }),
      (err: any) => {
        assert.ok(err.message.includes('--port'));
        return true;
      }
    );
  });

  test('WR-05: negative port throws', () => {
    assert.throws(
      () => resolveConfig({ root: tmpRoot, port: '-1' }),
      (err: any) => {
        assert.ok(err.message.includes('--port'));
        return true;
      }
    );
  });

  test('WR-05: non-integer float port throws', () => {
    assert.throws(
      () => resolveConfig({ root: tmpRoot, port: '3.14' }),
      (err: any) => {
        assert.ok(err.message.includes('--port'));
        return true;
      }
    );
  });
});

// ---------------------------------------------------------------------------
// resolveConfigValues — three-tier precedence (Windows PowerShell compat)
// ---------------------------------------------------------------------------

describe('resolveConfigValues — env fallback precedence', () => {
  let tmpRoot: string;

  test.before(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'sfx-config-env-test-'));
  });

  test.after(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('parsed flag wins over STIKFIX_ROOT', () => {
    const v = resolveConfigValues(
      { root: tmpRoot },
      { STIKFIX_ROOT: '/some/other/path', npm_config_root: '/npm/path' },
    );
    assert.strictEqual(v['root'], tmpRoot);
  });

  test('STIKFIX_ROOT used when no flag', () => {
    const v = resolveConfigValues(
      {},
      { STIKFIX_ROOT: tmpRoot, npm_config_root: '/npm/path' },
    );
    assert.strictEqual(v['root'], tmpRoot);
  });

  test('npm_config_root used as last resort', () => {
    const v = resolveConfigValues(
      {},
      { npm_config_root: tmpRoot },
    );
    assert.strictEqual(v['root'], tmpRoot);
  });

  test('STIKFIX_ORIGINS comma-split into array', () => {
    const v = resolveConfigValues(
      {},
      { STIKFIX_ROOT: tmpRoot, STIKFIX_ORIGINS: 'http://localhost:3000,http://localhost:4000' },
    );
    assert.deepStrictEqual(v['origin'], ['http://localhost:3000', 'http://localhost:4000']);
  });

  test('npm_config_origin wrapped in array when no flag or STIKFIX_ORIGINS', () => {
    const v = resolveConfigValues(
      {},
      { STIKFIX_ROOT: tmpRoot, npm_config_origin: 'http://localhost:5173' },
    );
    assert.deepStrictEqual(v['origin'], ['http://localhost:5173']);
  });

  test('parsed origin flag wins over STIKFIX_ORIGINS', () => {
    const v = resolveConfigValues(
      { origin: ['http://flag-origin.test'] },
      { STIKFIX_ROOT: tmpRoot, STIKFIX_ORIGINS: 'http://env-origin.test' },
    );
    assert.deepStrictEqual(v['origin'], ['http://flag-origin.test']);
  });

  test('resolveConfig uses STIKFIX_ROOT end-to-end', () => {
    // Simulate PowerShell: no argv flags, but STIKFIX_ROOT set
    // We call resolveConfig with empty values and inject env via resolveConfigValues
    const merged = resolveConfigValues({}, { STIKFIX_ROOT: tmpRoot });
    const cfg = resolveConfig(merged);
    assert.strictEqual(cfg.root, tmpRoot);
  });

  test('resolveConfig uses npm_config_root end-to-end', () => {
    // Simulate npm-on-Windows: flag stripped, re-exposed as npm_config_root
    const merged = resolveConfigValues({}, { npm_config_root: tmpRoot });
    const cfg = resolveConfig(merged);
    assert.strictEqual(cfg.root, tmpRoot);
  });

  test('resolveConfig still throws when root absent from all sources', () => {
    const merged = resolveConfigValues({}, {});
    assert.throws(() => resolveConfig(merged), /--root is required/);
  });
});
