import { getD1 } from "../../../../db";
import { adminUnauthorized, getAdminSession } from "../../../../lib/admin-auth";

function bangkokDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function validDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export async function GET(request: Request) {
  try {
    if (!(await getAdminSession(request))) return adminUnauthorized();
    const db = getD1();
    const searchParams = new URL(request.url).searchParams;
    const today = bangkokDate();
    const requestedFrom = validDate(searchParams.get("from")) ?? today;
    const requestedTo = validDate(searchParams.get("to")) ?? requestedFrom;
    const dateFrom = requestedFrom <= requestedTo ? requestedFrom : requestedTo;
    const dateTo = requestedFrom <= requestedTo ? requestedTo : requestedFrom;

    const [summary, merchantResult, agentResult, paymentToday, paymentAll, paymentPeriod, dailyResult, channelResult, reviewResult] = await Promise.all([
      db.prepare(`
        SELECT
          COUNT(*) AS total_merchants,
          SUM(CASE WHEN kyc_status = 'pending' THEN 1 ELSE 0 END) AS pending_kyc,
          SUM(CASE WHEN kyc_status = 'approved' THEN 1 ELSE 0 END) AS approved_kyc,
          SUM(CASE WHEN kyc_status IN ('rejected', 'suspended') THEN 1 ELSE 0 END) AS cancelled_kyc,
          SUM(CASE WHEN agent_id IS NULL THEN 1 ELSE 0 END) AS unassigned
        FROM merchant_applications
      `).first(),
      db.prepare(`
        SELECT m.id, m.application_number, m.phone, m.first_name, m.last_name, m.address,
          m.business_description, m.agent_id, m.agent_reference, m.kyc_status, m.kyc_note,
          m.status, m.created_at, m.approved_at,
          a.code AS agent_code, a.phone AS agent_phone, a.name AS agent_name,
          COUNT(DISTINCT t.id) AS table_count,
          COUNT(o.id) AS order_count,
          COALESCE(SUM(o.total_cents), 0) AS order_total_cents,
          MAX(o.created_at) AS last_order_at
        FROM merchant_applications m
        LEFT JOIN agents a ON a.id = m.agent_id
        LEFT JOIN restaurant_tables t ON t.merchant_id = m.id
        LEFT JOIN table_orders o ON o.table_id = t.id
        GROUP BY m.id
        ORDER BY m.created_at DESC
        LIMIT 500
      `).all(),
      db.prepare(`
        SELECT a.id, a.code, a.phone, a.name, a.external_id, a.source, a.synced_at, a.status, a.note, a.created_at,
          COUNT(DISTINCT m.id) AS merchant_count,
          COUNT(DISTINCT CASE WHEN m.kyc_status = 'approved' THEN m.id END) AS approved_count,
          COUNT(o.id) AS order_count,
          COALESCE(SUM(o.total_cents), 0) AS order_total_cents,
          MAX(o.created_at) AS last_order_at
        FROM agents a
        LEFT JOIN merchant_applications m ON m.agent_id = a.id
        LEFT JOIN restaurant_tables t ON t.merchant_id = m.id
        LEFT JOIN table_orders o ON o.table_id = t.id
        GROUP BY a.id
        ORDER BY merchant_count DESC, a.created_at DESC
      `).all(),
      db.prepare(`
        SELECT COUNT(*) AS transaction_count, COALESCE(SUM(amount_cents), 0) AS total_cents
        FROM payment_transactions
        WHERE status = 'success' AND date(datetime(created_at, '+7 hours')) = ?
      `).bind(today).first(),
      db.prepare(`
        SELECT COUNT(*) AS transaction_count, COALESCE(SUM(amount_cents), 0) AS total_cents
        FROM payment_transactions
        WHERE status = 'success'
      `).first(),
      db.prepare(`
        SELECT COUNT(*) AS transaction_count, COALESCE(SUM(amount_cents), 0) AS total_cents
        FROM payment_transactions
        WHERE status = 'success' AND date(datetime(created_at, '+7 hours')) BETWEEN ? AND ?
      `).bind(dateFrom, dateTo).first(),
      db.prepare(`
        SELECT date(datetime(created_at, '+7 hours')) AS usage_date,
          COUNT(*) AS transaction_count,
          COALESCE(SUM(amount_cents), 0) AS total_cents
        FROM payment_transactions
        WHERE status = 'success' AND date(datetime(created_at, '+7 hours')) BETWEEN ? AND ?
        GROUP BY date(datetime(created_at, '+7 hours'))
        ORDER BY usage_date
      `).bind(dateFrom, dateTo).all(),
      db.prepare(`
        SELECT method, COUNT(*) AS transaction_count, COALESCE(SUM(amount_cents), 0) AS total_cents
        FROM payment_transactions
        WHERE status = 'success' AND date(datetime(created_at, '+7 hours')) BETWEEN ? AND ?
        GROUP BY method
        ORDER BY total_cents DESC, transaction_count DESC
      `).bind(dateFrom, dateTo).all(),
      db.prepare(`
        SELECT r.id, r.application_id, r.action, r.previous_status, r.next_status,
          r.note, r.reviewed_by, r.created_at, m.application_number,
          m.first_name, m.last_name, a.code AS agent_code
        FROM kyc_reviews r
        JOIN merchant_applications m ON m.id = r.application_id
        LEFT JOIN agents a ON a.id = r.agent_id
        ORDER BY r.created_at DESC
        LIMIT 30
      `).all(),
    ]);

    return Response.json({
      range: { from: dateFrom, to: dateTo, today },
      summary: {
        totalMerchants: Number(summary?.total_merchants ?? 0),
        pendingKyc: Number(summary?.pending_kyc ?? 0),
        approvedKyc: Number(summary?.approved_kyc ?? 0),
        cancelledKyc: Number(summary?.cancelled_kyc ?? 0),
        unassigned: Number(summary?.unassigned ?? 0),
        totalAgents: agentResult.results.length,
        todayTransactions: Number(paymentToday?.transaction_count ?? 0),
        todayUsage: Number(paymentToday?.total_cents ?? 0) / 100,
        totalTransactions: Number(paymentAll?.transaction_count ?? 0),
        totalUsage: Number(paymentAll?.total_cents ?? 0) / 100,
        periodTransactions: Number(paymentPeriod?.transaction_count ?? 0),
        periodUsage: Number(paymentPeriod?.total_cents ?? 0) / 100,
      },
      merchants: merchantResult.results.map((row) => ({
        id: String(row.id), applicationNumber: String(row.application_number), phone: String(row.phone),
        name: `${String(row.first_name)} ${String(row.last_name)}`.trim(), address: String(row.address),
        businessDescription: String(row.business_description), agentId: row.agent_id ? String(row.agent_id) : null,
        agentReference: String(row.agent_reference ?? ""), agentCode: row.agent_code ? String(row.agent_code) : null,
        agentPhone: row.agent_phone ? String(row.agent_phone) : null, agentName: row.agent_name ? String(row.agent_name) : null,
        kycStatus: String(row.kyc_status), kycNote: String(row.kyc_note ?? ""), status: String(row.status),
        createdAt: String(row.created_at), approvedAt: row.approved_at ? String(row.approved_at) : null,
        tableCount: Number(row.table_count), orderCount: Number(row.order_count),
        orderTotal: Number(row.order_total_cents) / 100, lastOrderAt: row.last_order_at ? String(row.last_order_at) : null,
      })),
      agents: agentResult.results.map((row) => ({
        id: String(row.id), code: String(row.code), phone: String(row.phone), name: String(row.name),
        externalId: row.external_id ? String(row.external_id) : null, source: String(row.source ?? "local"),
        syncedAt: row.synced_at ? String(row.synced_at) : null,
        status: String(row.status), note: String(row.note ?? ""), createdAt: String(row.created_at),
        merchantCount: Number(row.merchant_count), approvedCount: Number(row.approved_count),
        orderCount: Number(row.order_count), orderTotal: Number(row.order_total_cents) / 100,
        lastOrderAt: row.last_order_at ? String(row.last_order_at) : null,
      })),
      dailyUsage: dailyResult.results.map((row) => ({ date: String(row.usage_date), transactionCount: Number(row.transaction_count), total: Number(row.total_cents) / 100 })),
      paymentChannels: channelResult.results.map((row) => ({
        method: String(row.method), transactionCount: Number(row.transaction_count), total: Number(row.total_cents) / 100,
      })),
      reviews: reviewResult.results.map((row) => ({
        id: String(row.id), applicationId: String(row.application_id), action: String(row.action),
        previousStatus: String(row.previous_status), nextStatus: String(row.next_status), note: String(row.note ?? ""),
        reviewedBy: String(row.reviewed_by), createdAt: String(row.created_at), applicationNumber: String(row.application_number),
        merchantName: `${String(row.first_name)} ${String(row.last_name)}`.trim(), agentCode: row.agent_code ? String(row.agent_code) : null,
      })),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "โหลดข้อมูลหลังบ้านไม่สำเร็จ" }, { status: 500 });
  }
}
