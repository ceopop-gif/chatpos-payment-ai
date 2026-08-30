"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  Activity,
  Banknote,
  Bell,
  Bot,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  ExternalLink,
  Grid2X2,
  Home,
  Landmark,
  Minus,
  PackageCheck,
  Plus,
  PlayCircle,
  QrCode,
  ReceiptText,
  RotateCcw,
  Settings,
  ShieldCheck,
  ShoppingBasket,
  Sparkles,
  Store,
  UtensilsCrossed,
  Volume2,
  VolumeX,
  WalletCards,
  Zap,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

type View =
  | "home"
  | "payment"
  | "method-picker"
  | "other-methods"
  | "withdraw"
  | "transactions"
  | "orders"
  | "tables"
  | "pos"
  | "settings";

type PaymentMethod = "promptpay" | "visa" | "truemoney" | "wechat" | "alipay" | "mobile" | "shopeepay";

type Transaction = {
  id: string;
  method: string;
  amount: number;
  time: string;
  status: "สำเร็จ" | "กำลังตรวจสอบ";
};

type CartItem = { id: number; name: string; price: number; qty: number };

const methods: Record<PaymentMethod, { name: string; short: string; icon: typeof QrCode; tone: string; action: string }> = {
  promptpay: { name: "QR PromptPay", short: "พร้อมเพย์", icon: QrCode, tone: "green", action: "สร้าง QR" },
  visa: { name: "VISA THAI", short: "บัตร VISA", icon: CreditCard, tone: "mint", action: "รับ VISA" },
  truemoney: { name: "TrueMoney", short: "ทรูมันนี่", icon: WalletCards, tone: "mint", action: "รับ TrueMoney" },
  wechat: { name: "WeChat Pay", short: "WeChat Pay", icon: CircleDollarSign, tone: "mint", action: "รับ WeChat Pay" },
  alipay: { name: "Alipay", short: "Alipay", icon: WalletCards, tone: "mint", action: "รับ Alipay" },
  mobile: { name: "Mobile Banking", short: "Mobile Banking", icon: Landmark, tone: "mint", action: "สร้าง QR" },
  shopeepay: { name: "ShopeePay", short: "ShopeePay", icon: WalletCards, tone: "gold", action: "รับ ShopeePay" },
};

const products = [
  { id: 1, name: "กะเพราไก่ไข่ดาว", price: 75 },
  { id: 2, name: "ข้าวผัดกุ้ง", price: 85 },
  { id: 3, name: "ต้มยำกุ้ง", price: 150 },
  { id: 4, name: "ชาไทย", price: 45 },
  { id: 5, name: "อเมริกาโน่", price: 55 },
  { id: 6, name: "น้ำเปล่า", price: 20 },
];

const seededTransactions: Transaction[] = [
  { id: "CP-240816-017", method: "QR PromptPay", amount: 320, time: "10:45 น.", status: "สำเร็จ" },
  { id: "CP-240816-016", method: "VISA THAI", amount: 1250, time: "10:43 น.", status: "สำเร็จ" },
  { id: "CP-240816-015", method: "TrueMoney", amount: 89, time: "10:41 น.", status: "สำเร็จ" },
];

const money = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const thaiDigits = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const thaiPlaces = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];
const thaiDigitClips = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const thaiPlaceClips = ["", "ten", "hundred", "thousand", "ten_thousand", "hundred_thousand"];
const DEVICE_VOICE_RATE = 1.05;
const LINE_VOICE_RATE = 1.18;

const lineKeyClips: Record<string, string> = {
  "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four",
  "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine",
  ".": "point", "+": "plus", "−": "minus", "×": "multiply", "÷": "divide",
  "C": "clear", "⌫": "backspace",
};

const lineMethodClips: Record<PaymentMethod, string> = {
  promptpay: "create_qr",
  visa: "open_visa",
  truemoney: "open_truemoney",
  wechat: "open_wechat",
  alipay: "open_alipay",
  mobile: "create_qr",
  shopeepay: "open_shopeepay",
};

const linePreloadClips = Array.from(new Set([
  ...thaiDigitClips,
  "yi", "et", ...thaiPlaceClips.filter(Boolean), "million",
  "baht", "satang", "exact", "point", "plus", "minus", "multiply", "divide",
  "clear", "backspace", "payment_total", "please_check", "test", "voice_on",
  "paid_amount", "completed_female",
  ...Object.values(lineMethodClips),
]));

function thaiInteger(value: number): string {
  const safeValue = Math.max(0, Math.floor(value));
  if (safeValue === 0) return thaiDigits[0];
  if (safeValue >= 1_000_000) {
    const millions = Math.floor(safeValue / 1_000_000);
    const remainder = safeValue % 1_000_000;
    return `${thaiInteger(millions)}ล้าน${remainder ? thaiInteger(remainder) : ""}`;
  }

  const digits = String(safeValue).split("").map(Number);
  return digits.map((digit, index) => {
    if (digit === 0) return "";
    const place = digits.length - index - 1;
    if (place === 1) {
      const prefix = digit === 1 ? "" : digit === 2 ? "ยี่" : thaiDigits[digit];
      return `${prefix}สิบ`;
    }
    if (place === 0 && digit === 1 && digits.length > 1) return "เอ็ด";
    return `${thaiDigits[digit]}${thaiPlaces[place]}`;
  }).join("");
}

function thaiMoneyText(value: number): string {
  const totalSatang = Math.max(0, Math.round(value * 100));
  const baht = Math.floor(totalSatang / 100);
  const satang = totalSatang % 100;
  return satang
    ? `${thaiInteger(baht)}บาท ${thaiInteger(satang)}สตางค์`
    : `${thaiInteger(baht)}บาทถ้วน`;
}

function thaiIntegerVoiceClips(value: number): string[] {
  const safeValue = Math.max(0, Math.floor(value));
  if (safeValue === 0) return [thaiDigitClips[0]];
  if (safeValue >= 1_000_000) {
    const millions = Math.floor(safeValue / 1_000_000);
    const remainder = safeValue % 1_000_000;
    return [
      ...thaiIntegerVoiceClips(millions),
      "million",
      ...(remainder ? thaiIntegerVoiceClips(remainder) : []),
    ];
  }

  const digits = String(safeValue).split("").map(Number);
  return digits.flatMap((digit, index) => {
    if (digit === 0) return [];
    const place = digits.length - index - 1;
    if (place === 1) {
      if (digit === 1) return ["ten"];
      if (digit === 2) return ["yi", "ten"];
      return [thaiDigitClips[digit], "ten"];
    }
    if (place === 0 && digit === 1 && digits.length > 1) return ["et"];
    return [thaiDigitClips[digit], ...(thaiPlaceClips[place] ? [thaiPlaceClips[place]] : [])];
  });
}

