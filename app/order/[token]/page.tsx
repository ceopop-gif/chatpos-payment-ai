"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Minus, PackagePlus, Plus, Search, Send, ShoppingBasket, Sparkles, Store, UtensilsCrossed, X } from "lucide-react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

type MenuProduct = {
  id: number;
  name: string;
  price: number;
  category: string;
  description: string;
  image: string | null;
  active: boolean;
};

type CartItem = MenuProduct & { quantity: number };

type OrderContext = {
  merchant: string;
  table: { id: number; name: string };
  products: MenuProduct[];
  categories: string[];
};

const money = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function TableOrderPage() {
  const params = useParams<{ token: string }>();
  const token = typeof params.token === "string" ? params.token : "";
  const [context, setContext] = useState<OrderContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ทั้งหมด");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<{ orderNumber: string; tableName: string; total: number } | null>(null);
  const cartRef = useRef<HTMLElement | null>(null);
  const requestIdRef = useRef("");

  useEffect(() => {
    let active = true;
    void fetch(`/api/order?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as OrderContext & { error?: string };
        if (!response.ok) throw new Error(payload.error || "เปิดเมนูไม่สำเร็จ");
        if (active) setContext(payload);
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "เปิดเมนูไม่สำเร็จ"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const searchTerms = useMemo(() => search.trim().toLocaleLowerCase("th-TH").split(/\s+/).filter(Boolean), [search]);
  const searchedProducts = useMemo(() => (context?.products ?? []).filter((product) => {
    const text = `${product.name} ${product.category} ${product.description}`.toLocaleLowerCase("th-TH");
    return searchTerms.every((term) => text.includes(term));
  }), [context, searchTerms]);
  const visibleProducts = useMemo(
    () => category === "ทั้งหมด" ? searchedProducts : searchedProducts.filter((product) => product.category === category),
    [category, searchedProducts],
  );
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const addProduct = (product: MenuProduct) => {
    setCart((current) => {
      const found = current.find((item) => item.id === product.id);
      return found
        ? current.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)
        : [...current, { ...product, quantity: 1 }];
    });
    toast.success(`เพิ่ม ${product.name} แล้ว`);
  };

  const changeQuantity = (id: number, delta: number) => {
    setCart((current) => current.map((item) => item.id === id ? { ...item, quantity: item.quantity + delta } : item).filter((item) => item.quantity > 0));
  };

  const submitOrder = async () => {
    if (!cart.length || !context) return;
    if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID();
    setSubmitting(true);
    try {
      const response = await fetch("/api/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          clientRequestId: requestIdRef.current,
          items: cart.map((item) => ({ productId: item.id, quantity: item.quantity })),
          note,
        }),
      });
      const payload = await response.json() as { order?: { orderNumber: string; tableName?: string; total?: number }; error?: string };
      if (!response.ok || !payload.order) throw new Error(payload.error || "ส่งออเดอร์ไม่สำเร็จ");
      setCompletedOrder({
        orderNumber: payload.order.orderNumber,
        tableName: payload.order.tableName || context.table.name,
        total: Number(payload.order.total ?? total),
      });
      setCart([]);
      setNote("");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "ส่งออเดอร์ไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  };

  const orderAgain = () => {
    requestIdRef.current = "";
    setCompletedOrder(null);
    setSearch("");
    setCategory("ทั้งหมด");
  };

  if (loading) return <div className="customer-order-shell"><div className="customer-order-loading"><Sparkles /><strong>กำลังเปิดเมนูของโต๊ะ...</strong></div></div>;
  if (error || !context) return <div className="customer-order-shell"><div className="customer-order-error"><X /><strong>เปิดลิงก์สั่งอาหารไม่ได้</strong><p>{error || "ไม่พบข้อมูลโต๊ะ"}</p></div></div>;

  if (completedOrder) {
    return (
      <div className="customer-order-shell">
        <main className="customer-success-card">
          <span><CheckCircle2 /></span>
          <small>CHATPOS TABLE ORDER</small>
          <h1>ส่งออเดอร์เรียบร้อยแล้ว</h1>
          <div><UtensilsCrossed /><strong>{completedOrder.tableName}</strong></div>
          <p>ออเดอร์ <b>#{completedOrder.orderNumber}</b><br />ร้านได้รับรายการของคุณแล้ว</p>
          <strong className="customer-success-total">฿{money.format(completedOrder.total)}</strong>
          <button type="button" onClick={orderAgain}><Plus /> สั่งอาหารเพิ่ม</button>
        </main>
      </div>
    );
  }

  return (
    <div className="customer-order-shell">
      <header className="customer-order-header">
        <div><Store /><span><small>{context.merchant}</small><strong>สั่งอาหารที่โต๊ะ</strong></span></div>
        <b><UtensilsCrossed /> {context.table.name}</b>
      </header>

      <main className="customer-order-main">
        <section className="customer-table-banner">
          <span><Sparkles /></span>
          <div><small>ลิงก์สั่งอาหารประจำโต๊ะ</small><h1>คุณกำลังสั่งที่ {context.table.name}</h1><p>เลือกเมนูแล้วกดยืนยัน ร้านจะเห็นหมายเลขโต๊ะอัตโนมัติ</p></div>
        </section>

        <section className="customer-search-panel" aria-label="ค้นหาเมนู">
          <Search />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาอาหาร เช่น ข้าวมัน" type="search" inputMode="search" />
          {search && <button type="button" onClick={() => setSearch("")} aria-label="ล้างคำค้นหา"><X /></button>}
        </section>

        <nav className="customer-category-scroll" aria-label="หมวดหมู่อาหาร">
          {["ทั้งหมด", ...context.categories].map((item) => (
            <button type="button" key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>
          ))}
        </nav>

        {visibleProducts.length ? (
          <section className="customer-product-grid" aria-label="รายการอาหาร">
            {visibleProducts.map((product) => (
              <article className="customer-product-card" key={product.id}>
                <button type="button" className="customer-product-main" onClick={() => addProduct(product)} aria-label={`เพิ่ม ${product.name}`}>
                  <span className="customer-product-image">{product.image ? <img src={product.image} alt="" /> : <PackagePlus />}</span>
                  <span className="customer-product-copy"><small>{product.category}</small><strong>{product.name}</strong>{product.description && <p>{product.description}</p>}<b>฿{money.format(product.price)}</b></span>
                </button>
                <button type="button" className="customer-add-button" onClick={() => addProduct(product)}><Plus /> เพิ่ม</button>
              </article>
            ))}
          </section>
        ) : (
          <section className="customer-menu-empty"><Search /><strong>ไม่พบเมนูที่ค้นหา</strong><button type="button" onClick={() => { setSearch(""); setCategory("ทั้งหมด"); }}>ดูเมนูทั้งหมด</button></section>
        )}

        <section className="customer-cart-panel" ref={cartRef}>
          <div className="customer-cart-title"><h2><ShoppingBasket /> รายการที่สั่ง</h2><span>{itemCount} รายการ</span></div>
          {!cart.length ? <p className="customer-cart-empty">แตะเมนูด้านบนเพื่อเพิ่มรายการ</p> : cart.map((item) => (
            <div className="customer-cart-item" key={item.id}>
              <span><strong>{item.name}</strong><small>฿{money.format(item.price * item.quantity)}</small></span>
              <div><button type="button" onClick={() => changeQuantity(item.id, -1)} aria-label={`ลด ${item.name}`}><Minus /></button><b>{item.quantity}</b><button type="button" onClick={() => changeQuantity(item.id, 1)} aria-label={`เพิ่ม ${item.name}`}><Plus /></button></div>
            </div>
          ))}
          <label className="customer-order-note"><span>หมายเหตุถึงร้าน</span><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} rows={3} placeholder="เช่น ไม่เผ็ด ไม่ใส่ผัก" /></label>
          <div className="customer-order-total"><span>ยอดรวม · {context.table.name}</span><strong>฿{money.format(total)}</strong></div>
          <button type="button" className="customer-submit-order" disabled={!cart.length || submitting} onClick={submitOrder}><Send /> {submitting ? "กำลังส่งออเดอร์..." : `ยืนยันสั่งอาหาร · ${context.table.name}`}</button>
        </section>
      </main>

      <button type="button" className="customer-cart-float" disabled={!cart.length} onClick={() => cartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
        <ShoppingBasket /><span>ดูรายการ · {itemCount} รายการ</span><strong>฿{money.format(total)}</strong>
      </button>
      <Toaster position="top-center" richColors />
    </div>
  );
}
