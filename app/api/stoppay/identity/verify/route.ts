import { verifyStopPayIdentityOtp } from "../../../../../lib/stoppay";

export async function POST(request: Request) {
  try {
    const input = await request.json() as { sessionId?: string; otpCode?: string };
    const result = await verifyStopPayIdentityOtp({
      sessionId: String(input.sessionId ?? ""),
      otpCode: String(input.otpCode ?? ""),
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "ยืนยัน OTP ไม่สำเร็จ" }, { status: 422 });
  }
}
