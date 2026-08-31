"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, ClipboardCheck, Minus, PackagePlus, Plus, Search, Send, ShoppingBasket, Sparkles, Store, UtensilsCrossed, Volume2, X } from "lucide-react";
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

type OrderStage = "menu" | "review" | "success";

type CompletedOrder = {
  orderNumber: string;
  tableName: string;
  total: number;
  items: CartItem[];
  note: string;
};

const money = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const orderSentMessage = "ส่งเมนูเรียบร้อย รออาหารสักครู่ค่ะ";

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
  const [stage, setStage] = useState<OrderStage>("menu");
  const [completedOrder, setCompletedOrder] = useState<CompletedOrder | null>(null);
  const cartRef = useRef<HTMLElement | null>(null);
  const requestIdRef = useRef("");
  const completionAudioRef = useRef<HTMLAudioElement | null>(null);

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

  useEffect(() => {
    const audio = new Audio("/audio/th/completed_female.mp3?v=8");
    audio.preload = "auto";
    audio.defaultPlaybackRate = 1.12;
    audio.playbackRate = 1.12;
    audio.setAttribute("playsinline", "true");
    audio.load();
    completionAudioRef.current = audio;

    const currentState = window.history.state && typeof window.history.state === "object" ? window.history.state : {};
    window.history.replaceState({ ...currentState, chatposOrderStage: "menu" }, "", window.location.href);
    const handlePopState = (event: PopStateEvent) => {
      const nextStage = event.state?.chatposOrderStage;
      setStage(nextStage === "review" || nextStage === "success" ? nextStage : "menu");
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      audio.pause();
      completionAudioRef.current = null;
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

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

  const playCompletionFallback = () => {
    const audio = completionAudioRef.current;
    if (!audio) return;
    audio.pause();
    audio.muted = false;
    audio.volume = 1;
    audio.currentTime = 0;
    audio.playbackRate = 1.12;
    void audio.play().catch(() => {
      toast.error("LINE ปิดเสียงอยู่ กรุณาเพิ่มเสียงสื่อแล้วกดฟังอีกครั้ง");
    });
  };

  const primeCompletionAudio = () => {
    const audio = completionAudioRef.current;
    if (!audio) return;
    audio.muted = true;
    audio.currentTime = 0;
    void audio.play().then(() => {
      window.setTimeout(() => {
        if (!audio.muted) return;
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
      }, 80);
    }).catch(() => {
      audio.muted = false;
    });
  };

  const announceOrderSent = () => {
    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window) ||
      typeof window.SpeechSynthesisUtterance !== "function"
    ) {
      playCompletionFallback();
      return;
    }

    const synth = window.speechSynthesis;
    const utterance = new window.SpeechSynthesisUtterance(orderSentMessage);
    utterance.lang = "th-TH";
    utterance.rate = 1.08;
    utterance.pitch = 1;
    utterance.volume = 1;
    const thaiVoice = synth.getVoices().find((voice) => voice.lang.toLowerCase().startsWith("th"));
    if (thaiVoice) utterance.voice = thaiVoice;

    let started = false;
    const fallbackTimer = window.setTimeout(() => {
      if (!started) playCompletionFallback();
    }, 1100);
    utterance.onstart = () => {
      started = true;
      window.clearTimeout(fallbackTimer);
    };
    utterance.onerror = () => {
      window.clearTimeout(fallbackTimer);
      playCompletionFallback();
    };
    if (synth.speaking || synth.pending) synth.cancel();
    window.setTimeout(() => synth.speak(utterance), 60);
  };

  const openReview = () => {
    if (!cart.length) return;
    window.history.pushState({ chatposOrderStage: "review" }, "", window.location.href);
    setStage("review");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const returnToMenu = () => {
    if (window.history.state?.chatposOrderStage === "review") {
      window.history.back();
      return;
    }
    setStage("menu");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submitOrder = async () => {
    if (!cart.length || !context) return;
    primeCompletionAudio();
    if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID();
    const submittedItems = cart.map((item) => ({ ...item }));
    const submittedNote = note.trim();
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
        items: submittedItems,
        note: submittedNote,
      });
      setCart([]);
      setNote("");
      setStage("success");
      window.history.replaceState({ chatposOrderStage: "success" }, "", window.location.href);
      window.scrollTo({ top: 0, behavior: "smooth" });
      window.setTimeout(announceOrderSent, 260);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "ส่งออเดอร์ไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  };

  const orderAgain = () => {
    requestIdRef.current = "";
    setCompletedOrder(null);
    setStage("menu");
    setSearch("");
    setCategory("ทั้งหมด");
    window.history.replaceState({ chatposOrderStage: "menu" }, "", window.location.href);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (loading) return <div className="customer-order-shell"><div className="customer-order-loading"><Sparkles /><strong>กำลังเปิดเมนูของโต๊ะ...</strong></div></div>;
  if (error || !context) return <div className="customer-order-shell"><div className="customer-order-error"><X /><strong>เปิดลิงก์สั่งอาหารไม่ได้</strong><p>{error || "ไม่พบข้อมูลโต๊ะ"}</p></div></div>;

  if (stage === "success" && completedOrder) {
    return (
      <div className="customer-order-shell">
        <main className="customer-success-card">
          <span><CheckCircle2 /></span>
          <small>CHATPOS TABLE ORDER</small>
          <h1>ส่งเมนูเรียบร้อยแล้ว</h1>
          <div className="customer-success-table"><UtensilsCrossed /><strong>{completedOrder.tableName}</strong></div>
          <p className="customer-success-message">รออาหารสักครู่ค่ะ<br /><b>ออเดอร์ #{completedOrder.orderNumber}</b></p>

          <section className="customer-success-summary" aria-label="สรุปรายการที่ส่งแล้ว">
            <div className="customer-success-summary-title"><ClipboardCheck /><strong>สรุปเมนูที่ส่งแล้ว</strong></div>
            {completedOrder.items.map((item) => (
              <div className="customer-success-item" key={item.id}>
                <span><b>{item.quantity} ×</b> {item.name}</span>
                <strong>฿{money.format(item.price * item.quantity)}</strong>
              </div>
            ))}
            {completedOrder.note && <p className="customer-success-note"><b>หมายเหตุ:</b> {completedOrder.note}</p>}
            <div className="customer-success-total"><span>ยอดรวม</span><strong>฿{money.format(completedOrder.total)}</strong></div>
          </section>

          <button type="button" className="customer-success-voice" onClick={announceOrderSent}><Volume2 /> ฟังข้อความอีกครั้ง</button>
          <button type="button" className="customer-success-order-again" onClick={orderAgain}><Plus /> สั่งอาหารเพิ่ม</button>
        </main>
        <Toaster position="top-center" richColors />
      </div>
    );
  }

  if (stage === "review") {
    return (
      <div className="customer-order-shell">
        <header className="customer-order-header customer-review-header">
          <button type="button" onClick={returnToMenu} disabled={submitting} aria-label="กลับไปเลือกเมนู"><ArrowLeft /></button>
          <div><ClipboardCheck /><span><small>{context.merchant}</small><strong>ตรวจรายการที่สั่ง</strong></span></div>
          <b><UtensilsCrossed /> {context.table.name}</b>
        </header>

        <main className="customer-review-main">
          <section className="customer-review-hero">
            <span><ShoppingBasket /></span>
            <div><small>ก่อนส่งรายการให้ร้าน</small><h1>ตรวจเมนูให้เรียบร้อย</h1><p>หากต้องการแก้ไข กด “สั่งเพิ่ม” เพื่อกลับไปหน้าเมนู</p></div>
          </section>

          <section className="customer-review-card">
            <div className="customer-review-title"><h2>สรุปรายการ</h2><span>{itemCount} รายการ</span></div>
            <div className="customer-review-items">
              {cart.map((item) => (
                <div className="customer-review-item" key={item.id}>
                  <span><b>{item.quantity} ×</b><strong>{item.name}</strong></span>
                  <strong>฿{money.format(item.price * item.quantity)}</strong>
                </div>
              ))}
            </div>
            {note.trim() && <div className="customer-review-note"><small>หมายเหตุถึงร้าน</small><p>{note.trim()}</p></div>}
            <div className="customer-review-total"><span>ยอดรวม · {context.table.name}</span><strong>฿{money.format(total)}</strong></div>
          </section>

          <div className="customer-review-actions">
            <button type="button" className="customer-review-more" onClick={returnToMenu} disabled={submitting}><Plus /> สั่งเพิ่ม</button>
            <button type="button" className="customer-review-submit" onClick={() => void submitOrder()} disabled={submitting || !cart.length}><Send /> {submitting ? "กำลังส่งเมนู..." : "ส่งเมนูที่สั่ง"}</button>
          </div>
          <p className="customer-review-help">เมื่อกดส่ง ร้านจะได้รับรายการพร้อมหมายเลขโต๊ะทันที</p>
        </main>
        <Toaster position="top-center" richColors />
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
          <button type="button" className="customer-submit-order" disabled={!cart.length} onClick={openReview}><Send /> ส่งเมนูที่สั่ง</button>
        </section>
      </main>

      <button type="button" className="customer-cart-float" disabled={!cart.length} onClick={() => cartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
        <ShoppingBasket /><span>ดูรายการ · {itemCount} รายการ</span><strong>฿{money.format(total)}</strong>
      </button>
      <Toaster position="top-center" richColors />
    </div>
  );
}
