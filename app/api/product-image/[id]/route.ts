import { getBucket } from "../../../../db";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^\d+$/.test(id)) return new Response("Not found", { status: 404 });
  const merchantId = new URL(request.url).searchParams.get("merchant") ?? "";
  if (merchantId && !/^[a-zA-Z0-9-]{8,80}$/.test(merchantId)) return new Response("Not found", { status: 404 });

  try {
    const object = await getBucket().get(merchantId ? `menu-products/${merchantId}/${id}` : `menu-products/${id}`);
    if (!object) return new Response("Not found", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "public, max-age=86400");
    return new Response(object.body, { headers });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