function thaiMoneyVoiceClips(value: number): string[] {
  const totalSatang = Math.max(0, Math.round(value * 100));
  const baht = Math.floor(totalSatang / 100);
  const satang = totalSatang % 100;
  return [
    ...thaiIntegerVoiceClips(baht),
    "baht",
    ...(satang ? [...thaiIntegerVoiceClips(satang), "satang"] : ["exact"]),
  ];
}

function isLineEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  const query = new URLSearchParams(window.location.search);
  return /Line\//i.test(window.navigator.userAgent)
    || query.has("lineAppVersion")
    || query.has("liff.state");
}

function lineVoiceClipUrl(clip: string): string {
  return `/audio/th/${clip}.mp3?v=7`;
}

async function qrSvgToPngBlob(qrSvg: SVGSVGElement): Promise<Blob> {
  const clonedSvg = qrSvg.cloneNode(true) as SVGSVGElement;
  clonedSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clonedSvg.setAttribute("width", "1024");
  clonedSvg.setAttribute("height", "1024");
  clonedSvg.setAttribute("viewBox", qrSvg.getAttribute("viewBox") || "0 0 24 24");
  clonedSvg.setAttribute("color", "#020706");
  clonedSvg.setAttribute("stroke", "#020706");

  const svgMarkup = new XMLSerializer().serializeToString(clonedSvg);
  const svgBlob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);
  const image = new Image();

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("โหลดรูป QR ไม่สำเร็จ"));
      image.src = svgUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1200;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("อุปกรณ์ไม่รองรับการสร้างรูป");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 100, 100, 1000, 1000);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("สร้างไฟล์ PNG ไม่สำเร็จ")), "image/png");
    });
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function MethodMark({ method, size = "md" }: { method: PaymentMethod; size?: "sm" | "md" | "lg" }) {
  const Icon = methods[method].icon;
  return (
    <span className={`method-mark method-mark-${size} method-${method}`} aria-hidden="true">
      <Icon />
      {method === "truemoney" && <b>W</b>}
    </span>
  );
}

function Header({ title, onBack }: { title?: string; onBack?: () => void }) {
  return (
    <header className="app-header">
      <div className="header-row">
        {onBack ? (
          <button className="icon-button gold" onClick={onBack} aria-label="ย้อนกลับ">
            <ArrowLeft />
          </button>
        ) : (
          <span className="ai-orb"><Sparkles /></span>
        )}
        <div className="header-title">
          <h1>{title ?? <><span>Chat</span><em>POS</em><sup>AI</sup></>}</h1>
          <p>{title ? "Merchant: ร้านตัวอย่าง" : <><i className="live-dot" /> AI Commerce Operating System</>}</p>
        </div>
        <button className="icon-button notification" aria-label="การแจ้งเตือน">
          <Bell />
          <span>2</span>
        </button>
      </div>
    </header>
  );
}

function BottomNav({ view, go }: { view: View; go: (view: View) => void }) {
  const nav = [
    { key: "orders" as View, label: "ออเดอร์", icon: ClipboardList },
    { key: "tables" as View, label: "จ่ายที่โต๊ะ", icon: UtensilsCrossed },
    { key: "home" as View, label: "หน้าหลัก", icon: Home, center: true },
    { key: "pos" as View, label: "POS", icon: ShoppingBasket },
    { key: "settings" as View, label: "ตั้งค่า", icon: Settings },
  ];

  return (
    <nav className="bottom-nav" aria-label="เมนูหลัก">
      {nav.map((item) => {
        const Icon = item.icon;
        const active = view === item.key || (item.key === "home" && ["payment", "method-picker", "other-methods", "withdraw", "transactions"].includes(view));
        return (
          <button key={item.key} onClick={() => go(item.key)} className={`${active ? "active" : ""} ${item.center ? "nav-home" : ""}`}>
            <span><Icon /></span>
            <small>{item.label}</small>
          </button>
        );
      })}
    </nav>
  );
}

function ScreenTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}

