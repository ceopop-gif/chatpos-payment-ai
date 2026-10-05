import { getBucket, getD1 } from "../../../../db";
import {
  ensureStopPaySchema,
  getLookup,
  getVerifiedStopPayIdentity,
  makeCaseNumber,
} from "../../../../lib/stoppay";

const allowedReasons = new Set(["not_received", "fraud", "service_not_as_agreed", "other"]);

export async function POST(request: Request) {
  try {
    await ensureStopPaySchema();
    const form = await request.formData();
    const identityToken = String(form.get("identityToken") ?? "");
    const lookupToken = String(form.get("lookupToken") ?? "");
    const reasonCode = String(form.get("reasonCode") ?? "");
    const reasonDetail = String(form.get("reasonDetail") ?? "").trim().slice(0, 2000);
    const declarationAccepted = String(form.get("declarationAccepted") ?? "") === "true";
    const slip = form.get("slip");

    if (!allowedReasons.has(reasonCode)) return Response.json({ error: "กรุณาเลือกเหตุผล" }, { status: 400 });
    if (reasonDetail.length < 5) return Response.json({ error: "กรุณาอธิบายเหตุการณ์ให้ชัดเจน" }, { status: 400 });
    if (!declarationAccepted) return Response.json({ error: "กรุณายืนยันว่าการแจ้งเป็นข้อมูลจริง" }, { status: 400 });
    if (!(slip instanceof File) || !slip.type.startsWith("image/") || !slip.size || slip.size > 6 * 1024 * 1024) {
      return Response.json({ error: "กรุณาแนบรูปสลิปที่ถูกต้อง ขนาดไม่เกิน 6 MB" }, { status: 400 });
    }

    const [identity, lookup] = await Promise.all([
      getVerifiedStopPayIdentity(identityToken),
      getLookup(lookupToken),
    ]);
    if (!identity) return Response.json({ error: "การยืนยันชื่อและเบอร์มือถือหมดอายุ กรุณาขอ OTP ใหม่" }, { status: 401 });
    if (!lookup) return Response.json({ error: "ข้อมูลค้นหารายการหมดอายุ กรุณาตรวจสลิปใหม่" }, { status: 410 });

    const db = getD1();
    const existing = await db.prepare(
      "SELECT case_number, status, merchant_contact_deadline FROM stoppay_cases WHERE operation_id = ? LIMIT 1"
    ).bind(String(lookup.operation_id)).first();
    if (existing) {
      return Response.json({
        duplicate: true,
        caseNumber: String(existing.case_number),
        status: String(existing.status),
        merchantContactDeadline: String(existing.merchant_contact_deadline),
      });
    }

    const operation = await db.prepare(
      "SELECT id, gateway_reference, merchant_id, amount_cents, status FROM chatpos_gateway_operations WHERE id = ? AND operation_type = 'payment' LIMIT 1"
    ).bind(String(lookup.operation_id)).first();
    if (!operation || String(operation.status) !== "success") {
      return Response.json({ error: "รายการรับชำระนี้ไม่อยู่ในสถานะสำเร็จ" }, { status: 409 });
    }
    if (
      String(operation.merchant_id) !== String(lookup.merchant_id) ||
      Number(operation.amount_cents) !== Number(lookup.amount_cents)
    ) {
      return Response.json({ error: "ข้อมูลรายการไม่ตรงกัน กรุณาตรวจสอบใหม่" }, { status: 409 });
    }

    const caseId = crypto.randomUUID();
    const caseNumber = makeCaseNumber();
    const safeExt = slip.type.includes("png") ? "png" : slip.type.includes("webp") ? "webp" : "jpg";
    const objectKey = `stoppay/${caseId}/slip.${safeExt}`;
    await getBucket().put(objectKey, await slip.arrayBuffer(), {
      httpMetadata: { contentType: slip.type || "image/jpeg" },
      customMetadata: { caseNumber },
    });

    const reporterName = (String(identity.first_name) + " " + String(identity.last_name)).trim();
    await db.prepare(`
      INSERT INTO stoppay_cases (
        id, case_number, operation_id, gateway_reference, merchant_id, amount_cents, paid_at,
        slip_object_key, slip_reference, reporter_name, reporter_phone, reason_code, reason_detail,
        declaration_accepted, otp_verified_at, status, merchant_contact_deadline, hold_requested_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP,
        'team_review_required', datetime('now', '+48 hours'), CURRENT_TIMESTAMP)
    `).bind(
      caseId,
      caseNumber,
      String(operation.id),
      operation.gateway_reference ? String(operation.gateway_reference) : null,
      String(operation.merchant_id),
      Number(operation.amount_cents),
      String(lookup.paid_at),
      objectKey,
      lookup.slip_reference ? String(lookup.slip_reference) : null,
      reporterName,
      String(identity.phone),
      reasonCode,
      reasonDetail,
    ).run();

    await db.batch([
      db.prepare(
        "INSERT INTO stoppay_events (id, case_id, event_type, actor_type, note) VALUES (?, ?, 'case_created', 'customer', ?)"
      ).bind(crypto.randomUUID(), caseId, reasonDetail),
      db.prepare(
        "INSERT INTO stoppay_events (id, case_id, event_type, actor_type, note) VALUES (?, ?, 'amount_held', 'system', ?)"
      ).bind(crypto.randomUUID(), caseId, "ล็อกยอดรายการก่อนครบ 24 ชั่วโมงเพื่อไม่ให้รวมเป็นยอดพร้อมถอนจนกว่า Team จะยกเลิก STOPPAY"),
    ]);

    return Response.json({
      caseNumber,
      status: "team_review_required",
      heldAmount: Number(operation.amount_cents) / 100,
      message: "รับเรื่อง STOPPAY แล้ว ยอดรายการนี้ถูกล็อกและส่งให้เจ้าหน้าที่ Team ตรวจสอบ",
    }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "สร้างเคส STOPPAY ไม่สำเร็จ" }, { status: 500 });
  }
}
