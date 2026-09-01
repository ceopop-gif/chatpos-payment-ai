import { getD1 } from "../../../../db";
import { adminUnauthorized, getAdminSession } from "../../../../lib/admin-auth";
import { membershipReport, reconcileMembership } from "../../../../lib/membership-billing";

export async function GET(request: Request) {
  try {
    if (!(await getAdminSession(request))) return adminUnauthorized();
    const db = getD1();
    const searchParams = new URL(request.url).searchParams;
    const merchantId = String(searchParams.get("merchantId") ?? "").trim();
    if (merchantId) {
      const merchant = await db.prepare("SELECT id FROM merchant_applications WHERE id = ? LIMIT 1").bind(merchantId).first();
      if (!merchant) return Response.json({ error: "ไม่พบร้านค้า" }, { status: 404 });
      return Response.json(await membershipReport(db, merchantId));
    }

    const subscribed = await db.prepare("SELECT merchant_id FROM merchant_memberships WHERE status != 'cancelled' LIMIT 1000").all<{ merchant_id: string }>();
    for (const row of subscribed.results) await reconcileMembership(db, String(row.merchant_id));

    const [summary, merchants, charges] = await Promise.all([
      db.prepare(`
        SELECT
          (SELECT COUNT(*) FROM merchant_applications) AS total_merchants,
          SUM(CASE WHEN mm.status IN ('active', 'past_due') THEN 1 ELSE 0 END) AS subscribers,
          SUM(CASE WHEN mm.status = 'past_due' THEN 1 ELSE 0 END) AS past_due,
          COALESCE(SUM(mm.outstanding_cents), 0) AS outstanding_cents,
          COALESCE(SUM(mfa.total_service_fees_cents), 0) AS service_fees_cents,
          COALESCE(SUM(mfa.total_transaction_fees_cents), 0) AS transaction_fees_cents
        FROM merchant_applications m
        LEFT JOIN merchant_memberships mm ON mm.merchant_id = m.id
        LEFT JOIN merchant_financial_accounts mfa ON mfa.merchant_id = m.id
      `).first(),
      db.prepare(`
        SELECT m.id, m.application_number, m.phone, m.first_name, m.last_name, m.business_description,
          COALESCE(mm.plan_code, 'standard') AS plan_code, COALESCE(mm.status, 'standard') AS membership_status,
          mm.started_at, mm.current_cycle_start, mm.current_cycle_end,
          COALESCE(mm.promptpay_quota_cents, 0) AS promptpay_quota_cents,
          COALESCE(mm.promptpay_used_cents, 0) AS promptpay_used_cents,
          COALESCE(mm.outstanding_cents, 0) AS outstanding_cents,
          COALESCE(mfa.available_balance_cents, 0) AS available_balance_cents,
          COALESCE(mfa.total_service_fees_cents, 0) AS total_service_fees_cents,
          COALESCE(mfa.total_transaction_fees_cents, 0) AS total_transaction_fees_cents,
          COUNT(pt.id) AS transaction_count,
          COALESCE(SUM(pt.amount_cents), 0) AS transaction_total_cents,
          COALESCE(SUM(pt.free_quota_applied_cents), 0) AS lifetime_free_quota_cents
        FROM merchant_applications m
        LEFT JOIN merchant_memberships mm ON mm.merchant_id = m.id
        LEFT JOIN merchant_financial_accounts mfa ON mfa.merchant_id = m.id
        LEFT JOIN payment_transactions pt ON pt.merchant_id = m.id AND pt.status = 'success'
        GROUP BY m.id
        ORDER BY CASE WHEN mm.status = 'past_due' THEN 0 WHEN mm.status = 'active' THEN 1 ELSE 2 END, m.created_at DESC
        LIMIT 1000
      `).all(),
      db.prepare(`
        SELECT l.id, l.merchant_id, l.charge_type, l.amount_cents, l.due_date, l.status, l.description,
          l.payment_source, l.attempt_count, l.paid_at, l.created_at,
          m.application_number, m.phone, m.first_name, m.last_name
        FROM membership_charge_ledger l
        JOIN merchant_applications m ON m.id = l.merchant_id
        ORDER BY l.due_date DESC, l.created_at DESC LIMIT 300
      `).all(),
    ]);

    const totalMerchants = Number(summary?.total_merchants ?? 0);
    const subscriberCount = Number(summary?.subscribers ?? 0);
    return Response.json({
      summary: {
        totalMerchants,
        subscribers: subscriberCount,
        standardMerchants: Math.max(0, totalMerchants - subscriberCount),
        pastDue: Number(summary?.past_due ?? 0),
        outstanding: Number(summary?.outstanding_cents ?? 0) / 100,
        serviceFeesCollected: Number(summary?.service_fees_cents ?? 0) / 100,
        transactionFeesCollected: Number(summary?.transaction_fees_cents ?? 0) / 100,
      },
      merchants: merchants.results.map((row) => {
        const quota = Number(row.promptpay_quota_cents ?? 0);
        const used = Math.min(quota, Number(row.promptpay_used_cents ?? 0));
        return {
          id: String(row.id), applicationNumber: String(row.application_number), phone: String(row.phone),
          name: `${String(row.first_name)} ${String(row.last_name)}`.trim(), businessDescription: String(row.business_description),
          plan: String(row.plan_code), status: String(row.membership_status), startedAt: row.started_at ? String(row.started_at) : null,
          cycleStart: row.current_cycle_start ? String(row.current_cycle_start) : null,
          cycleEnd: row.current_cycle_end ? String(row.current_cycle_end) : null,
          quota: quota / 100, used: used / 100, remaining: Math.max(0, quota - used) / 100,
          usagePercent: quota ? Math.min(100, used / quota * 100) : 0,
          outstanding: Number(row.outstanding_cents) / 100, balance: Number(row.available_balance_cents) / 100,
          serviceFeesPaid: Number(row.total_service_fees_cents) / 100,
          transactionFeesPaid: Number(row.total_transaction_fees_cents) / 100,
          transactionCount: Number(row.transaction_count), transactionTotal: Number(row.transaction_total_cents) / 100,
          lifetimeFreeQuota: Number(row.lifetime_free_quota_cents) / 100,
        };
      }),
      charges: charges.results.map((row) => ({
        id: String(row.id), merchantId: String(row.merchant_id), type: String(row.charge_type),
        amount: Number(row.amount_cents) / 100, dueDate: String(row.due_date), status: String(row.status),
        description: String(row.description), paymentSource: String(row.payment_source), attemptCount: Number(row.attempt_count),
        paidAt: row.paid_at ? String(row.paid_at) : null, createdAt: String(row.created_at),
        applicationNumber: String(row.application_number), phone: String(row.phone),
        merchantName: `${String(row.first_name)} ${String(row.last_name)}`.trim(),
      })),
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "โหลดข้อมูลสมาชิกหลังบ้านไม่สำเร็จ" }, { status: 500 });
  }
}