export default function HomePage() {
  const [view, setView] = useState<View>("home");
  const [method, setMethod] = useState<PaymentMethod>("promptpay");
  const [amountText, setAmountText] = useState("0");
  const [expression, setExpression] = useState("");
  const [storedValue, setStoredValue] = useState<number | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogStage, setDialogStage] = useState<"ready" | "checking" | "success" | "withdraw">("ready");
  const [transactions, setTransactions] = useState<Transaction[]>(seededTransactions);
  const [availableBalance, setAvailableBalance] = useState(8500);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentContext, setPaymentContext] = useState("รับชำระทั่วไป");
  const [withdrawText, setWithdrawText] = useState("");
  const [bankAccount, setBankAccount] = useState("main");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<"idle" | "ready" | "speaking" | "unsupported" | "error">("idle");
  const [lineAudioMode, setLineAudioMode] = useState(false);
  const [lineAudioUnlocked, setLineAudioUnlocked] = useState(false);
  const [qrSavePreview, setQrSavePreview] = useState<string | null>(null);
  const speechRunRef = useRef(0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const spokenAudioRef = useRef<HTMLAudioElement | null>(null);
  const voiceFailureNotifiedRef = useRef(false);
  const qrImageRef = useRef<HTMLDivElement | null>(null);
  const qrPngBlobRef = useRef<Blob | null>(null);
  const qrPreviewUrlRef = useRef<string | null>(null);

  const amount = Number(amountText || 0);
  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.qty, 0), [cart]);
  const todayTotal = useMemo(() => transactions.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0), [transactions]);

  useEffect(() => {
    const inLine = isLineEnvironment();
    setLineAudioMode(inLine);
    if (inLine) {
      const audio = new Audio(lineVoiceClipUrl("test"));
      audio.preload = "auto";
      audio.volume = 1;
      audio.defaultPlaybackRate = LINE_VOICE_RATE;
      audio.playbackRate = LINE_VOICE_RATE;
      audio.setAttribute("playsinline", "true");
      audio.load();
      spokenAudioRef.current = audio;
      void Promise.allSettled(linePreloadClips.map((clip) => fetch(lineVoiceClipUrl(clip), { cache: "force-cache" })));
      setVoiceStatus("idle");
    }
    return () => {
      if (spokenAudioRef.current) {
        spokenAudioRef.current.onended = null;
        spokenAudioRef.current.onerror = null;
        spokenAudioRef.current.pause();
        spokenAudioRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!dialogOpen || dialogStage !== "ready") return;
    let active = true;
    const timer = window.setTimeout(() => {
      const qrSvg = qrImageRef.current?.querySelector("svg");
      if (!qrSvg) return;
      void qrSvgToPngBlob(qrSvg).then((blob) => {
        if (active) qrPngBlobRef.current = blob;
      }).catch(() => {
        // The Save button retries generation if preloading is not ready.
      });
    }, 120);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [dialogOpen, dialogStage, amountText]);

  useEffect(() => () => {
    if (qrPreviewUrlRef.current) URL.revokeObjectURL(qrPreviewUrlRef.current);
  }, []);

  const cancelSpeech = () => {
    speechRunRef.current += 1;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    if (spokenAudioRef.current) {
      spokenAudioRef.current.onended = null;
      spokenAudioRef.current.onerror = null;
      spokenAudioRef.current.pause();
    }
    setIsSpeaking(false);
  };

  const playTapTone = (high = true) => {
    if (typeof window === "undefined") return;
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      const context = audioContextRef.current ?? new AudioContextClass();
      audioContextRef.current = context;
      if (context.state === "suspended") void context.resume();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = high ? 720 : 460;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.075, context.currentTime + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.075);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.08);
    } catch {
      // Some embedded browsers block Web Audio; speech compatibility UI handles it.
    }
  };

  const speakThaiWithDevice = (text: string, onEnd?: () => void) => {
    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window) ||
      typeof window.SpeechSynthesisUtterance !== "function"
    ) {
      setVoiceStatus("unsupported");
      if (!voiceFailureNotifiedRef.current) {
        voiceFailureNotifiedRef.current = true;
        toast.error("อุปกรณ์นี้ยังไม่สามารถเปิดเสียงภาษาไทยได้");
      }
      onEnd?.();
      return;
    }

    const synth = window.speechSynthesis;
    const runId = speechRunRef.current + 1;
    speechRunRef.current = runId;
    const startSpeaking = () => {
      if (speechRunRef.current !== runId) return;
      const utterance = new window.SpeechSynthesisUtterance(text);
      utteranceRef.current = utterance;
      utterance.lang = "th-TH";
      utterance.rate = DEVICE_VOICE_RATE;
      utterance.pitch = 1;
      utterance.volume = 1;
      const voices = synth.getVoices();
      const thaiVoice = voices.find((voice) => voice.lang.toLowerCase().startsWith("th"));
      if (thaiVoice) utterance.voice = thaiVoice;

      let completed = false;
      const finish = (success: boolean) => {
        if (completed || speechRunRef.current !== runId) return;
        completed = true;
        utteranceRef.current = null;
        setVoiceStatus(success ? "ready" : "error");
        if (!success && !voiceFailureNotifiedRef.current) {
          voiceFailureNotifiedRef.current = true;
          toast.error("เครื่องไม่สามารถเปิดเสียงไทยได้ กรุณากดทดสอบอีกครั้ง");
        }
        onEnd?.();
      };
      utterance.onstart = () => {
        voiceFailureNotifiedRef.current = false;
        setVoiceStatus("speaking");
      };
      utterance.onend = () => finish(true);
      utterance.onerror = () => finish(false);
      if (synth.paused) synth.resume();
      synth.speak(utterance);
    };

    // Android WebView can silently drop speech when cancel() and speak() run together.
    if (synth.speaking || synth.pending) {
      synth.cancel();
      window.setTimeout(startSpeaking, 60);
    } else {
      startSpeaking();
    }
  };

  const playLineVoiceClips = (clips: string[], onEnd?: () => void) => {
    const runId = speechRunRef.current + 1;
    speechRunRef.current = runId;
    const audio = spokenAudioRef.current ?? new Audio();
    spokenAudioRef.current = audio;
    audio.preload = "auto";
    audio.volume = 1;
    audio.defaultPlaybackRate = LINE_VOICE_RATE;
    audio.playbackRate = LINE_VOICE_RATE;
    audio.setAttribute("playsinline", "true");
    audio.onended = null;
    audio.onerror = null;
    audio.pause();

    let completed = false;
    const finish = (success: boolean) => {
      if (completed || speechRunRef.current !== runId) return;
      completed = true;
      setVoiceStatus(success ? "ready" : "error");
      if (!success && !voiceFailureNotifiedRef.current) {
        voiceFailureNotifiedRef.current = true;
        toast.error("LINE ยังปิดเสียงอยู่ กรุณาเพิ่มระดับเสียงสื่อแล้วแตะเปิดเสียงอีกครั้ง");
      }
      onEnd?.();
    };
    let clipIndex = 0;
    const playNext = () => {
      if (completed || speechRunRef.current !== runId) return;
      const clip = clips[clipIndex];
      if (!clip) {
        finish(true);
        return;
      }
      clipIndex += 1;
      audio.src = lineVoiceClipUrl(clip);
      audio.currentTime = 0;
      audio.playbackRate = LINE_VOICE_RATE;
      audio.load();
      const playResult = audio.play();
      if (playResult) void playResult.catch(() => finish(false));
    };
    audio.onplaying = () => {
      voiceFailureNotifiedRef.current = false;
      setLineAudioUnlocked(true);
      setVoiceStatus("speaking");
    };
    audio.onended = playNext;
    audio.onerror = () => finish(false);
    playNext();
  };

  const speakThai = (text: string, onEnd?: () => void, lineClips: string[] = []) => {
    if (isLineEnvironment()) {
      playLineVoiceClips(lineClips.length ? lineClips : ["test"], onEnd);
      return;
    }
    speakThaiWithDevice(text, onEnd);
  };

  const testVoice = () => {
    if (!lineAudioMode) playTapTone();
    setVoiceStatus("speaking");
    speakThai(lineAudioMode
      ? "ทดสอบเสียงภาษาไทยในไลน์ หนึ่ง สอง สาม ระบบพร้อมใช้งาน"
      : "ทดสอบเสียงภาษาไทย หนึ่ง สอง สาม ระบบพร้อมใช้งาน", undefined, ["test"]);
  };

  const openInChrome = () => {
    if (typeof window === "undefined") return;
    const cleanUrl = window.location.href.replace(/^https:\/\//, "");
    window.location.href = `intent://${cleanUrl}#Intent;scheme=https;package=com.android.chrome;end`;
  };

  const toggleVoice = () => {
    if (voiceEnabled) {
      cancelSpeech();
      setVoiceEnabled(false);
      toast("ปิดเสียงภาษาไทยแล้ว");
      return;
    }
    setVoiceEnabled(true);
    if (!lineAudioMode) playTapTone();
    speakThai("เปิดเสียงภาษาไทยแล้ว", undefined, ["voice_on"]);
  };

  const go = (next: View) => {
    cancelSpeech();
    setDialogOpen(false);
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetAmount = (value = "0") => {
    setAmountText(value);
    setExpression("");
    setStoredValue(null);
    setOperation(null);
  };

  const selectMethod = (nextMethod: PaymentMethod, fixedAmount?: number, context = "รับชำระทั่วไป") => {
    setMethod(nextMethod);
    setPaymentContext(context);
    resetAmount(fixedAmount ? String(fixedAmount) : "0");
    go("payment");
  };

  const openMethodPicker = (fixedAmount?: number, context = "รับชำระทั่วไป") => {
    setPaymentContext(context);
    resetAmount(fixedAmount ? String(fixedAmount) : "0");
    go("method-picker");
  };

  const calculate = (left: number, right: number, op: string | null) => {
    if (op === "+") return left + right;
    if (op === "−") return left - right;
    if (op === "×") return left * right;
    if (op === "÷") return right === 0 ? left : left / right;
    return right;
  };

  const pressKey = (key: string) => {
    const spokenKeys: Record<string, string> = {
      "0": "ศูนย์", "1": "หนึ่ง", "2": "สอง", "3": "สาม", "4": "สี่",
      "5": "ห้า", "6": "หก", "7": "เจ็ด", "8": "แปด", "9": "เก้า",
      ".": "จุด", "+": "บวก", "−": "ลบ", "×": "คูณ", "÷": "หาร",
      "C": "ล้างยอด", "⌫": "ลบหนึ่งหลัก",
    };
    if (voiceEnabled) {
      if (!lineAudioMode) playTapTone(!["+", "−", "×", "÷", "C", "⌫"].includes(key));
      speakThai(spokenKeys[key] ?? key, undefined, [lineKeyClips[key] ?? "test"]);
    }
    if (key === "C") return resetAmount();
    if (key === "⌫") return setAmountText((current) => current.length > 1 ? current.slice(0, -1) : "0");
    if (["+", "−", "×", "÷"].includes(key)) {
      const current = Number(amountText || 0);
      const base = storedValue === null ? current : calculate(storedValue, current, operation);
      setStoredValue(base);
      setOperation(key);
      setExpression(`${money.format(base)} ${key}`);
      setAmountText("0");
      return;
    }
    if (key === ".") {
      if (!amountText.includes(".")) setAmountText((current) => `${current}.`);
      return;
    }
    setAmountText((current) => current === "0" ? key : `${current}${key}`.slice(0, 9));
  };

  const resolvedAmount = () => storedValue === null ? amount : calculate(storedValue, amount, operation);

  const initiatePayment = () => {
    const finalAmount = resolvedAmount();
    if (finalAmount <= 0) {
      toast.error("กรุณาระบุยอดชำระมากกว่า 0 บาท");
      return;
    }
    setAmountText(String(finalAmount));
    setDialogStage("ready");
    let paymentOpened = false;
    let paymentSafetyTimer: number | null = null;
    const showPayment = () => {
      if (paymentOpened) return;
      paymentOpened = true;
      if (paymentSafetyTimer !== null) window.clearTimeout(paymentSafetyTimer);
      setIsSpeaking(false);
      setDialogOpen(true);
    };
    if (!voiceEnabled) {
      showPayment();
      return;
    }
    if (!lineAudioMode) playTapTone(false);
    setIsSpeaking(true);
    const nextStep = method === "promptpay" || method === "mobile"
      ? "กำลังสร้างคิวอาร์โค้ด"
      : `กำลังเปิดรับชำระผ่าน ${methods[method].short}`;
    paymentSafetyTimer = window.setTimeout(showPayment, 20000);
    speakThai(
      `ยอดชำระ ${thaiMoneyText(finalAmount)} กรุณาตรวจสอบยอด ${nextStep}`,
      showPayment,
      ["payment_total", ...thaiMoneyVoiceClips(finalAmount), "please_check", lineMethodClips[method]],
    );
  };

  const confirmPayment = () => {
    const finalAmount = Number(amountText);
    setDialogStage("checking");

    window.setTimeout(() => {
      const txn: Transaction = {
        id: `CP-${Date.now().toString().slice(-8)}`,
        method: methods[method].name,
        amount: finalAmount,
        time: "เมื่อสักครู่",
        status: "สำเร็จ",
      };
      setTransactions((current) => [txn, ...current]);
      setAvailableBalance((current) => current + finalAmount);
      setCart([]);
      setDialogStage("success");

      if (voiceEnabled) {
        speakThai(
          `ชำระยอด ${thaiMoneyText(finalAmount)} เรียบร้อยค่ะ`,
          undefined,
          ["paid_amount", ...thaiMoneyVoiceClips(finalAmount), "completed_female"],
        );
      }
    }, 1200);
  };

  const qrFileName = () => {
    const amountLabel = money.format(Number(amountText)).replace(/[^\d]/g, "") || "payment";
    return `ChatPOS-QR-${amountLabel}.png`;
  };

  const closeQrSavePreview = () => {
    setQrSavePreview(null);
    if (qrPreviewUrlRef.current) {
      URL.revokeObjectURL(qrPreviewUrlRef.current);
      qrPreviewUrlRef.current = null;
    }
  };

  const showQrSavePreview = (pngBlob: Blob) => {
    if (qrPreviewUrlRef.current) URL.revokeObjectURL(qrPreviewUrlRef.current);
    const previewUrl = URL.createObjectURL(pngBlob);
    qrPreviewUrlRef.current = previewUrl;
    setQrSavePreview(previewUrl);
  };

  const shareQrBlob = (pngBlob: Blob): boolean => {
    if (!navigator.share) return false;
    const file = new File([pngBlob], qrFileName(), { type: "image/png" });
    const shareData = { files: [file], title: "ChatPOS QR Payment", text: `QR รับชำระ ฿${money.format(Number(amountText))}` };
    if (navigator.canShare && !navigator.canShare(shareData)) return false;

    const shareResult = navigator.share(shareData);
    void shareResult.then(() => {
      toast.success("เปิดเมนูแชร์หรือบันทึกรูป QR แล้ว");
    }).catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      showQrSavePreview(pngBlob);
      toast.info("LINE ไม่เปิดเมนูบันทึก กรุณาแตะรูปค้างเพื่อบันทึก");
    });
    return true;
  };

  const openQrImageFullScreen = () => {
    const previewUrl = qrPreviewUrlRef.current;
    if (!previewUrl) return;
    const opened = window.open(previewUrl, "_blank");
    if (!opened) window.location.assign(previewUrl);
  };

  const saveQrImage = async () => {
    try {
      let pngBlob = qrPngBlobRef.current;
      if (!pngBlob) {
        const qrSvg = qrImageRef.current?.querySelector("svg");
        if (!qrSvg) throw new Error("ยังไม่พบรูป QR");
        pngBlob = await qrSvgToPngBlob(qrSvg);
        qrPngBlobRef.current = pngBlob;
      }

      showQrSavePreview(pngBlob);
      toast.success("สร้างรูป QR แล้ว เลือกวิธีบันทึกได้เลย");
    } catch {
      toast.error("บันทึกรูป QR ไม่สำเร็จ กรุณาลองอีกครั้ง");
    }
  };

  const addProduct = (product: (typeof products)[number]) => {
    setCart((current) => {
      const found = current.find((item) => item.id === product.id);
      return found
        ? current.map((item) => item.id === product.id ? { ...item, qty: item.qty + 1 } : item)
        : [...current, { ...product, qty: 1 }];
    });
    toast.success(`เพิ่ม ${product.name} แล้ว`);
  };

  const changeQty = (id: number, delta: number) => {
    setCart((current) => current.map((item) => item.id === id ? { ...item, qty: item.qty + delta } : item).filter((item) => item.qty > 0));
  };

  const submitWithdraw = () => {
    const withdrawAmount = Number(withdrawText);
    if (!withdrawAmount || withdrawAmount <= 0) return toast.error("กรุณาระบุจำนวนเงินที่ต้องการถอน");
    if (withdrawAmount > availableBalance) return toast.error("ยอดเงินพร้อมถอนไม่เพียงพอ");
    setAvailableBalance((current) => current - withdrawAmount);
    setTransactions((current) => [{
      id: `WD-${Date.now().toString().slice(-8)}`,
      method: "ถอนเข้าบัญชีธนาคาร",
      amount: -withdrawAmount,
      time: "เมื่อสักครู่",
      status: "กำลังตรวจสอบ",
    }, ...current]);
    setAmountText(String(withdrawAmount));
    setDialogStage("withdraw");
    setDialogOpen(true);
    setWithdrawText("");
  };

  const HomeScreen = () => (
    <>
      <Header />
      <main className="screen home-screen">
        <button className="balance-strip" onClick={() => go("transactions")}>
          <span><b>ยอดรับวันนี้</b><strong>฿{money.format(todayTotal)}</strong></span>
          <span><b>พร้อมถอน</b><strong>฿{money.format(availableBalance)}</strong></span>
          <ChevronRight />
        </button>

        <section className="ai-command-card">
          <div className="ai-command-head">
            <span className="ai-agent-avatar"><Bot /></span>
            <div>
              <small>CHATPOS INTELLIGENCE</small>
              <strong>AI Payment Assistant</strong>
            </div>
            <span className="ai-online"><i /> ออนไลน์</span>
          </div>
          <p><Sparkles /> พร้อมช่วยเลือกรูปแบบรับเงิน สรุปยอดขาย และเชื่อมทุกออเดอร์ให้ร้านอัตโนมัติ</p>
          <div className="ai-quick-actions">
            <button onClick={() => openMethodPicker(undefined, "AI รับเงินด่วน")}><Zap /> รับเงินด่วน</button>
            <button onClick={() => go("transactions")}><Activity /> วิเคราะห์วันนี้</button>
          </div>
        </section>

        <div className="payment-section-title">
          <span>รับชำระอัจฉริยะ</span>
          <small><Sparkles /> AI ROUTING ACTIVE</small>
        </div>

        <div className="payment-grid" aria-label="ช่องทางรับชำระเงิน">
          {(["promptpay", "visa", "truemoney"] as PaymentMethod[]).map((key, index) => (
            <button key={key} className={`payment-tile ${methods[key].tone === "green" ? "featured" : ""}`} onClick={() => selectMethod(key)}>
              <span className="number-badge">{index + 1}</span>
              <MethodMark method={key} size="lg" />
              <strong>{methods[key].name}</strong>
              <small>{key === "promptpay" ? "สร้าง QR อัตโนมัติ" : key === "visa" ? "รับบัตรแบบไร้สัมผัส" : "เชื่อมกระเป๋าเงินทันที"}</small>
            </button>
          ))}
          <button className="payment-tile gold-tile" onClick={() => go("other-methods")}>
            <span className="number-badge gold-badge">4</span>
            <span className="method-mark method-mark-lg method-other"><Grid2X2 /></span>
            <strong>ช่องทางอื่นๆ</strong>
            <small>AI เลือกช่องทางที่เหมาะสม</small>
          </button>
          <button className="payment-tile" onClick={() => go("withdraw")}>
            <span className="number-badge">5</span>
            <span className="method-mark method-mark-lg"><ArrowDownToLine /></span>
            <strong>ถอนเงิน</strong>
            <small>จัดการเงินพร้อมถอน</small>
          </button>
          <button className="payment-tile featured" onClick={() => openMethodPicker(undefined, "รับชำระทุกช่องทาง")}>
            <span className="number-badge">6</span>
            <span className="method-mark method-mark-lg dark"><Banknote /><Check /></span>
            <strong>รับทั้งหมด</strong>
            <small>รวมทุกช่องทางในจุดเดียว</small>
          </button>
        </div>
      </main>
    </>
  );

  const PaymentScreen = () => {
    const current = methods[method];
    const ActionIcon = current.icon;
    return (
      <>
        <Header title={current.name} onBack={() => go("home")} />
        <main className="screen payment-screen">
          <div className="ai-context-bar">
            <Sparkles />
            <span><b>AI Smart Pay</b> เตรียมช่องทาง {current.short} ให้แล้ว</span>
            <button className={`voice-toggle ${voiceEnabled ? "active" : ""}`} onClick={toggleVoice} aria-label={voiceEnabled ? "ปิดเสียงภาษาไทย" : "เปิดเสียงภาษาไทย"}>
              {voiceEnabled ? <Volume2 /> : <VolumeX />} {voiceEnabled ? "เสียงไทย" : "ปิดเสียง"}
            </button>
          </div>
          <div className={`voice-check voice-${voiceStatus}`}>
            <span>
              <Volume2 />
              <b>{voiceStatus === "speaking" ? "กำลังพูด..." : lineAudioMode && !lineAudioUnlocked ? "แตะเปิดเสียง LINE ก่อนใช้งาน" : voiceStatus === "ready" ? lineAudioMode ? "เสียงไทยใน LINE พร้อมใช้งาน" : "เสียงไทยพร้อมใช้งาน" : voiceStatus === "unsupported" || voiceStatus === "error" ? lineAudioMode ? "เพิ่มเสียงสื่อ แล้วลองเปิดเสียงอีกครั้ง" : "อุปกรณ์นี้ปิดกั้นเสียงพูด" : "แตะทดสอบเสียงก่อนรับเงิน"}</b>
            </span>
            {lineAudioMode && !lineAudioUnlocked ? (
              <button onClick={testVoice}><PlayCircle /> เปิดเสียง LINE</button>
            ) : voiceStatus === "unsupported" || voiceStatus === "error" ? (
              lineAudioMode
                ? <button onClick={testVoice}><PlayCircle /> ลองเสียงอีกครั้ง</button>
                : <button onClick={openInChrome}><ExternalLink /> เปิดใน Chrome</button>
            ) : (
              <button onClick={testVoice}><PlayCircle /> ทดสอบเสียง</button>
            )}
          </div>
          <section className="amount-card" aria-live="polite">
            <label htmlFor="payment-amount">ยอดชำระ:</label>
            <div className="amount-line">
              <input
                id="payment-amount"
                inputMode="decimal"
                value={amountText}
                onChange={(event) => setAmountText(event.target.value.replace(/[^0-9.]/g, "").slice(0, 9) || "0")}
                aria-label="ยอดชำระ"
              />
              <span>฿</span>
            </div>
            <p>{expression || paymentContext}</p>
          </section>

          <section className="keypad" aria-label="เครื่องคิดเลขรับชำระ">
            {["C", "⌫", "÷", "×", "7", "8", "9", "−", "4", "5", "6", "+", "1", "2", "3"].map((key) => (
              <button key={key} onClick={() => pressKey(key)} className={["÷", "×", "−", "+"].includes(key) ? "operator" : key === "C" || key === "⌫" ? "utility" : "number"}>
                {key === "⌫" ? <RotateCcw /> : key}
              </button>
            ))}
            <button className="number zero" onClick={() => pressKey("0")}>0</button>
            <button className="number" onClick={() => pressKey(".")}>.</button>
            <button className={`pay-action ${isSpeaking ? "is-speaking" : ""}`} onClick={initiatePayment} disabled={isSpeaking}>
              <ActionIcon />
              <strong>{isSpeaking ? "กำลังอ่านยอด..." : current.action}</strong>
            </button>
          </section>
        </main>
      </>
    );
  };

  const MethodPicker = ({ otherOnly = false }: { otherOnly?: boolean }) => {
    const options: PaymentMethod[] = otherOnly
      ? ["wechat", "alipay", "mobile", "shopeepay"]
      : ["promptpay", "visa", "truemoney", "wechat", "alipay", "mobile"];
    return (
      <>
        <Header title={otherOnly ? "ช่องทางอื่นๆ" : "เลือกช่องทางชำระ"} onBack={() => go("home")} />
        <main className="screen content-screen">
          <ScreenTitle title={otherOnly ? "รับชำระช่องทางอื่น" : "ลูกค้าต้องการจ่ายแบบไหน"} subtitle={amount > 0 ? `ยอดที่ต้องชำระ ฿${money.format(amount)}` : "เลือกช่องทางแล้วระบุยอดชำระ"} />
          <div className="method-list">
            {options.map((key) => (
              <button key={key} onClick={() => selectMethod(key, amount > 0 ? amount : undefined, paymentContext)}>
                <MethodMark method={key} />
                <span><strong>{methods[key].name}</strong><small>พร้อมให้บริการ</small></span>
                <ChevronRight />
              </button>
            ))}
          </div>
          {!otherOnly && (
            <button className="secondary-button" onClick={() => go("other-methods")}>
              ดูช่องทางอื่นทั้งหมด <ChevronRight />
            </button>
          )}
        </main>
      </>
    );
  };

  const TransactionsScreen = () => (
    <>
      <Header title="รายการล่าสุด" onBack={() => go("home")} />
      <main className="screen content-screen">
        <section className="summary-panel">
          <div><small>ยอดรับวันนี้</small><strong>฿{money.format(todayTotal)}</strong></div>
          <div><small>พร้อมถอน</small><strong>฿{money.format(availableBalance)}</strong></div>
          <div><small>รายการทั้งหมด</small><strong>{transactions.length}</strong></div>
        </section>
        <ScreenTitle title="ประวัติการเงิน" subtitle="รายการรับเงินและถอนเงินเชื่อมอยู่ในที่เดียว" />
        <div className="transaction-list">
          {transactions.map((item) => (
            <article key={item.id}>
              <span className={`transaction-icon ${item.amount < 0 ? "out" : ""}`}>{item.amount < 0 ? <ArrowDownToLine /> : <CheckCircle2 />}</span>
              <div><strong>{item.method}</strong><small>{item.id} · {item.time}</small></div>
              <div className="transaction-amount"><strong>{item.amount < 0 ? "−" : "+"}฿{money.format(Math.abs(item.amount))}</strong><small>{item.status}</small></div>
            </article>
          ))}
        </div>
      </main>
    </>
  );

  const WithdrawScreen = () => (
    <>
      <Header title="ถอนเงิน" onBack={() => go("home")} />
      <main className="screen content-screen">
        <section className="withdraw-balance">
          <span><WalletCards /></span>
          <div><small>ยอดเงินพร้อมถอน</small><strong>฿{money.format(availableBalance)}</strong></div>
          <ShieldCheck />
        </section>
        <ScreenTitle title="ถอนเข้าบัญชี" subtitle="เลือกบัญชีและระบุจำนวนเงิน" />
        <label className="form-label">บัญชีรับเงิน</label>
        <Select value={bankAccount} onValueChange={setBankAccount}>
          <SelectTrigger className="bank-select"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="main">บัญชีหลักร้าน ···· 1234</SelectItem>
            <SelectItem value="reserve">บัญชีสำรอง ···· 8890</SelectItem>
          </SelectContent>
        </Select>
        <label className="form-label" htmlFor="withdraw-amount">จำนวนเงินที่ต้องการถอน</label>
        <div className="money-input">
          <input id="withdraw-amount" inputMode="decimal" value={withdrawText} onChange={(event) => setWithdrawText(event.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="0.00" />
          <span>บาท</span>
        </div>
        <div className="quick-amounts">
          {[500, 1000, 5000, availableBalance].map((value, index) => <button key={`${value}-${index}`} onClick={() => setWithdrawText(String(value))}>{index === 3 ? "ทั้งหมด" : value.toLocaleString("th-TH")}</button>)}
        </div>
        <div className="fee-note"><ShieldCheck /><span>ค่าธรรมเนียมถอนเงิน 15 บาท<br/><small>ยอดจะเข้าบัญชีตามรอบการให้บริการ</small></span></div>
        <button className="primary-button" onClick={submitWithdraw}><ArrowDownToLine /> ยืนยันถอนเงิน</button>
      </main>
    </>
  );

  const OrdersScreen = () => (
    <>
      <Header title="ออเดอร์" />
      <main className="screen content-screen">
        <ScreenTitle title="รายการสั่งซื้อ" subtitle="รับออเดอร์และส่งยอดไปชำระเงินได้ทันที" />
        <Tabs defaultValue="new" className="orders-tabs">
          <TabsList><TabsTrigger value="new">ออเดอร์ใหม่ 3</TabsTrigger><TabsTrigger value="done">เสร็จแล้ว</TabsTrigger></TabsList>
          <TabsContent value="new" className="order-stack">
            {[
              { id: "A017", source: "โต๊ะ 7", item: "กะเพราไก่ไข่ดาว × 2, ชาไทย × 1", total: 195 },
              { id: "D103", source: "เดลิเวอรี่", item: "ข้าวผัดกุ้ง × 2", total: 170 },
              { id: "P042", source: "สั่งล่วงหน้า", item: "ต้มยำกุ้ง × 1, น้ำเปล่า × 2", total: 190 },
            ].map((order) => (
              <article className="order-card" key={order.id}>
                <div className="order-top"><span>#{order.id}</span><b>{order.source}</b></div>
                <p>{order.item}</p>
                <div><strong>฿{money.format(order.total)}</strong><button onClick={() => openMethodPicker(order.total, `ออเดอร์ #${order.id}`)}>รับชำระ <ChevronRight /></button></div>
              </article>
            ))}
          </TabsContent>
          <TabsContent value="done"><div className="empty-state"><PackageCheck /><strong>ออเดอร์ที่เสร็จแล้ว</strong><p>รายการที่รับชำระสำเร็จจะย้ายมาแสดงที่นี่</p></div></TabsContent>
        </Tabs>
      </main>
    </>
  );

  const TablesScreen = () => (
    <>
      <Header title="จ่ายที่โต๊ะ" />
      <main className="screen content-screen">
        <ScreenTitle title="เลือกโต๊ะเพื่อรับชำระ" subtitle="ยอดของแต่ละโต๊ะเชื่อมจากออเดอร์ล่าสุด" />
        <div className="table-grid">
          {[
            [1, 0], [2, 420], [3, 0], [4, 195], [5, 350], [6, 0], [7, 195], [8, 275]
          ].map(([table, total]) => (
            <button key={table} className={total ? "occupied" : ""} onClick={() => total ? openMethodPicker(total, `โต๊ะ ${table}`) : toast("โต๊ะนี้ยังไม่มีออเดอร์") }>
              <UtensilsCrossed /><strong>โต๊ะ {table}</strong><small>{total ? `฿${money.format(total)}` : "ว่าง"}</small>
            </button>
          ))}
        </div>
      </main>
    </>
  );

  const PosScreen = () => (
    <>
      <Header title="POS" />
      <main className="screen content-screen pos-screen">
        <ScreenTitle title="ขายหน้าร้าน" subtitle="แตะสินค้าเพื่อเพิ่มลงตะกร้า" />
        <div className="product-grid">
          {products.map((product) => <button key={product.id} onClick={() => addProduct(product)}><span><Plus /></span><strong>{product.name}</strong><small>฿{money.format(product.price)}</small></button>)}
        </div>
        <section className="cart-panel">
          <div className="cart-title"><h3><ShoppingBasket /> ตะกร้าสินค้า</h3><span>{cart.reduce((sum, item) => sum + item.qty, 0)} รายการ</span></div>
          {cart.length === 0 ? <div className="cart-empty">ยังไม่มีสินค้าในตะกร้า</div> : cart.map((item) => (
            <div className="cart-item" key={item.id}>
              <span><strong>{item.name}</strong><small>฿{money.format(item.price)}</small></span>
              <div><button onClick={() => changeQty(item.id, -1)} aria-label={`ลด ${item.name}`}><Minus /></button><b>{item.qty}</b><button onClick={() => changeQty(item.id, 1)} aria-label={`เพิ่ม ${item.name}`}><Plus /></button></div>
            </div>
          ))}
          <div className="cart-total"><span>ยอดรวม</span><strong>฿{money.format(cartTotal)}</strong></div>
          <button className="primary-button" disabled={!cart.length} onClick={() => openMethodPicker(cartTotal, "POS หน้าร้าน")}><CreditCard /> รับชำระเงิน</button>
        </section>
      </main>
    </>
  );

  const SettingsScreen = () => (
    <>
      <Header title="ตั้งค่า" />
      <main className="screen content-screen">
        <section className="merchant-card"><span><Store /></span><div><strong>ร้านตัวอย่าง</strong><small>Merchant ID: CP0001234</small></div><CheckCircle2 /></section>
        <ScreenTitle title="ตั้งค่าร้านค้า" subtitle="ข้อมูลทุกส่วนใช้ร่วมกันทั้งระบบ" />
        <div className="settings-list">
          <button><Building2 /><span><strong>ข้อมูลร้านค้า</strong><small>ชื่อร้าน ที่อยู่ และข้อมูลติดต่อ</small></span><ChevronRight /></button>
          <button onClick={() => go("withdraw")}><Landmark /><span><strong>บัญชีรับเงิน</strong><small>บัญชีหลัก ···· 1234</small></span><ChevronRight /></button>
          <button onClick={() => go("transactions")}><ReceiptText /><span><strong>รายการและรายงาน</strong><small>ตรวจสอบยอดรับและยอดถอน</small></span><ChevronRight /></button>
          <div className="switch-row"><Bell /><span><strong>แจ้งเตือนเมื่อรับเงิน</strong><small>เสียงและการแจ้งเตือนในเครื่อง</small></span><Switch defaultChecked aria-label="แจ้งเตือนเมื่อรับเงิน" /></div>
          <div className="switch-row"><ShieldCheck /><span><strong>ยืนยันก่อนทำรายการ</strong><small>เพิ่มความปลอดภัยก่อนรับและถอนเงิน</small></span><Switch defaultChecked aria-label="ยืนยันก่อนทำรายการ" /></div>
        </div>
      </main>
    </>
  );

  const renderScreen = () => {
    if (view === "home") return <HomeScreen />;
    if (view === "payment") return <PaymentScreen />;
    if (view === "method-picker") return <MethodPicker />;
    if (view === "other-methods") return <MethodPicker otherOnly />;
    if (view === "withdraw") return <WithdrawScreen />;
    if (view === "transactions") return <TransactionsScreen />;
    if (view === "orders") return <OrdersScreen />;
    if (view === "tables") return <TablesScreen />;
    if (view === "pos") return <PosScreen />;
    return <SettingsScreen />;
  };

  return (
    <div className="site-canvas">
      <div className="phone-app">
        {renderScreen()}
        <BottomNav view={view} go={go} />
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) closeQrSavePreview(); }}>
        <DialogContent
          className={`payment-dialog ${dialogStage === "ready" ? "qr-scanner-dialog" : ""}`}
          showCloseButton={dialogStage !== "ready"}
        >
          {dialogStage === "ready" ? (
            <section className="receive-qr-screen">
              <DialogDescription className="sr-only">QR สำหรับรับชำระเงินจำนวน {money.format(Number(amountText))} บาท</DialogDescription>
              <header className="qr-screen-header">
                <button type="button" onClick={() => setDialogOpen(false)} aria-label="ย้อนกลับ"><ArrowLeft /></button>
                <DialogTitle>สแกนจ่าย</DialogTitle>
                <span aria-hidden="true" />
              </header>

              <button type="button" className="qr-save-button" onClick={saveQrImage}>
                <ArrowDownToLine />
                <span>Save รูป QR ลงมือถือ</span>
              </button>

              <div className="qr-scan-zone">
                <div className="qr-payment-card">
                  <div className="thai-qr-brand">
                    <QrCode />
                    <span>THAI QR <b>PAYMENT</b></span>
                  </div>
                  <div className="qr-payment-body">
                    <div className="payment-brand-row" aria-label="ช่องทางที่รองรับ">
                      <b>PromptPay</b>
                      <strong>VISA</strong>
                      <i aria-label="Mastercard"><span /><span /></i>
                    </div>
                    <div ref={qrImageRef} className="merchant-qr"><QrCode /></div>
                    <h3>ร้านตัวอย่าง</h3>
                    <p>{paymentContext}</p>
                    <div className="qr-total">฿{money.format(Number(amountText))}</div>
                    <small>เลขอ้างอิง: CP0001234</small>
                  </div>
                </div>
                <div className="scan-beam" aria-hidden="true" />
                <i className="scan-corner corner-tl" aria-hidden="true" />
                <i className="scan-corner corner-tr" aria-hidden="true" />
                <i className="scan-corner corner-bl" aria-hidden="true" />
                <i className="scan-corner corner-br" aria-hidden="true" />
              </div>

              <div className="qr-trust-row">
                <span><Volume2 /> เสียงไทย</span>
                <span><ShieldCheck /> ตรวจสอบปลอดภัย</span>
              </div>
              <p className="qr-instruction">แสดง QR ให้ลูกค้าสแกนชำระเงิน</p>
              <div className="qr-waiting-status"><span /> กำลังรอรับชำระเงิน</div>
              <button className="qr-check-button" onClick={confirmPayment}><ShieldCheck /> ตรวจสอบการชำระ</button>

              {qrSavePreview && (
                <div className="qr-save-preview" role="dialog" aria-modal="true" aria-label="บันทึกรูป QR ใน LINE">
                  <div className="qr-save-preview-card">
                    <button type="button" className="qr-save-preview-close" onClick={closeQrSavePreview} aria-label="ปิด">×</button>
                    <div className="qr-save-preview-icon"><ArrowDownToLine /></div>
                    <h3>รูป QR พร้อมบันทึก</h3>
                    <p>เลือกปุ่มด้านล่าง หากเปิดใน LINE แนะนำให้กด “เปิดรูปเต็มจอ” แล้วแตะรูปค้างเพื่อบันทึก</p>
                    <a className="qr-save-image-link" href={qrSavePreview} download={qrFileName()} aria-label="ดาวน์โหลดรูป QR">
                      <img src={qrSavePreview} alt="รูป QR สำหรับบันทึกลงมือถือ" />
                    </a>
                    <a className="qr-save-download-button" href={qrSavePreview} download={qrFileName()}>
                      <ArrowDownToLine /> ดาวน์โหลดรูป QR
                    </a>
                    <button type="button" className="qr-save-full-button" onClick={openQrImageFullScreen}>
                      <QrCode /> เปิดรูป QR เต็มจอ
                    </button>
                    <button type="button" className="qr-save-share-button" onClick={() => {
                      const pngBlob = qrPngBlobRef.current;
                      if (pngBlob && !shareQrBlob(pngBlob)) toast.info("เครื่องนี้ไม่รองรับเมนูแชร์ กรุณากดเปิดรูปเต็มจอแล้วแตะรูปค้าง");
                    }}>
                      <ExternalLink /> แชร์ผ่านมือถือ
                    </button>
                    <button type="button" className="qr-save-back-button" onClick={closeQrSavePreview}>กลับหน้าสแกนจ่าย</button>
                  </div>
                </div>
              )}
            </section>
          ) : dialogStage === "checking" ? (
            <div className="success-dialog checking-dialog">
              <div className="checking-ring"><ShieldCheck /></div>
              <DialogHeader>
                <DialogTitle>กำลังตรวจสอบการชำระ</DialogTitle>
                <DialogDescription>ระบบกำลังยืนยันยอดจากผู้ให้บริการชำระเงิน</DialogDescription>
              </DialogHeader>
              <strong>฿{money.format(Number(amountText))}</strong>
              <div className="dialog-status"><span></span>กำลังตรวจสอบสถานะ...</div>
            </div>
          ) : dialogStage === "success" ? (
            <div className="success-dialog">
              <div className="success-badge"><Check /></div>
              <DialogHeader>
                <DialogTitle>ชำระเงินเรียบร้อย</DialogTitle>
                <DialogDescription>ตรวจสอบยอดสำเร็จและบันทึกรายการแล้ว</DialogDescription>
              </DialogHeader>
              <strong>฿{money.format(Number(amountText))}</strong>
              <button className="primary-button" onClick={() => { setDialogOpen(false); resetAmount(); go("transactions"); }}><ReceiptText /> ดูรายการล่าสุด</button>
              <button className="text-button" onClick={() => { setDialogOpen(false); resetAmount(); go("home"); }}>กลับหน้าหลัก</button>
            </div>
          ) : (
            <div className="success-dialog">
              <div className="success-badge gold-success"><ArrowDownToLine /></div>
              <DialogHeader><DialogTitle>ส่งคำขอถอนเงินแล้ว</DialogTitle><DialogDescription>ระบบบันทึกรายการและกำลังตรวจสอบคำขอ</DialogDescription></DialogHeader>
              <strong>฿{money.format(Number(amountText))}</strong>
              <button className="primary-button" onClick={() => { setDialogOpen(false); go("transactions"); }}><ReceiptText /> ตรวจสอบสถานะ</button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Toaster position="top-center" richColors />
    </div>
  );
}
