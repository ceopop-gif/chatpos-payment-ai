# ChatPOS Gateway v2

ระบบนี้แทน payment flow เดิมที่บันทึก transaction เป็น success ทันที โดยยึด Gateway status/webhook เป็นแหล่งความจริง

## สิ่งที่เพิ่ม

- `POST /api/payments` สร้าง Pay-in ผ่าน ChatPOS Gateway จริง
- `POST /api/payouts` สร้าง Pay-out ผ่าน ChatPOS Gateway จริง และจำกัด 50,000 บาท/รายการ
- `GET /api/chatpos-status/{gatewayReference}` ตรวจ/reconcile รายการเดิม
- `POST /api/chatpos-webhooks/{merchantId}` รับ signed webhook และกัน event ซ้ำ
- `GET/POST /api/admin/chatpos-config` ตั้งค่า Gateway รายร้านโดย Admin
- ตารางใหม่ `chatpos_merchant_configs`, `chatpos_gateway_operations`, `chatpos_webhook_inbox`

## Secret

ห้ามเก็บ API secret หรือ webhook secret ลงฐานข้อมูล

ใน `chatpos_merchant_configs` ให้เก็บเฉพาะชื่อ Cloudflare secret binding เช่น:

- `CHATPOS_MERCHANT_ABC_API_SECRET`
- `CHATPOS_MERCHANT_ABC_WEBHOOK_SECRET`

ค่าจริงต้องถูกตั้งเป็น Cloudflare server secret ของ deployment นั้น

## Merchant config

ร้านต้อง KYC approved และ status approved ก่อนเปิด `enabled=true`

Config ต้องมี:

- environment: test/live
- baseUrl
- credentialEnvName
- webhookSecretEnvName
- merchantReference
- branchReference
- businessUnitReference
- agentReference
- partnerReference
- merchant/contact info
- commercial JSON ที่ตรงกับ rate/relationship/membership/withdrawal policy ปัจจุบัน
- webhookCallbackUrl / successRedirectUrl / failedRedirectUrl ตามที่ใช้งานจริง

`commercial.relationship.agentReference` ต้องตรงกับ top-level agentReference และ `commercial.relationship.pdReference` ต้องตรง partnerReference

## Webhook

Receiver ตรวจ:

1. `X-LLGW-Event-Id`
2. `X-LLGW-Timestamp` ภายใน 300 วินาที
3. `X-LLGW-Signature = v1=<HMAC SHA256>`
4. HMAC ใช้ `timestamp + "." + rawBody`
5. eventId ใน signed body ต้องตรง header
6. amount/currency/clientReference ต้องตรง local operation
7. event ซ้ำไม่ลงสถานะซ้ำ
8. success ไม่ถูก event เก่าย้อนกลับเป็น pending/failed

## Timeout / unknown outcome

Network timeout ไม่ถือว่า failed และไม่คืนยอดอัตโนมัติ ระบบตั้ง `verification_pending` และต้องตรวจ gatewayReference เดิม/operation เดิมก่อนทำรายการใหม่

## ก่อน Go-live

- apply migration `drizzle/0010_chatpos_gateway_v2.sql`
- provision Cloudflare secrets
- ตั้ง merchant config ด้วย Admin
- ลงทะเบียน webhook URL ของร้านกับ Gateway
- ทดสอบ test environment ก่อน live
- ตรวจ enabled payment channels และ commercial config จริง
- ห้ามถือ HTTP 200 หรือ providerCode=200000 เป็น final success โดยลำพัง
