# Signed contract report

Route: /admin/signed-contracts. Admin menu: รายงานที่เซ็นสัญญาแล้ว.

Authenticated GET /api/admin/signed-contracts supports q, from, to, page and id for detail. Date filters use Asia/Bangkok. Lists exclude signatures and contract bodies; detail fetches one record. Responses are private/no-store.

Before deployment apply drizzle/0015_signed_contracts.sql to the existing D1 database. No historical consent checkbox is treated as a signature.

Integration still required: the existing merchant signing workflow must append a merchant_signed_contracts record after successful authenticated signing, with merchant_id from the session, shop_name/signer_name/phone snapshots, immutable contract_version/contract_text, validated PNG/JPEG base64 signature_data and server-generated UTC signed_at. Do not overwrite earlier signed versions. This repository has no signing workflow yet; this change does not invent signatures or migrate unsigned users as signed.

The report is implemented but production deployment and signing integration are not completed.
