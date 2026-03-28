import { DBClient } from '../db/client';

export const CREDIT_PRICE_CENTS = 100; // 1 credit = $1.00 or $0.01 per execution, set whatever scale needed
export const MIN_CREDIT_PURCHASE = 1000;

export async function hasSufficientGas(userId: string, db: DBClient): Promise<boolean> {
  const balance = db.getGasBalance(userId);
  return balance > 0;
}

export async function debitCredits(userId: string, amount: number = 1, db: DBClient): Promise<boolean> {
  const balance = db.getGasBalance(userId);
  if (balance >= amount) {
    db.decrementGasBalance(userId, amount);
    return true;
  }
  return false;
}

export function getBalance(userId: string, db: DBClient): number {
    return db.getGasBalance(userId);
}

export async function addGasCredits(userId: string, amount: number, db: DBClient): Promise<void> {
  db.incrementGasBalance(userId, amount);
}
