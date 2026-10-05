import { getBucket, getD1 } from "../../../../db";
import { ensureStopPaySchema, getVerifiedSession, makeCaseNumber } from "../../../../lib/stoppay";

const allowedReasons = new Set(["not_received", "fraud", "service_not_as_agreed", "other"]);

export async function POST(request: Request) {
  try {
    await ensureStopPaySchema();
    const form = await request.formData();
    const verificationToken = String(form.get("verificationToken") ?? "");
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

    const verified = await getVerifiedSession(verificationToken);
    if (!verified) return Response.json({ error: "การยืนยัน OTP หมดอายุ กรุณายืนยันใหม่" }, { status: 401 });

    const db = getD1();
    const existing = await db.prepare(
      "SELECT case_number, status, merchant_contact_deadline FROM stoppay_cases WHERE operation_id = ? LIMIT 1"
    ).bind(String(verified.operation_id)).first();
    if (existing) {
      return Response.json({
        duplicate: true,
        caseNumber: String(existing.case_number),
        status: String(existing.status),
        merchantContactDeadline: String(existing.merchant_contact_deadline),
      });
    }

    const caseId = crypto.randomUUID();
    const caseNumber = makeCaseNumber();
    const safeExt = slip.type.includes("png") ? "png" : slip.type.includes("webp") ? "webp" : "jpg";
    const objectKey = `stoppay/${caseId}/slip.${safeExt}`;
    await getBucket().put(objectKey, await slip.arrayBuffer(), {
      httpMetadata: { contentType: slip.type || "image/jpeg" },
      customMetadata: { caseNumber },
    });

    await db.prepare(`
      INSERT INTO stoppay_cases (
        id, case_number, operation_id, gateway_reference, merchant_id, amount_cents, paid_at,
        slip_object_key, slip_reference, reporter_name, reporter_phone, reason_code, reason_detail,
        declaration_accepted, otp_verified_at, status, merchant_contact_deadline
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP,
        'merchant_action_required', datetime('now', '+48 hours'))
    `).bind(
      caseId,
      caseNumber,
      String(verified.operation_id),
      verified.gateway_reference ? String(verified.gateway_reference) : null,
      String(verified.merchant_id),
      Number(verified.amount_cents),
      String(verified.paid_at),
      objectKey,
      verified.slip_reference ? String(verified.slip_reference) : null,
      String(verified.reporter_name),
      String(verified.phone),
      reasonCode,
      reasonDetail,
    ).run();

    await db.prepare(
      "INSERT INTO stoppay_events (id, case_id, event_type, actor_type, note) VALUES (?, ?, 'case_created', 'customer', ?)"
    ).bind(crypto.randomUUID(), caseId, reasonDetail).run();

    const created = await db.prepare(
      "SELECT merchant_contact_deadline FROM stoppay_cases WHERE id = ?"
    ).bind(caseId).first();

    return Response.json({
      caseNumber,
      status: "merchant_action_required",
      merchantContactDeadline: String(created?.merchant_contact_deadline ?? ""),
      message: "รับเรื่อง STOPPAY แล้ว ระบบแจ้งร้านให้ติดต่อผู้แจ้งภายใน 48 ชั่วโมง",
    }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "สร้างเคส STOPPAY ไม่สำเร็จ" }, { status: 500 });
  }
}
