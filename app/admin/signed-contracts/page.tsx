"use client";
import { useEffect, useState } from "react";
import "./report.css";

type RecordRow = { id: string; shop_name: string; signer_name: string; phone: string; contract_version: string; signed_at: string; contract_text?: string; signature_data?: string };
const dateLabel = (value: string) => new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : value.replace(" ", "T") + "Z").toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
export default function SignedContractsReport() {
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState({ q: "", from: "", to: "", page: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<RecordRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setRows([]);
    const params = new URLSearchParams({ ...query, page: String(query.page) });
    fetch(`/api/admin/signed-contracts?${params}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      if (response.status === 401) { window.location.assign("/admin/login"); return; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setRows(data.records); setTotal(data.total);
    }).catch(e => { if (!controller.signal.aborted) setError(e.message || "โหลดรายงานไม่สำเร็จ"); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query]);
  async function view(id: string) {
    setDetailLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/signed-contracts?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (response.status === 401) { window.location.assign("/admin/login"); return; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSelected(data.record);
    } catch (e) { setError(e instanceof Error ? e.message : "เปิดสัญญาไม่สำเร็จ"); }
    finally { setDetailLoading(false); }
  }
  return <main className="signed-report">
    <a href="/admin">← กลับ Admin</a>
    <h1>รายงานที่เซ็นสัญญาแล้ว</h1>
    <p>หลักฐานการเซ็นสัญญาของร้านค้า • วันเวลาประเทศไทย</p>
    <form onSubmit={e => { e.preventDefault(); setQuery({ q, from, to, page: 1 }); }}>
      <label>ค้นหาร้าน / ชื่อผู้เซ็น / เบอร์โทร<input value={q} onChange={e => setQ(e.target.value)} maxLength={100} /></label>
      <label>วันที่เริ่มต้น<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
      <label>วันที่สิ้นสุด<input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} /></label>
      <button type="submit">ค้นหา</button>
    </form>
    {error && <p role="alert">{error} <button onClick={() => setQuery({ ...query })}>ลองอีกครั้ง</button></p>}
    {loading ? <p role="status">กำลังโหลดรายงาน…</p> : !error && <>
      <p>พบ {total.toLocaleString("th-TH")} สัญญา</p>
      <div className="report-scroll"><table><thead><tr>{["ชื่อร้าน", "ผู้เซ็น", "เบอร์โทร", "วันที่เซ็น", "เวอร์ชัน", "สัญญา"].map(x => <th key={x}>{x}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}><td>{row.shop_name}</td><td>{row.signer_name}</td><td>{row.phone}</td><td>{dateLabel(row.signed_at)}</td><td>{row.contract_version}</td><td><button disabled={detailLoading} onClick={() => void view(row.id)}>ดูสัญญาและลายเซ็น</button></td></tr>)}</tbody></table></div>
      {!rows.length && <p>ยังไม่มีรายการเซ็นสัญญาที่ตรงกับเงื่อนไข</p>}
      <footer><button disabled={query.page <= 1} onClick={() => setQuery({ ...query, page: query.page - 1 })}>ก่อนหน้า</button><span>หน้า {query.page}</span><button disabled={query.page * 50 >= total} onClick={() => setQuery({ ...query, page: query.page + 1 })}>ถัดไป</button></footer>
    </>}
    {selected && <div className="contract-backdrop"><section role="dialog" aria-modal="true" aria-label="สัญญาที่เซ็นแล้ว" className="contract-detail">
      <button autoFocus onClick={() => setSelected(null)}>ปิด</button><h2>สัญญาที่เซ็นแล้ว</h2>
      <p>{selected.shop_name} • {selected.signer_name} • {selected.phone}</p><p>เวอร์ชัน {selected.contract_version} • {dateLabel(selected.signed_at)}</p>
      <div className="contract-text">{selected.contract_text}</div>
      <h3>ลายเซ็นผู้ยอมรับสัญญา</h3>
      {selected.signature_data && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(selected.signature_data) ? <img src={selected.signature_data} alt="ลายเซ็นผู้ยอมรับสัญญา" /> : <p>ไม่สามารถแสดงลายเซ็นได้ กรุณาตรวจสอบรูปแบบหลักฐาน</p>}
    </section></div>}
  </main>;
}
