import { DBClient } from "../db/client";

export function checkGasBalance(userId: string, db: DBClient): boolean {
  const balance = db.getGasBalance(userId);

  if (balance < 100) {
    // We log a warning but don't prevent execution unless balance < 1
    db.writeAuditLog('system', 'low_gas_balance_warning', { userId, balance });
  }

  return balance >= 1;
}

export async function debitGas(userId: string, credits: number, db: DBClient): Promise<boolean> {
  const success = await db.debitCredits(userId, credits);
  if (!success) {
    throw new Error('Insufficient gas credits');
  }
  return true;
}
