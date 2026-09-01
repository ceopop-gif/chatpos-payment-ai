import { getD1 } from "../db";

export const MEMBERSHIP_ACTIVATION_FEE_CENTS = 29_000;
export const MEMBERSHIP_DAILY_FEE_CENTS = 1_000;
export const PROMPTPAY_FREE_QUOTA_CENTS = 3_000_000;
export const MEMBERSHIP_CYCLE_DAYS = 30;

type Database = ReturnType<typeof getD1>;

type MembershipRow = {
  merchant_id: string;
  plan_code: string;
  status: string;
  activation_fee_cents: number;
  daily_fee_cents: number;
  promptpay_quota_cents: number;
  promptpay_used_cents: number;
  current_cycle_start: string;
  current_cycle_end: string;
  last_daily_charge_date: string;
  outstanding_cents: number;
  started_at: string;
  cancelled_at: string | null;
  updated_at: string;
};

export type MembershipSnapshot = {
  isSubscriber: boolean;
  plan: "standard" | "subscriber";
  status: "standard" | "active" | "past_due" | "cancelled";
  activationFee: number;
  dailyFee: number;
  outstanding: number;
  balance: number;
  promptpay: {
    quota: number;
    used: number;
    remaining: number;
    usagePercent: number;
    cycleStart: string | null;
    cycleEnd: string | null;
    daysRemaining: number;
  };
  rates: {
    promptpay: string;
    promptpayOverQuota: string;
    visa: string;
    wallet: string;
  };
  startedAt: string | null;
};

