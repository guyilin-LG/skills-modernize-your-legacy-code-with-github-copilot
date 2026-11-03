'use strict';

const assert = require('node:assert/strict');
const { Readable, Writable } = require('node:stream');
const { test } = require('node:test');

const {
  AccountApplication,
  DataProgram,
  INITIAL_BALANCE_CENTS,
  MAX_BALANCE_CENTS,
  Operations,
  formatBalance,
  parseAmount,
} = require('..');

function runApplication(input, operations = new Operations()) {
  let outputText = '';
  const output = new Writable({
    write(chunk, encoding, callback) {
      outputText += chunk.toString();
      callback();
    },
  });
  const application = new AccountApplication({
    input: Readable.from([input]),
    output,
    operations,
  });

  return application.run().then(() => outputText);
}

test('TC-001: starts with a 1000.00 balance', () => {
  const dataProgram = new DataProgram();

  assert.equal(dataProgram.read(), INITIAL_BALANCE_CENTS);
  assert.equal(formatBalance(dataProgram.read()), '001000.00');
});

test('TC-002: displays the current balance', async () => {
  const output = await runApplication('1\n4\n');

  assert.match(output, /Current balance: 001000\.00/);
});

test('TC-003: reads the stored balance', () => {
  const dataProgram = new DataProgram(125050);

  assert.equal(dataProgram.execute('READ'), 125050);
});

test('TC-004: writes and then reads the stored balance', () => {
  const dataProgram = new DataProgram();

  dataProgram.execute('WRITE', 125050);

  assert.equal(dataProgram.execute('READ'), 125050);
});

test('TC-005: credits a positive amount', () => {
  const operations = new Operations();

  assert.equal(operations.credit(25050), 125050);
  assert.equal(operations.total(), 125050);
});

test('TC-006: accumulates consecutive credits', () => {
  const operations = new Operations();

  operations.credit(10000);
  operations.credit(5025);

  assert.equal(operations.total(), 115025);
});

test('TC-007: debits an amount below the balance', () => {
  const operations = new Operations();

  assert.deepEqual(operations.debit(30000), { success: true, balanceCents: 70000 });
  assert.equal(operations.total(), 70000);
});

test('TC-008: allows a debit equal to the balance', () => {
  const operations = new Operations();

  assert.deepEqual(operations.debit(100000), { success: true, balanceCents: 0 });
  assert.equal(operations.total(), 0);
});

test('TC-009: rejects a debit above the balance without changing it', () => {
  const operations = new Operations();

  assert.deepEqual(operations.debit(100001), { success: false, balanceCents: 100000 });
  assert.equal(operations.total(), 100000);
});

test('TC-010: preserves the balance after a zero credit', () => {
  const operations = new Operations();

  assert.equal(operations.credit(0), 100000);
  assert.equal(operations.total(), 100000);
});

test('TC-011: preserves the balance after a zero debit', () => {
  const operations = new Operations();

  assert.deepEqual(operations.debit(0), { success: true, balanceCents: 100000 });
  assert.equal(operations.total(), 100000);
});

test('TC-012: rejects negative and non-numeric amounts', () => {
  assert.equal(parseAmount('-1.00'), null);
  assert.equal(parseAmount('not-a-number'), null);
});

test('TC-013: reports an invalid menu choice and continues', async () => {
  const output = await runApplication('5\n4\n');

  assert.match(output, /Invalid choice, please select 1-4\./);
  assert.match(output, /Exiting the program\. Goodbye!/);
});

test('TC-014: exits normally', async () => {
  const output = await runApplication('4\n');

  assert.match(output, /Exiting the program\. Goodbye!/);
});

test('TC-015: preserves the balance across menu operations', async () => {
  const output = await runApplication('2\n200.00\n1\n3\n50.00\n1\n4\n');

  assert.match(output, /Amount credited\. New balance: 001200\.00/);
  assert.match(output, /Amount debited\. New balance: 001150\.00/);
  assert.equal((output.match(/Current balance: 001200\.00/g) || []).length, 1);
  assert.equal((output.match(/Current balance: 001150\.00/g) || []).length, 1);
});

test('TC-016: resets the balance when a new application starts', () => {
  const firstRun = new Operations();
  firstRun.credit(20000);

  const secondRun = new Operations();

  assert.equal(firstRun.total(), 120000);
  assert.equal(secondRun.total(), INITIAL_BALANCE_CENTS);
});

test('TC-017: leaves storage unchanged for an unsupported data operation', () => {
  const dataProgram = new DataProgram(125000);

  assert.equal(dataProgram.execute('ARCHIVE', 99999999), undefined);
  assert.equal(dataProgram.execute('READ'), 125000);
});

test('TC-018: rejects a deposit amount above 999999.99 with a clear message', async () => {
  const output = await runApplication('2\n1000000\n1\n4\n');

  assert.match(output, /Student account deposits cannot exceed 999999\.99\./);
  assert.match(output, /Current balance: 001000\.00/);
});

test('TC-019: rejects a deposit that would exceed the account balance limit', () => {
  const operations = new Operations(new DataProgram(99400000));

  assert.throws(
    () => operations.credit(600100),
    /Student account balance cannot exceed 999999\.99\./,
  );
  assert.equal(operations.total(), 99400000);
});

test('TC-020: allows the maximum balance 999999.99', () => {
  const operations = new Operations(new DataProgram(0));

  assert.equal(operations.credit(MAX_BALANCE_CENTS), MAX_BALANCE_CENTS);
  assert.equal(formatBalance(operations.total()), '999999.99');
});

test('TC-021: rejects a debit amount above 999999.99', async () => {
  const output = await runApplication('3\n1000000\n1\n4\n');

  assert.match(output, /Student account transaction amounts cannot exceed 999999\.99\./);
  assert.match(output, /Current balance: 001000\.00/);
});

test('TC-022: treats injection strings as invalid input', async () => {
  const maliciousInput = '"; process.exit(1); //';
  const output = await runApplication(`2\n${maliciousInput}\n1\n4\n`);

  assert.match(output, /Invalid amount, please enter a non-negative amount/);
  assert.match(output, /Current balance: 001000\.00/);
  assert.doesNotMatch(output, /Unable to credit amount/);
});

test('TC-023: rejects amounts with more than two decimal places', async () => {
  const output = await runApplication('2\n10.001\n1\n4\n');

  assert.match(output, /Invalid amount, please enter a non-negative amount/);
  assert.match(output, /Current balance: 001000\.00/);
});
