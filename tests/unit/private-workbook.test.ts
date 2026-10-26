// Optional: reconciles a private management workbook when THREEX_WORKBOOK points
// to it. The workbook is never committed; without the variable the test is skipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readXlsx } from '../../src/engines/workbook/xlsx';
import { Workbook, inventory, reconcile } from '../../src/engines/workbook/workbook';

const file = process.env.THREEX_WORKBOOK;

test('private workbook: every formula reproduces its cached value', { skip: !file || !fs.existsSync(file) ? 'set THREEX_WORKBOOK=/path/to/model.xlsx to run' : false }, async () => {
  const wb = Workbook.fromRaw(await readXlsx(fs.readFileSync(file!)));
  const inv = inventory(wb);
  assert.deepEqual(inv.unsupportedFunctions, []);
  const rec = reconcile(wb);
  assert.equal(rec.mismatched.length, 0, JSON.stringify(rec.mismatched.slice(0, 5)));
  assert.ok(rec.compared > 0);
  console.log(`compared ${rec.compared}, matched ${rec.matched}`);
});
