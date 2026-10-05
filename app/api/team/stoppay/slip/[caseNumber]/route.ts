import { getBucket, getD1 } from "../../../../../../db";
import { adminUnauthorized, getAdminSession } from "../../../../../../lib/admin-auth";
import { ensureStopPaySchema } from "../../../../../../lib/stoppay";

export async function GET(request: Request, context: { params: Promise<{ caseNumber: string }> }) {
  const session = await getAdminSession(request);
  if (!session) return adminUnauthorized();
  await ensureStopPaySchema();

  const { caseNumber } = await context.params;
  const row = await getD1().prepare(
    "SELECT slip_object_key FROM stoppay_cases WHERE case_number = ? LIMIT 1"
  ).bind(caseNumber.toUpperCase()).first();
  if (!row?.slip_object_key) return Response.json({ error: "ไม่พบรูปสลิป" }, { status: 404 });

  const object = await getBucket().get(String(row.slip_object_key));
  if (!object) return Response.json({ error: "ไม่พบไฟล์สลิป" }, { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Content-Security-Policy", "default-src 'none'");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(object.body, { headers });
}
