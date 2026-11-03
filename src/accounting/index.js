'use strict';

const readline = require('node:readline');

const INITIAL_BALANCE_CENTS = 100000;
const MAX_BALANCE_CENTS = 99999999;

function formatBalance(balanceCents) {
  const wholePart = Math.floor(balanceCents / 100).toString().padStart(6, '0');
  const fractionalPart = (balanceCents % 100).toString().padStart(2, '0');
  return `${wholePart}.${fractionalPart}`;
}

function parseAmount(input) {
  const normalizedInput = String(input).trim();

  if (!/^\d+(?:\.\d{1,2})?$/.test(normalizedInput)) {
    return null;
  }

  const [wholePart, fractionalPart = ''] = normalizedInput.split('.');
  const amountCents = Number(wholePart) * 100 + Number(fractionalPart.padEnd(2, '0'));

  if (!Number.isSafeInteger(amountCents)) {
    return null;
  }

  return amountCents;
}

class DataProgram {
  constructor(initialBalanceCents = INITIAL_BALANCE_CENTS) {
    this.balanceCents = initialBalanceCents;
  }

  read() {
    return this.balanceCents;
  }

  write(balanceCents) {
    if (!Number.isSafeInteger(balanceCents) || balanceCents < 0 || balanceCents > MAX_BALANCE_CENTS) {
      throw new RangeError(`Student account balance cannot exceed ${formatBalance(MAX_BALANCE_CENTS)}.`);
    }

    this.balanceCents = balanceCents;
  }

  execute(operation, balanceCents) {
    if (operation === 'READ') {
      return this.read();
    }

    if (operation === 'WRITE') {
      this.write(balanceCents);
      return this.read();
    }

    return undefined;
  }
}

class Operations {
  constructor(dataProgram = new DataProgram()) {
    this.dataProgram = dataProgram;
  }

  total() {
    return this.dataProgram.execute('READ');
  }

  credit(amountCents) {
    const currentBalanceCents = this.dataProgram.execute('READ');
    const newBalanceCents = currentBalanceCents + amountCents;
    this.dataProgram.execute('WRITE', newBalanceCents);
    return newBalanceCents;
  }

  debit(amountCents) {
    const currentBalanceCents = this.dataProgram.execute('READ');

    if (currentBalanceCents < amountCents) {
      return { success: false, balanceCents: currentBalanceCents };
    }

    const newBalanceCents = currentBalanceCents - amountCents;
    this.dataProgram.execute('WRITE', newBalanceCents);
    return { success: true, balanceCents: newBalanceCents };
  }
}

class AccountApplication {
  constructor({ input = process.stdin, output = process.stdout, operations = new Operations() } = {}) {
    this.input = input;
    this.output = output;
    this.operations = operations;
  }

  displayMenu() {
    this.output.write('--------------------------------\n');
    this.output.write('Account Management System\n');
    this.output.write('1. View Balance\n');
    this.output.write('2. Credit Account\n');
    this.output.write('3. Debit Account\n');
    this.output.write('4. Exit\n');
    this.output.write('--------------------------------\n');
  }

  ask(question) {
    this.output.write(question);
    return this.inputIterator.next().then(({ value, done }) => (done ? '' : value));
  }

  async run() {
    this.readline = readline.createInterface({ input: this.input, output: this.output });
    this.inputIterator = this.readline[Symbol.asyncIterator]();

    try {
      let shouldExit = false;

      while (!shouldExit) {
        this.displayMenu();
        const choice = (await this.ask('Enter your choice (1-4): ')).trim();

        switch (choice) {
          case '1':
            this.output.write(`Current balance: ${formatBalance(this.operations.total())}\n`);
            break;
          case '2':
            await this.processCredit();
            break;
          case '3':
            await this.processDebit();
            break;
          case '4':
            shouldExit = true;
            break;
          default:
            this.output.write('Invalid choice, please select 1-4.\n');
        }
      }

      this.output.write('Exiting the program. Goodbye!\n');
    } finally {
      this.readline.close();
    }
  }

  async processCredit() {
    this.output.write('Enter credit amount: ');
    const amountCents = parseAmount(await this.ask(''));

    if (amountCents === null) {
      this.output.write('Invalid amount, please enter a non-negative amount with up to two decimal places.\n');
      return;
    }

    if (amountCents > MAX_BALANCE_CENTS) {
      this.output.write(`Student account deposits cannot exceed ${formatBalance(MAX_BALANCE_CENTS)}.\n`);
      return;
    }

    try {
      const newBalanceCents = this.operations.credit(amountCents);
      this.output.write(`Amount credited. New balance: ${formatBalance(newBalanceCents)}\n`);
    } catch (error) {
      this.output.write(`Unable to credit amount: ${error.message}\n`);
    }
  }

  async processDebit() {
    this.output.write('Enter debit amount: ');
    const amountCents = parseAmount(await this.ask(''));

    if (amountCents === null) {
      this.output.write('Invalid amount, please enter a non-negative amount with up to two decimal places.\n');
      return;
    }

    if (amountCents > MAX_BALANCE_CENTS) {
      this.output.write(`Student account transaction amounts cannot exceed ${formatBalance(MAX_BALANCE_CENTS)}.\n`);
      return;
    }

    const result = this.operations.debit(amountCents);

    if (!result.success) {
      this.output.write('Insufficient funds for this debit.\n');
      return;
    }

    this.output.write(`Amount debited. New balance: ${formatBalance(result.balanceCents)}\n`);
  }
}

async function main() {
  const application = new AccountApplication();
  await application.run();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  AccountApplication,
  DataProgram,
  INITIAL_BALANCE_CENTS,
  MAX_BALANCE_CENTS,
  Operations,
  formatBalance,
  main,
  parseAmount,
};
