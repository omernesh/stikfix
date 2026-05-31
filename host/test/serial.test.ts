import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withSerialLock, getNextSerial } from '../src/serial.js';

describe('getNextSerial', () => {
  test('empty dir returns 1', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sfx-serial-'));
    try {
      assert.strictEqual(getNextSerial(dir), 1);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test('counts both *.md and *.read.md files toward max serial', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sfx-serial-'));
    try {
      writeFileSync(join(dir, '0003-some-note.md'), '');
      writeFileSync(join(dir, '0007-another.read.md'), '');
      assert.strictEqual(getNextSerial(dir), 8);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});

describe('withSerialLock', () => {
  test('two concurrent writes yield distinct serials 0001 and 0002', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sfx-serial-'));
    try {
      const results = await Promise.all([
        withSerialLock(async () => {
          const serial = getNextSerial(dir);
          const padded = String(serial).padStart(4, '0');
          writeFileSync(join(dir, `${padded}-test.md`), '');
          return padded;
        }),
        withSerialLock(async () => {
          const serial = getNextSerial(dir);
          const padded = String(serial).padStart(4, '0');
          writeFileSync(join(dir, `${padded}-test.md`), '');
          return padded;
        }),
      ]);

      const sorted = [...results].sort();
      assert.deepStrictEqual(sorted, ['0001', '0002']);

      // Verify two distinct files on disk
      const { readdirSync } = await import('node:fs');
      const files = readdirSync(dir).filter(f => f.endsWith('.md'));
      assert.strictEqual(files.length, 2);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test('a throwing fn does not poison the queue — subsequent call resolves', async () => {
    let resolved = false;
    try {
      await withSerialLock(async () => {
        throw new Error('intentional failure');
      });
    } catch {
      // expected
    }

    await withSerialLock(async () => {
      resolved = true;
    });

    assert.strictEqual(resolved, true);
  });
});
