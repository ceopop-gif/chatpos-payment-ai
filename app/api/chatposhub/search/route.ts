import { adminUnauthorized, getAdminSession } from "../../../../lib/admin-auth";
import { searchHubMerchants } from "../../../../lib/chatposhub";

export async function GET(request: Request) {
  try {
    const admin = await getAdminSession(request);
    if (!admin) return adminUnauthorized();

    const url = new URL(request.url);
    const groupId = String(url.searchParams.get("groupId") ?? "").trim();
    const query = String(url.searchParams.get("q") ?? "").trim();

    if (!groupId) return Response.json({ error: "ไม่พบรหัสกลุ่ม" }, { status: 400 });

    const results = await searchHubMerchants(query, groupId);
    return Response.json({
      query,
      results,
      summary: {
        total: results.length,
        eligible: results.filter((item) => item.eligible).length,
        blocked: results.filter((item) => !item.eligible).length,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "ค้นหาร้านไม่สำเร็จ" },
      { status: 500 },
    );
  }
}
