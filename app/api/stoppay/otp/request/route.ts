import { requestStopPayOtp } from "../../../../../lib/stoppay";

export async function POST(request: Request) {
  try {
    const input = await request.json() as { lookupToken?: string; phone?: string; name?: string };
    const result = await requestStopPayOtp({
      lookupToken: String(input.lookupToken ?? ""),
      phone: String(input.phone ?? ""),
      name: String(input.name ?? ""),
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "ส่ง OTP ไม่สำเร็จ" }, { status: 422 });
  }
}
