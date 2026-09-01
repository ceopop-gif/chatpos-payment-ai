import { getD1 } from "../../../db";
import { getMerchantSession, unauthorizedResponse } from "../../../lib/merchant-auth";
import { membershipReport, subscribeMerchant } from "../../../lib/membership-billing";

export async function GET(request: Request) {
  try {
    const session = await getMerchantSession(request);
    if (!session) return unauthorizedResponse();
    return Response.json(await membershipReport(getD1(), session.applicationId));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "โหลดข้อมูลสมาชิกไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getMerchantSession(request);
    if (!session) return unauthorizedResponse();
    const payload = (await request.json().catch(() => ({}))) as { action?: string; acceptTerms?: boolean };
    if (payload.action !== "subscribe" || payload.acceptTerms !== true) {
      return Response.json({ error: "กรุณายืนยันเงื่อนไขการสมัครสมาชิก" }, { status: 400 });
    }
    const db = getD1();
    await subscribeMerchant(db, session.applicationId);
    return Response.json(await membershipReport(db, session.applicationId), { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "สมัครสมาชิกไม่สำเร็จ" }, { status: 500 });
  }
}

