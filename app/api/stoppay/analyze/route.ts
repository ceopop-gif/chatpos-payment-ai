import { extractSlipData, findPaymentBySlip, getVerifiedStopPayIdentity } from "../../../../lib/stoppay";

function normalizePaidAt(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/Z$|[+-]\d\d:\d\d$/.test(trimmed)) return trimmed;
  return trimmed + ":00+07:00";
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const identityToken = String(form.get("identityToken") ?? "");
    const identity = await getVerifiedStopPayIdentity(identityToken);
    if (!identity) {
      return Response.json({ error: "กรุณายืนยันชื่อ นามสกุล และเบอร์มือถือด้วย OTP ก่อนตรวจสอบสลิป" }, { status: 401 });
    }

    const manualAmount = Number(form.get("amount") ?? 0);
    const manualPaidAt = normalizePaidAt(String(form.get("paidAt") ?? ""));
    const manualReference = String(form.get("slipReference") ?? "").trim();
    const file = form.get("slip");
    if (!(file instanceof File) || !file.size) {
      return Response.json({ error: "กรุณาแนบรูปสลิป" }, { status: 400 });
    }

    if (manualAmount > 0 && manualPaidAt) {
      const match = await findPaymentBySlip({
        amount: manualAmount,
        paidAt: manualPaidAt,
        slipReference: manualReference || null,
      });
      return Response.json({ extracted: { amount: manualAmount, paidAt: match.paidAt, transactionReference: manualReference || null }, match });
    }

    const extracted = await extractSlipData(file);
    if (extracted.needsManual) {
      return Response.json({ needsManual: true, reason: extracted.reason });
    }
    if (!extracted.amount || !extracted.paidAt) {
      return Response.json({ needsManual: true, reason: "อ่านยอดเงินหรือวันเวลาไม่ครบ กรุณากรอกข้อมูลด้วยตนเอง", extracted });
    }

    const match = await findPaymentBySlip({
      amount: extracted.amount,
      paidAt: extracted.paidAt,
      slipReference: extracted.transactionReference,
    });
    return Response.json({ extracted, match });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "ตรวจสอบสลิปไม่สำเร็จ" }, { status: 422 });
  }
}
