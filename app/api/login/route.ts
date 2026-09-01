import { getD1 } from "../../../db";
import {
  createMerchantSession,
  deleteMerchantSession,
  getMerchantSession,
  merchantSessionCookie,
  normalizeMobile,
  verifyPassword,
} from "../../../lib/merchant-auth";

export async function GET(request: Request) {
  try {
    const session = await getMerchantSession(request);
    return Response.json({
      authenticated: Boolean(session),
      merchant: session ? {
        username: session.username,
        name: (session.firstName + " " + session.lastName).trim(),
        status: session.status,
      } : null,
    }, { status: session ? 200 : 401 });
  } catch {
    return Response.json({ authenticated: false, merchant: null }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { username?: string; password?: string };
    const username = normalizeMobile(payload.username);
    const password = String(payload.password ?? "");
    if (!/^0[689]\d{8}$/.test(username) || password.length < 8 || password.length > 128) {
      return Response.json({ error: "Username หรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบแล้วลองอีกครั้ง" }, { status: 401 });
    }

    const account = await getD1().prepare(
      "SELECT id, username, password_hash, password_salt, password_iterations, first_name, last_name, status FROM merchant_applications WHERE username = ? LIMIT 1"
    ).bind(username).first();
    const passwordMatches = account
      ? await verifyPassword(
        password,
        String(account.password_hash ?? ""),
        String(account.password_salt ?? ""),
        Number(account.password_iterations ?? 0),
      )
      : false;
    if (!account || !passwordMatches) {
      return Response.json({ error: "Username หรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบแล้วลองอีกครั้ง" }, { status: 401 });
    }
    if (String(account.status) === "suspended") {
      return Response.json({ error: "บัญชีร้านถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแล ChatPOS" }, { status: 403 });
    }

    const session = await createMerchantSession(String(account.id));
    return new Response(JSON.stringify({
      authenticated: true,
      merchant: {
        username: String(account.username),
        name: (String(account.first_name) + " " + String(account.last_name)).trim(),
        status: String(account.status),
      },
    }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "set-cookie": merchantSessionCookie(session.token, session.maxAge),
      },
    });
  } catch {
    return Response.json({
      error: "ระบบยังเข้าสู่ระบบไม่ได้ กรุณาลองอีกครั้ง หากยังไม่สำเร็จให้ปิดหน้าแล้วเปิดลิงก์ใหม่",
    }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await deleteMerchantSession(request);
  } catch {
    // Clearing the browser cookie below still signs this device out.
  }
  return new Response(JSON.stringify({ signedOut: true }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "set-cookie": merchantSessionCookie("", 0),
    },
  });
}
