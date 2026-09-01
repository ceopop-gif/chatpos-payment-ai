import {
  adminCredentialsConfigured,
  adminSessionCookie,
  createAdminSession,
  deleteAdminSession,
  getAdminSession,
  verifyAdminCredentials,
} from "../../../../lib/admin-auth";

export async function GET(request: Request) {
  try {
    const session = await getAdminSession(request);
    return Response.json({ authenticated: Boolean(session), admin: session }, { status: session ? 200 : 401 });
  } catch {
    return Response.json({ authenticated: false, admin: null }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    if (!adminCredentialsConfigured()) {
      return Response.json({ error: "ระบบยังไม่ได้ตั้งค่าบัญชีผู้ดูแล กรุณาติดต่อผู้ดูแลระบบ" }, { status: 503 });
    }
    const payload = (await request.json()) as { username?: string; password?: string };
    const username = String(payload.username ?? "").trim();
    const password = String(payload.password ?? "");
    if (!(await verifyAdminCredentials(username, password))) {
      return Response.json({ error: "Username หรือรหัสผ่านผู้ดูแลไม่ถูกต้อง" }, { status: 401 });
    }
    const session = await createAdminSession(username);
    return new Response(JSON.stringify({ authenticated: true, admin: { username } }), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "set-cookie": adminSessionCookie(session.token, session.maxAge),
      },
    });
  } catch {
    return Response.json({ error: "เข้าสู่ระบบผู้ดูแลไม่สำเร็จ กรุณาลองอีกครั้ง" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try { await deleteAdminSession(request); } catch { /* Clear the browser cookie below. */ }
  return new Response(JSON.stringify({ signedOut: true }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "set-cookie": adminSessionCookie("", 0),
    },
  });
}
