import { adminUnauthorized, getAdminSession } from "../../../../lib/admin-auth";
import { lookupHubMerchant } from "../../../../lib/chatposhub";

export async function GET(request: Request) {
  try {
    const admin = await getAdminSession(request);
    if (!admin) return adminUnauthorized();
    const url = new URL(request.url);
    const phone = url.searchParams.get("phone") ?? "";
    const groupId = url.searchParams.get("groupId") ?? "";
    const result = await lookupHubMerchant(phone, groupId);
    return Response.json(result, { status: result.found ? 200 : 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "ตรวจสอบเบอร์ไม่สำเร็จ" }, { status: 500 });
  }
}