function dateInBangkok(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00+07:00`);
  value.setUTCDate(value.getUTCDate() + days);
  return dateInBangkok(value);
}

function daysBetween(from: string, to: string) {
  const start = new Date(`${from}T00:00:00+07:00`).getTime();
  const end = new Date(`${to}T00:00:00+07:00`).getTime();
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

async function membershipRow(db: Database, merchantId: string) {
  return db.prepare("SELECT * FROM merchant_memberships WHERE merchant_id = ? LIMIT 1").bind(merchantId).first<MembershipRow>();
}

async function ensureFinancialAccount(db: Database, merchantId: string) {
  await db.prepare(`
    INSERT OR IGNORE INTO merchant_financial_accounts
      (merchant_id, available_balance_cents, total_transaction_fees_cents, total_service_fees_cents)
    VALUES (?, 0, 0, 0)
  `).bind(merchantId).run();
}

async function settlePendingCharges(db: Database, merchantId: string) {
  await ensureFinancialAccount(db, merchantId);
  const account = await db.prepare(
    "SELECT available_balance_cents FROM merchant_financial_accounts WHERE merchant_id = ? LIMIT 1"
  ).bind(merchantId).first<{ available_balance_cents: number }>();
  let balance = Number(account?.available_balance_cents ?? 0);
  const pending = await db.prepare(`
    SELECT id, amount_cents FROM membership_charge_ledger
    WHERE merchant_id = ? AND status = 'pending'
    ORDER BY due_date, created_at
  `).bind(merchantId).all<{ id: string; amount_cents: number }>();

  const paidIds: string[] = [];
  let serviceFeesPaid = 0;
  for (const charge of pending.results) {
    const amount = Number(charge.amount_cents);
    if (balance < amount) break;
    balance -= amount;
    serviceFeesPaid += amount;
    paidIds.push(String(charge.id));
  }

  const statements = paidIds.map((id) => db.prepare(`
    UPDATE membership_charge_ledger
    SET status = 'paid', paid_at = CURRENT_TIMESTAMP, attempt_count = attempt_count + 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'pending'
  `).bind(id));
  statements.push(db.prepare(`
    UPDATE merchant_financial_accounts
    SET available_balance_cents = ?, total_service_fees_cents = total_service_fees_cents + ?, updated_at = CURRENT_TIMESTAMP
    WHERE merchant_id = ?
  `).bind(balance, serviceFeesPaid, merchantId));
  if (statements.length) await db.batch(statements);

  const outstanding = await db.prepare(`
    SELECT COALESCE(SUM(amount_cents), 0) AS total_cents
    FROM membership_charge_ledger WHERE merchant_id = ? AND status = 'pending'
  `).bind(merchantId).first<{ total_cents: number }>();
  const outstandingCents = Number(outstanding?.total_cents ?? 0);
  await db.prepare(`
    UPDATE merchant_memberships
    SET outstanding_cents = ?, status = CASE WHEN status = 'cancelled' THEN 'cancelled' WHEN ? > 0 THEN 'past_due' ELSE 'active' END,
      updated_at = CURRENT_TIMESTAMP
    WHERE merchant_id = ?
  `).bind(outstandingCents, outstandingCents, merchantId).run();
  return { balanceCents: balance, outstandingCents };
}

export async function reconcileMembership(db: Database, merchantId: string) {
  let membership = await membershipRow(db, merchantId);
  if (!membership || membership.status === "cancelled") {
    await ensureFinancialAccount(db, merchantId);
    return membership;
  }

  const today = dateInBangkok();
  let cycleStart = membership.current_cycle_start;
  let cycleEnd = membership.current_cycle_end;
  let resetCycle = false;
  while (today >= cycleEnd) {
    cycleStart = cycleEnd;
    cycleEnd = addDays(cycleStart, MEMBERSHIP_CYCLE_DAYS);
    resetCycle = true;
  }
  if (resetCycle) {
    await db.prepare(`
      UPDATE merchant_memberships
      SET current_cycle_start = ?, current_cycle_end = ?, promptpay_used_cents = 0, updated_at = CURRENT_TIMESTAMP
      WHERE merchant_id = ?
    `).bind(cycleStart, cycleEnd, merchantId).run();
  }

  const missingDays = Math.min(daysBetween(membership.last_daily_charge_date, today), 3_650);
  if (missingDays > 0) {
    const statements = [];
    for (let day = 1; day <= missingDays; day += 1) {
      const dueDate = addDays(membership.last_daily_charge_date, day);
      statements.push(db.prepare(`
        INSERT OR IGNORE INTO membership_charge_ledger
          (id, merchant_id, charge_type, amount_cents, due_date, status, description, payment_source)
        VALUES (?, ?, 'daily', ?, ?, 'pending', 'ค่าบริการสมาชิกรายวัน', 'merchant_balance')
      `).bind(crypto.randomUUID(), merchantId, Number(membership.daily_fee_cents), dueDate));
    }
    statements.push(db.prepare(`
      UPDATE merchant_memberships SET last_daily_charge_date = ?, updated_at = CURRENT_TIMESTAMP WHERE merchant_id = ?
    `).bind(today, merchantId));
    await db.batch(statements);
  }

  await settlePendingCharges(db, merchantId);
  membership = await membershipRow(db, merchantId);
  return membership;
}

export async function subscribeMerchant(db: Database, merchantId: string) {
  const existing = await membershipRow(db, merchantId);
  if (existing && existing.status !== "cancelled") return existing;
  const today = dateInBangkok();
  const cycleEnd = addDays(today, MEMBERSHIP_CYCLE_DAYS);
  await ensureFinancialAccount(db, merchantId);
  await db.batch([
    db.prepare(`
      INSERT INTO merchant_memberships
        (merchant_id, plan_code, status, activation_fee_cents, daily_fee_cents, promptpay_quota_cents,
         promptpay_used_cents, current_cycle_start, current_cycle_end, last_daily_charge_date, outstanding_cents)
      VALUES (?, 'subscriber', 'active', ?, ?, ?, 0, ?, ?, ?, 0)
      ON CONFLICT(merchant_id) DO UPDATE SET
        plan_code = 'subscriber', status = 'active', activation_fee_cents = excluded.activation_fee_cents,
        daily_fee_cents = excluded.daily_fee_cents, promptpay_quota_cents = excluded.promptpay_quota_cents,
        promptpay_used_cents = 0, current_cycle_start = excluded.current_cycle_start,
        current_cycle_end = excluded.current_cycle_end, last_daily_charge_date = excluded.last_daily_charge_date,
        outstanding_cents = 0, cancelled_at = NULL, started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    `).bind(merchantId, MEMBERSHIP_ACTIVATION_FEE_CENTS, MEMBERSHIP_DAILY_FEE_CENTS, PROMPTPAY_FREE_QUOTA_CENTS, today, cycleEnd, today),
    db.prepare(`
      INSERT INTO membership_charge_ledger
        (id, merchant_id, charge_type, amount_cents, due_date, status, description, payment_source, attempt_count, paid_at)
      VALUES (?, ?, 'activation', ?, ?, 'paid', 'ค่าสมัครสมาชิกครั้งแรก', 'signup_payment', 1, CURRENT_TIMESTAMP)
      ON CONFLICT(merchant_id, charge_type, due_date) DO NOTHING
    `).bind(crypto.randomUUID(), merchantId, MEMBERSHIP_ACTIVATION_FEE_CENTS, today),
  ]);
  return membershipRow(db, merchantId);
}

export async function membershipSnapshot(db: Database, merchantId: string): Promise<MembershipSnapshot> {
  const membership = await reconcileMembership(db, merchantId);
  await ensureFinancialAccount(db, merchantId);
  const account = await db.prepare(
    "SELECT available_balance_cents FROM merchant_financial_accounts WHERE merchant_id = ? LIMIT 1"
  ).bind(merchantId).first<{ available_balance_cents: number }>();
  const isSubscriber = Boolean(membership && membership.status !== "cancelled");
  const quota = isSubscriber ? Number(membership?.promptpay_quota_cents ?? PROMPTPAY_FREE_QUOTA_CENTS) : 0;
  const used = isSubscriber ? Math.min(quota, Number(membership?.promptpay_used_cents ?? 0)) : 0;
  const remaining = Math.max(0, quota - used);
  const today = dateInBangkok();
  return {
    isSubscriber,
    plan: isSubscriber ? "subscriber" : "standard",
    status: isSubscriber ? (membership?.status === "past_due" ? "past_due" : "active") : (membership?.status === "cancelled" ? "cancelled" : "standard"),
    activationFee: Number(membership?.activation_fee_cents ?? MEMBERSHIP_ACTIVATION_FEE_CENTS) / 100,
    dailyFee: Number(membership?.daily_fee_cents ?? MEMBERSHIP_DAILY_FEE_CENTS) / 100,
    outstanding: Number(membership?.outstanding_cents ?? 0) / 100,
    balance: Number(account?.available_balance_cents ?? 0) / 100,
    promptpay: {
      quota: quota / 100,
      used: used / 100,
      remaining: remaining / 100,
      usagePercent: quota ? Math.min(100, used / quota * 100) : 0,
      cycleStart: membership?.current_cycle_start ?? null,
      cycleEnd: membership?.current_cycle_end ?? null,
      daysRemaining: membership ? Math.max(0, daysBetween(today, membership.current_cycle_end)) : 0,
    },
    rates: isSubscriber
      ? { promptpay: "0% ภายในโควตา", promptpayOverQuota: "1%", visa: "2.95%", wallet: "2.95%" }
      : { promptpay: "1.5%", promptpayOverQuota: "1.5%", visa: "3.25%", wallet: "3.00%" },
    startedAt: membership?.started_at ?? null,
  };
}

const STANDARD_RATE_BPS: Record<string, number> = {
  promptpay: 150, mobile: 150, visa: 325, truemoney: 300, shopeepay: 300, wechat: 325, alipay: 325,
};
const SUBSCRIBER_RATE_BPS: Record<string, number> = {
  promptpay: 100, mobile: 100, visa: 295, truemoney: 295, shopeepay: 295, wechat: 295, alipay: 295,
};

export function computePaymentFee(
  method: string,
  amountCents: number,
  isSubscriber: boolean,
  quotaCents = PROMPTPAY_FREE_QUOTA_CENTS,
  usedQuotaCents = 0,
) {
  if (isSubscriber && (method === "promptpay" || method === "mobile")) {
    const used = Math.min(quotaCents, Math.max(0, usedQuotaCents));
    const freeQuotaAppliedCents = Math.min(amountCents, Math.max(0, quotaCents - used));
    const chargeableCents = amountCents - freeQuotaAppliedCents;
    const feeRateBps = SUBSCRIBER_RATE_BPS[method] ?? 100;
    const feeCents = Math.round(chargeableCents * feeRateBps / 10_000);
    return { feeRateBps, feeCents, netAmountCents: amountCents - feeCents, freeQuotaAppliedCents };
  }
  const feeRateBps = isSubscriber ? (SUBSCRIBER_RATE_BPS[method] ?? 295) : (STANDARD_RATE_BPS[method] ?? 325);
  const feeCents = Math.round(amountCents * feeRateBps / 10_000);
  return { feeRateBps, feeCents, netAmountCents: amountCents - feeCents, freeQuotaAppliedCents: 0 };
}

export async function calculatePaymentFee(db: Database, merchantId: string, method: string, amountCents: number) {
  const membership = await reconcileMembership(db, merchantId);
  const isSubscriber = Boolean(membership && membership.status !== "cancelled");
  const fee = computePaymentFee(
    method,
    amountCents,
    isSubscriber,
    Number(membership?.promptpay_quota_cents ?? PROMPTPAY_FREE_QUOTA_CENTS),
    Number(membership?.promptpay_used_cents ?? 0),
  );
  return { ...fee, isSubscriber, plan: isSubscriber ? "subscriber" : "standard", cycleStart: membership?.current_cycle_start ?? null };
}

export async function recordPaymentFinancials(
  db: Database,
  merchantId: string,
  fee: { feeCents: number; netAmountCents: number; freeQuotaAppliedCents: number },
) {
  await ensureFinancialAccount(db, merchantId);
  const statements = [db.prepare(`
    UPDATE merchant_financial_accounts
    SET available_balance_cents = available_balance_cents + ?,
      total_transaction_fees_cents = total_transaction_fees_cents + ?, updated_at = CURRENT_TIMESTAMP
    WHERE merchant_id = ?
  `).bind(fee.netAmountCents, fee.feeCents, merchantId)];
  if (fee.freeQuotaAppliedCents > 0) statements.push(db.prepare(`
    UPDATE merchant_memberships
    SET promptpay_used_cents = MIN(promptpay_quota_cents, promptpay_used_cents + ?), updated_at = CURRENT_TIMESTAMP
    WHERE merchant_id = ? AND status != 'cancelled'
  `).bind(fee.freeQuotaAppliedCents, merchantId));
  await db.batch(statements);
  await settlePendingCharges(db, merchantId);
}

export async function membershipReport(db: Database, merchantId: string) {
  const membership = await membershipSnapshot(db, merchantId);
  const [charges, transactions] = await Promise.all([
    db.prepare(`
      SELECT id, charge_type, amount_cents, due_date, status, description, payment_source, attempt_count, paid_at, created_at
      FROM membership_charge_ledger WHERE merchant_id = ? ORDER BY due_date DESC, created_at DESC LIMIT 120
    `).bind(merchantId).all(),
    db.prepare(`
      SELECT id, method, amount_cents, fee_rate_bps, fee_cents, net_amount_cents, membership_plan,
        free_quota_applied_cents, quota_cycle_started_at, created_at
      FROM payment_transactions WHERE merchant_id = ? AND status = 'success' ORDER BY created_at DESC LIMIT 120
    `).bind(merchantId).all(),
  ]);
  return {
    membership,
    charges: charges.results.map((row) => ({
      id: String(row.id), type: String(row.charge_type), amount: Number(row.amount_cents) / 100,
      dueDate: String(row.due_date), status: String(row.status), description: String(row.description),
      paymentSource: String(row.payment_source), attemptCount: Number(row.attempt_count),
      paidAt: row.paid_at ? String(row.paid_at) : null, createdAt: String(row.created_at),
    })),
    transactions: transactions.results.map((row) => ({
      id: String(row.id), method: String(row.method), amount: Number(row.amount_cents) / 100,
      feeRate: Number(row.fee_rate_bps) / 100, fee: Number(row.fee_cents) / 100,
      netAmount: Number(row.net_amount_cents) / 100, plan: String(row.membership_plan),
      freeQuotaApplied: Number(row.free_quota_applied_cents) / 100,
      quotaCycleStart: row.quota_cycle_started_at ? String(row.quota_cycle_started_at) : null,
      createdAt: String(row.created_at),
    })),
  };
}
