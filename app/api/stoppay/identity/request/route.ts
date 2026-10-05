import { requestStopPayIdentityOtp } from "../../../../../lib/stoppay";

export async function POST(request: Request) {
  try {
    const input = await request.json() as { firstName?: string; lastName?: string; phone?: string };
    const result = await requestStopPayIdentityOtp({
      firstName: String(input.firstName ?? ""),
      lastName: String(input.lastName ?? ""),
      phone: String(input.phone ?? ""),
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "ส่ง OTP ไม่สำเร็จ" }, { status: 422 });
  }
}
