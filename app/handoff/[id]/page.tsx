"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, CheckCircle2, ChefHat, ClipboardCheck, Clock3, Copy, MessageCircle, PackageCheck, ReceiptText, RefreshCw, Store, UtensilsCrossed, X } from "lucide-react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

type HandoffStatus = "new" | "accepted" | "kitchen_received" | "done";

type HandoffOrder = {
  id: string;
  orderNumber: string;
  status: HandoffStatus;
  total: number;
  note: string;
  createdAt: string;
  updatedAt: string;
  tableId: number;
  tableName: string;
  merchant: string;
  items: Array<{ productId: number; name: string; price: number; quantity: number }>;
};

const money = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const statusCopy: Record<HandoffStatus, { title: string; description: string }> = {
  new: { title: "รอผู้รับกดรับเรื่อง", description: "กดรับเรื่องเพื่อแจ้งร้านว่ามีผู้ดูแลใบสั่งนี้แล้ว" },
  accepted: { title: "รับเรื่องแล้ว", description: "เมื่อได้รับอาหารจากครัวแล้ว ให้กดปุ่มด้านล่าง" },
  kitchen_received: { title: "รับอาหารจากครัวแล้ว", description: "รายการนี้อยู่กับผู้รับอาหารและพร้อมนำไปส่งที่โต๊ะ" },
  done: { title: "ออเดอร์เสร็จเรียบร้อย", description: "ร้านปิดรายการนี้แล้ว" },
};

export default function OrderHandoffPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const [order, setOrder] = useState<HandoffOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");

  const loadOrder = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch(`/api/order-handoff?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const payload = await response.json() as { order?: HandoffOrder; error?: string };
      if (!response.ok || !payload.order) throw new Error(payload.error || "เปิดใบสั่งไม่สำเร็จ");
      setOrder(payload.order);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "เปิดใบสั่งไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadOrder(true);
    const timer = window.setInterval(() => void loadOrder(), 3000);
    return () => window.clearInterval(timer);
  }, [loadOrder]);

  const updateOrder = async (action: "accept" | "pickup") => {
    setUpdating(true);
    try {
      const response = await fetch("/api/order-handoff", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const payload = await response.json() as { order?: HandoffOrder; error?: string };
      if (!response.ok || !payload.order) throw new Error(payload.error || "อัปเดตใบสั่งไม่สำเร็จ");
      setOrder(payload.order);
      toast.success(action === "accept" ? "รับเรื่องเรียบร้อยแล้ว" : "ยืนยันรับอาหารจากครัวแล้ว");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "อัปเดตใบสั่งไม่สำเร็จ");
    } finally {
      setUpdating(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("คัดลอกลิงก์ใบสั่งแล้ว");
    } catch {
      toast.error("คัดลอกลิงก์ไม่สำเร็จ");
    }
  };

  const shareLine = () => {
    if (!order) return;
    const message = `ใบสั่งอาหาร #${order.orderNumber}\n${order.tableName} · ฿${money.format(order.total)}\nเปิดดูและรับเรื่อง: ${window.location.href}`;
    window.location.href = `https://line.me/R/share?text=${encodeURIComponent(message)}`;
  };

  const returnToOrders = () => {
    window.location.assign("/?view=orders");
  };

  if (loading) return <div className="handoff-shell"><div className="handoff-loading"><RefreshCw /><strong>กำลังเปิดใบสั่งอาหาร...</strong></div></div>;
  if (error || !order) return <div className="handoff-shell"><div className="handoff-error"><X /><strong>เปิดใบสั่งไม่ได้</strong><p>{error || "ไม่พบใบสั่งอาหาร"}</p><button type="button" onClick={() => void loadOrder(true)}><RefreshCw /> ลองใหม่</button></div></div>;

  const status = statusCopy[order.status];

  return (
    <div className="handoff-shell">
      <header className="handoff-header">
        <button type="button" onClick={returnToOrders} aria-label="กลับหน้าออเดอร์"><ArrowLeft /></button>
        <span><small>CHATPOS ORDER LINK</small><strong>ใบสั่งอาหาร</strong></span>
        <b><UtensilsCrossed /> {order.tableName}</b>
      </header>

      <main className="handoff-main">
        <section className={`handoff-status-card ${order.status}`}>
          <span>{order.status === "new" ? <Clock3 /> : order.status === "accepted" ? <ClipboardCheck /> : <CheckCircle2 />}</span>
          <div><small>สถานะล่าสุด</small><h1>{status.title}</h1><p>{status.description}</p></div>
        </section>

        <section className="handoff-order-card">
          <div className="handoff-order-head">
            <span><ReceiptText /><small>เลขที่ใบสั่ง</small><strong>#{order.orderNumber}</strong></span>
            <span><Store /><small>ร้าน</small><strong>{order.merchant}</strong></span>
          </div>

          <div className="handoff-items">
            {order.items.map((item) => (
              <div key={`${item.productId}-${item.name}`}>
                <span><b>{item.quantity}</b><strong>{item.name}</strong></span>
                <strong>฿{money.format(item.price * item.quantity)}</strong>
              </div>
            ))}
          </div>

          {order.note && <aside><strong>หมายเหตุจากโต๊ะ</strong><p>{order.note}</p></aside>}
          <div className="handoff-total"><span>ยอดรวม · {order.tableName}</span><strong>฿{money.format(order.total)}</strong></div>
        </section>

        <section className="handoff-progress" aria-label="ขั้นตอนดำเนินการ">
          <div className={order.status !== "new" ? "done" : "active"}><span>{order.status === "new" ? "1" : <Check />}</span><p><strong>รับเรื่อง</strong><small>ยืนยันผู้ดูแลใบสั่ง</small></p></div>
          <i />
          <div className={["kitchen_received", "done"].includes(order.status) ? "done" : order.status === "accepted" ? "active" : ""}><span>{["kitchen_received", "done"].includes(order.status) ? <Check /> : "2"}</span><p><strong>รับจากครัว</strong><small>อาหารอยู่กับผู้รับแล้ว</small></p></div>
        </section>

        {order.status === "new" && <button type="button" className="handoff-primary-button" disabled={updating} onClick={() => void updateOrder("accept")}><ClipboardCheck /> {updating ? "กำลังรับเรื่อง..." : "รับเรื่อง"}</button>}
        {order.status === "accepted" && <button type="button" className="handoff-primary-button kitchen" disabled={updating} onClick={() => void updateOrder("pickup")}><ChefHat /> {updating ? "กำลังยืนยัน..." : "รับอาหารจากครัว"}</button>}
        {["kitchen_received", "done"].includes(order.status) && <div className="handoff-complete"><PackageCheck /><span><strong>{order.status === "done" ? "ดำเนินการเสร็จแล้ว" : "รับอาหารเรียบร้อยแล้ว"}</strong><small>สถานะถูกส่งกลับไปยังหน้าร้านอัตโนมัติ</small></span></div>}

        <section className="handoff-share">
          <p>ต้องส่งต่อให้ผู้รับคนอื่น?</p>
          <div><button type="button" onClick={shareLine}><MessageCircle /> ส่งต่อใน LINE</button><button type="button" onClick={copyLink}><Copy /> คัดลอกลิงก์</button></div>
        </section>
      </main>
      <Toaster position="top-center" richColors />
    </div>
  );
}
