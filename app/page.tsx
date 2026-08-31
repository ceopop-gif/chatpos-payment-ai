"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
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
  Copy,
  CreditCard,
  ExternalLink,
  Grid2X2,
  Home,
  ImagePlus,
  Landmark,
  Minus,
  PackageCheck,
  PackagePlus,
  Pencil,
  Plus,
  PlayCircle,
  QrCode,
  ReceiptText,
  RotateCcw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBasket,
  Sparkles,
  Store,
  Trash2,
  UtensilsCrossed,
  Volume2,
  VolumeX,
  WalletCards,
  X,
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
import { QRCodeSVG } from "qrcode.react";

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
  | "product-manager"
  | "settings";

type PaymentMethod = "promptpay" | "visa" | "truemoney" | "wechat" | "alipay" | "mobile" | "shopeepay";

type Transaction = {
  id: string;
  method: string;
  amount: number;
  time: string;
  status: "สำเร็จ" | "กำลังตรวจสอบ";
};

type Product = {
  id: number;
  name: string;
  price: number;
  category: string;
  description: string;
  image: string | null;
  active: boolean;
};

type CartItem = Pick<Product, "id" | "name" | "price"> & { qty: number };

type RestaurantTable = {
  id: number;
  name: string;
  token: string;
  active: boolean;
  orderTotal: number;
  orderCount: number;
  createdAt: string;
};

type TableOrder = {
  id: string;
  orderNumber: string;
  status: "new" | "done";
  total: number;
  note: string;
  createdAt: string;
  updatedAt: string;
  tableId: number;
  tableName: string;
  items: Array<{ productId: number; name: string; price: number; quantity: number }>;
};

const methods: Record<PaymentMethod, { name: string; short: string; icon: typeof QrCode; tone: string; action: string }> = {
  promptpay: { name: "QR PromptPay", short: "พร้อมเพย์", icon: QrCode, tone: "green", action: "สร้าง QR" },
  visa: { name: "VISA THAI", short: "บัตร VISA", icon: CreditCard, tone: "mint", action: "รับ VISA" },
  truemoney: { name: "TrueMoney", short: "ทรูมันนี่", icon: WalletCards, tone: "mint", action: "รับ TrueMoney" },
  wechat: { name: "WeChat Pay", short: "WeChat Pay", icon: CircleDollarSign, tone: "mint", action: "รับ WeChat Pay" },
  alipay: { name: "Alipay", short: "Alipay", icon: WalletCards, tone: "mint", action: "รับ Alipay" },
  mobile: { name: "Mobile Banking", short: "Mobile Banking", icon: Landmark, tone: "mint", action: "สร้าง QR" },
  shopeepay: { name: "ShopeePay", short: "ShopeePay", icon: WalletCards, tone: "gold", action: "รับ ShopeePay" },
};

const seededProducts: Product[] = [
  { id: 1, name: "กะเพราไก่ไข่ดาว", price: 75, category: "อาหารจานเดียว", description: "", image: null, active: true },
  { id: 2, name: "ข้าวผัดกุ้ง", price: 85, category: "อาหารจานเดียว", description: "", image: null, active: true },
  { id: 3, name: "ต้มยำกุ้ง", price: 150, category: "กับข้าว", description: "", image: null, active: true },
  { id: 4, name: "ชาไทย", price: 45, category: "เครื่องดื่ม", description: "", image: null, active: true },
  { id: 5, name: "อเมริกาโน่", price: 55, category: "เครื่องดื่ม", description: "", image: null, active: true },
  { id: 6, name: "น้ำเปล่า", price: 20, category: "เครื่องดื่ม", description: "", image: null, active: true },
];

const defaultProductCategories = ["อาหารจานเดียว", "กับข้าว", "ของทานเล่น", "เครื่องดื่ม", "ของหวาน", "สินค้าอื่นๆ"];
const PRODUCT_STORAGE_KEY = "chatpos-product-catalog-v1";
const CATEGORY_STORAGE_KEY = "chatpos-product-categories-v1";

const seededTransactions: Transaction[] = [
  { id: "CP-240816-017", method: "QR PromptPay", amount: 320, time: "10:45 น.", status: "สำเร็จ" },
  { id: "CP-240816-016", method: "VISA THAI", amount: 1250, time: "10:43 น.", status: "สำเร็จ" },
  { id: "CP-240816-015", method: "TrueMoney", amount: 89, time: "10:41 น.", status: "สำเร็จ" },
];

const money = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function compressProductImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("อ่านรูปสินค้าไม่สำเร็จ"));
    reader.onload = () => {
      if (typeof reader.result !== "string") return reject(new Error("อ่านรูปสินค้าไม่สำเร็จ"));
      const image = new Image();
      image.onerror = () => reject(new Error("เปิดรูปสินค้าไม่สำเร็จ"));
      image.onload = () => {
        const maxSide = 720;
        const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) return reject(new Error("เตรียมรูปสินค้าไม่สำเร็จ"));
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

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

function canvasRoundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function drawFittedCanvasText(context: CanvasRenderingContext2D, text: string, centerX: number, y: number, maxWidth: number, startSize: number, weight = 900) {
  let fontSize = startSize;
  do {
    context.font = `${weight} ${fontSize}px Tahoma, "Noto Sans Thai", Arial, sans-serif`;
    if (context.measureText(text).width <= maxWidth) break;
    fontSize -= 2;
  } while (fontSize > 28);
  context.textAlign = "center";
  context.fillText(text, centerX, y);
}

async function tableQrToPngBlob(qrSvg: SVGSVGElement, tableName: string, link: string): Promise<Blob> {
  const clonedSvg = qrSvg.cloneNode(true) as SVGSVGElement;
  clonedSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clonedSvg.setAttribute("width", "1024");
  clonedSvg.setAttribute("height", "1024");
  clonedSvg.setAttribute("viewBox", qrSvg.getAttribute("viewBox") || "0 0 256 256");

  const svgBlob = new Blob([new XMLSerializer().serializeToString(clonedSvg)], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);
  const qrImage = new Image();

  try {
    await new Promise<void>((resolve, reject) => {
      qrImage.onload = () => resolve();
      qrImage.onerror = () => reject(new Error("โหลด QR ประจำโต๊ะไม่สำเร็จ"));
      qrImage.src = svgUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1500;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("อุปกรณ์ไม่รองรับการสร้างรูป");

    context.fillStyle = "#eef7f3";
    context.fillRect(0, 0, canvas.width, canvas.height);

    const headerGradient = context.createLinearGradient(0, 0, canvas.width, 280);
    headerGradient.addColorStop(0, "#063d33");
    headerGradient.addColorStop(.58, "#08715b");
    headerGradient.addColorStop(1, "#446fdd");
    context.fillStyle = headerGradient;
    context.fillRect(0, 0, canvas.width, 290);

    context.fillStyle = "#ffffff";
    context.textAlign = "left";
    context.font = "900 72px Tahoma, Arial, sans-serif";
    context.fillText("ChatPOS", 82, 112);
    context.fillStyle = "#9ff4d7";
    context.font = "800 34px Tahoma, \"Noto Sans Thai\", Arial, sans-serif";
    context.fillText("สแกนเพื่อสั่งอาหาร", 84, 171);

    context.fillStyle = "#ffffff";
    canvasRoundRect(context, 70, 215, 1060, 1165, 54);
    context.fill();

    context.fillStyle = "#6356c8";
    context.font = "900 28px Tahoma, \"Noto Sans Thai\", Arial, sans-serif";
    context.textAlign = "center";
    context.fillText("ลิงก์สั่งอาหารประจำโต๊ะ", 600, 312);

    context.fillStyle = "#123b31";
    drawFittedCanvasText(context, tableName, 600, 396, 940, 76);

    context.fillStyle = "#ffffff";
    context.shadowColor = "rgba(7, 45, 37, .14)";
    context.shadowBlur = 26;
    canvasRoundRect(context, 156, 455, 888, 888, 38);
    context.fill();
    context.shadowColor = "transparent";
    context.shadowBlur = 0;
    context.drawImage(qrImage, 196, 495, 808, 808);

    context.fillStyle = "#087b59";
    context.font = "900 34px Tahoma, \"Noto Sans Thai\", Arial, sans-serif";
    context.textAlign = "center";
    context.fillText("เปิดกล้องแล้วสแกน QR Code", 600, 1425);
    context.fillStyle = "#6d7f78";
    drawFittedCanvasText(context, new URL(link).host, 600, 1470, 990, 24, 700);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("สร้างรูป QR ไม่สำเร็จ")), "image/png", 1);
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
    { key: "tables" as View, label: "จัดการโต๊ะ", icon: UtensilsCrossed },
    { key: "home" as View, label: "หน้าหลัก", icon: Home, center: true },
    { key: "pos" as View, label: "POS", icon: ShoppingBasket },
    { key: "settings" as View, label: "ตั้งค่า", icon: Settings },
  ];

  return (
    <nav className="bottom-nav" aria-label="เมนูหลัก">
      {nav.map((item) => {
        const Icon = item.icon;
        const active = view === item.key
          || (item.key === "pos" && view === "product-manager")
          || (item.key === "home" && ["payment", "method-picker", "other-methods", "withdraw", "transactions"].includes(view));
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
  const [catalog, setCatalog] = useState<Product[]>(seededProducts);
  const [catalogReady, setCatalogReady] = useState(false);
  const [categories, setCategories] = useState<string[]>(defaultProductCategories);
  const [categoriesReady, setCategoriesReady] = useState(false);
  const [posCategory, setPosCategory] = useState("ทั้งหมด");
  const [productSearch, setProductSearch] = useState("");
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productCategory, setProductCategory] = useState(defaultProductCategories[0]);
  const [productDescription, setProductDescription] = useState("");
  const [productImage, setProductImage] = useState<string | null>(null);
  const [productActive, setProductActive] = useState(true);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const [tableSearch, setTableSearch] = useState("");
  const [addingTable, setAddingTable] = useState(false);
  const [tableQrOpen, setTableQrOpen] = useState(false);
  const [selectedQrTable, setSelectedQrTable] = useState<RestaurantTable | null>(null);
  const [tableQrPreview, setTableQrPreview] = useState<string | null>(null);
  const [tableQrGenerating, setTableQrGenerating] = useState(false);
  const [tableOrders, setTableOrders] = useState<TableOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
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
  const tableQrImageRef = useRef<HTMLDivElement | null>(null);
  const tableQrPngBlobRef = useRef<Blob | null>(null);
  const tableQrPreviewUrlRef = useRef<string | null>(null);
  const productFormRef = useRef<HTMLFormElement | null>(null);
  const productStorageErrorRef = useRef(false);
  const categoryStorageErrorRef = useRef(false);
  const menuSyncReadyRef = useRef(false);
  const menuSyncTimerRef = useRef<number | null>(null);

  const amount = Number(amountText || 0);
  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.qty, 0), [cart]);
  const todayTotal = useMemo(() => transactions.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0), [transactions]);
  const activeProducts = useMemo(() => catalog.filter((product) => product.active), [catalog]);
  const availableCategories = useMemo(() => {
    const allNames = [...categories, ...catalog.map((product) => product.category)];
    return allNames.reduce<string[]>((result, category) => {
      const name = category.trim();
      if (name && !result.some((item) => item.localeCompare(name, "th", { sensitivity: "base" }) === 0)) result.push(name);
      return result;
    }, []);
  }, [categories, catalog]);
  const searchTerms = useMemo(() => productSearch.trim().toLocaleLowerCase("th-TH").split(/\s+/).filter(Boolean), [productSearch]);
  const searchMatchedProducts = useMemo(() => activeProducts.filter((product) => {
    if (searchTerms.length === 0) return true;
    const searchableText = `${product.name} ${product.category} ${product.description}`.toLocaleLowerCase("th-TH");
    return searchTerms.every((term) => searchableText.includes(term));
  }), [activeProducts, searchTerms]);
  const visibleProducts = useMemo(
    () => posCategory === "ทั้งหมด" ? searchMatchedProducts : searchMatchedProducts.filter((product) => product.category === posCategory),
    [searchMatchedProducts, posCategory],
  );
  const filteredTables = useMemo(() => {
    const term = tableSearch.trim().toLocaleLowerCase("th-TH");
    return term ? tables.filter((table) => table.name.toLocaleLowerCase("th-TH").includes(term)) : tables;
  }, [tableSearch, tables]);
  const newTableOrders = useMemo(() => tableOrders.filter((order) => order.status === "new"), [tableOrders]);
  const doneTableOrders = useMemo(() => tableOrders.filter((order) => order.status === "done"), [tableOrders]);

  useEffect(() => {
    try {
      const storedCatalog = window.localStorage.getItem(PRODUCT_STORAGE_KEY);
      if (storedCatalog) {
        const parsed = JSON.parse(storedCatalog) as unknown;
        if (Array.isArray(parsed)) {
          const restored = parsed.flatMap((item): Product[] => {
            if (!item || typeof item !== "object") return [];
            const candidate = item as Partial<Product>;
            if (typeof candidate.id !== "number" || !Number.isFinite(candidate.id) || typeof candidate.name !== "string" || typeof candidate.price !== "number" || !Number.isFinite(candidate.price) || candidate.price <= 0) return [];
            return [{
              id: candidate.id,
              name: candidate.name,
              price: candidate.price,
              category: typeof candidate.category === "string" ? candidate.category : "สินค้าอื่นๆ",
              description: typeof candidate.description === "string" ? candidate.description : "",
              image: typeof candidate.image === "string" ? candidate.image : null,
              active: candidate.active !== false,
            }];
          });
          setCatalog(restored);
        }
      }
    } catch {
      // Keep the built-in starter catalog when browser storage is unavailable or invalid.
    } finally {
      setCatalogReady(true);
    }
  }, []);

  useEffect(() => {
    if (!catalogReady) return;
    try {
      window.localStorage.setItem(PRODUCT_STORAGE_KEY, JSON.stringify(catalog));
      productStorageErrorRef.current = false;
    } catch {
      if (!productStorageErrorRef.current) {
        toast.error("พื้นที่บันทึกในเครื่องเต็ม กรุณาใช้รูปสินค้าที่มีขนาดเล็กลง");
        productStorageErrorRef.current = true;
      }
    }
  }, [catalog, catalogReady]);

  useEffect(() => {
    try {
      const storedCategories = window.localStorage.getItem(CATEGORY_STORAGE_KEY);
      if (storedCategories) {
        const parsed = JSON.parse(storedCategories) as unknown;
        if (Array.isArray(parsed)) {
          const restored = parsed.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
          setCategories([...defaultProductCategories, ...restored].reduce<string[]>((result, category) => {
            if (!result.some((item) => item.localeCompare(category, "th", { sensitivity: "base" }) === 0)) result.push(category);
            return result;
          }, []));
        }
      }
    } catch {
      // Keep the starter categories when browser storage is unavailable or invalid.
    } finally {
      setCategoriesReady(true);
    }
  }, []);

  useEffect(() => {
    if (!categoriesReady) return;
    try {
      window.localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(categories));
      categoryStorageErrorRef.current = false;
    } catch {
      if (!categoryStorageErrorRef.current) {
        toast.error("บันทึกหมวดหมู่ในเครื่องไม่สำเร็จ กรุณาลองอีกครั้ง");
        categoryStorageErrorRef.current = true;
      }
    }
  }, [categories, categoriesReady]);

  useEffect(() => {
    if (!catalogReady || !categoriesReady || menuSyncReadyRef.current) return;
    let active = true;
    const initializeSharedMenu = async () => {
      try {
        const hasLocalCatalog = Boolean(window.localStorage.getItem(PRODUCT_STORAGE_KEY));
        const response = await fetch("/api/menu", { cache: "no-store" });
        const payload = await response.json() as { products?: Product[]; categories?: string[]; persisted?: boolean };
        if (!active) return;
        if (!hasLocalCatalog && response.ok && payload.persisted && payload.products?.length) {
          setCatalog(payload.products);
          if (payload.categories?.length) setCategories(payload.categories);
        } else {
          await fetch("/api/menu", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ products: catalog, categories }),
          });
        }
      } catch {
        // The local POS remains usable while the shared menu is temporarily unavailable.
      } finally {
        if (active) menuSyncReadyRef.current = true;
      }
    };
    void initializeSharedMenu();
    return () => { active = false; };
  }, [catalogReady, categoriesReady]);

  useEffect(() => {
    if (!menuSyncReadyRef.current || !catalogReady || !categoriesReady) return;
    if (menuSyncTimerRef.current !== null) window.clearTimeout(menuSyncTimerRef.current);
    menuSyncTimerRef.current = window.setTimeout(() => {
      void fetch("/api/menu", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ products: catalog, categories }),
      }).catch(() => undefined);
    }, 700);
    return () => {
      if (menuSyncTimerRef.current !== null) window.clearTimeout(menuSyncTimerRef.current);
    };
  }, [catalog, catalogReady, categories, categoriesReady]);

  useEffect(() => {
    if (view !== "tables" && view !== "orders") return;
    let active = true;
    const refresh = async () => {
      try {
        const [tableResponse, orderResponse] = await Promise.all([
          fetch("/api/tables", { cache: "no-store" }),
          fetch("/api/orders", { cache: "no-store" }),
        ]);
        const tablePayload = await tableResponse.json() as { tables?: RestaurantTable[] };
        const orderPayload = await orderResponse.json() as { orders?: TableOrder[] };
        if (!active) return;
        if (tableResponse.ok && tablePayload.tables) setTables(tablePayload.tables);
        if (orderResponse.ok && orderPayload.orders) setTableOrders(orderPayload.orders);
      } finally {
        if (active) {
          setTablesLoading(false);
          setOrdersLoading(false);
        }
      }
    };
    setTablesLoading(true);
    setOrdersLoading(true);
    void refresh();
    const timer = window.setInterval(() => void refresh(), 6000);
    return () => { active = false; window.clearInterval(timer); };
  }, [view]);

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
    if (tableQrPreviewUrlRef.current) URL.revokeObjectURL(tableQrPreviewUrlRef.current);
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

  const tableOrderLink = (table: RestaurantTable) => {
    if (typeof window === "undefined") return `/order/${table.token}`;
    return `${window.location.origin}/order/${table.token}`;
  };

  const copyText = async (value: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        const input = document.createElement("textarea");
        input.value = value;
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        input.remove();
      }
      return true;
    } catch {
      return false;
    }
  };

  const copyTableLink = async (table: RestaurantTable) => {
    const copied = await copyText(tableOrderLink(table));
    copied ? toast.success(`คัดลอกลิงก์ ${table.name} แล้ว`) : toast.error("คัดลอกลิงก์ไม่สำเร็จ กรุณาเปิดใน Chrome");
  };

  const tableQrFileName = (table: RestaurantTable) => {
    const safeName = table.name.trim().replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-+|-+$/g, "") || `table-${table.id}`;
    return `ChatPOS-QR-${safeName}.png`;
  };

  const clearTableQrPreview = () => {
    setTableQrPreview(null);
    tableQrPngBlobRef.current = null;
    if (tableQrPreviewUrlRef.current) {
      URL.revokeObjectURL(tableQrPreviewUrlRef.current);
      tableQrPreviewUrlRef.current = null;
    }
  };

  const openTableQr = (table: RestaurantTable) => {
    clearTableQrPreview();
    setSelectedQrTable(table);
    setTableQrOpen(true);
  };

  const closeTableQr = () => {
    setTableQrOpen(false);
    setSelectedQrTable(null);
    clearTableQrPreview();
  };

  const buildTableQrImage = async () => {
    if (!selectedQrTable) throw new Error("ไม่พบข้อมูลโต๊ะ");
    if (tableQrPngBlobRef.current) return tableQrPngBlobRef.current;
    const qrSvg = tableQrImageRef.current?.querySelector("svg");
    if (!qrSvg) throw new Error("ยังไม่พบ QR Code");
    const blob = await tableQrToPngBlob(qrSvg, selectedQrTable.name, tableOrderLink(selectedQrTable));
    tableQrPngBlobRef.current = blob;
    return blob;
  };

  const showTableQrPreview = (blob: Blob) => {
    if (tableQrPreviewUrlRef.current) URL.revokeObjectURL(tableQrPreviewUrlRef.current);
    const previewUrl = URL.createObjectURL(blob);
    tableQrPreviewUrlRef.current = previewUrl;
    setTableQrPreview(previewUrl);
  };

  const saveTableQrImage = async () => {
    if (!selectedQrTable) return;
    setTableQrGenerating(true);
    try {
      const blob = await buildTableQrImage();
      showTableQrPreview(blob);

      if (isLineEnvironment()) {
        toast.success("สร้างรูปแล้ว กดเปิดรูปเต็มจอและแตะรูปค้างเพื่อบันทึก");
        return;
      }

      const anchor = document.createElement("a");
      anchor.href = tableQrPreviewUrlRef.current ?? URL.createObjectURL(blob);
      anchor.download = tableQrFileName(selectedQrTable);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      toast.success(`บันทึกรูป QR ${selectedQrTable.name} แล้ว`);
    } catch {
      toast.error("สร้างรูป QR ประจำโต๊ะไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setTableQrGenerating(false);
    }
  };

  const shareTableQrImage = async () => {
    if (!selectedQrTable) return;
    setTableQrGenerating(true);
    try {
      const blob = await buildTableQrImage();
      showTableQrPreview(blob);
      const file = new File([blob], tableQrFileName(selectedQrTable), { type: "image/png" });
      const shareData = { files: [file], title: `QR สั่งอาหาร ${selectedQrTable.name}`, text: `QR สั่งอาหารประจำ ${selectedQrTable.name}` };
      if (!navigator.share || (navigator.canShare && !navigator.canShare(shareData))) {
        toast.info("เครื่องนี้ไม่รองรับเมนูบันทึก กรุณาดาวน์โหลดหรือเปิดรูปเต็มจอ");
        return;
      }
      await navigator.share(shareData);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.info("หากเปิดใน LINE ให้เปิดรูปเต็มจอแล้วแตะรูปค้างเพื่อบันทึก");
    } finally {
      setTableQrGenerating(false);
    }
  };

  const openTableQrFullScreen = () => {
    const previewUrl = tableQrPreviewUrlRef.current;
    if (!previewUrl) return;
    const opened = window.open(previewUrl, "_blank");
    if (!opened) window.location.assign(previewUrl);
  };

  const createTable = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newTableName.trim().replace(/\s+/g, " ");
    if (!name) return toast.error("กรุณากรอกชื่อหรือหมายเลขโต๊ะ");
    setAddingTable(true);
    try {
      const response = await fetch("/api/tables", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = await response.json() as { table?: RestaurantTable; error?: string };
      if (!response.ok || !payload.table) throw new Error(payload.error || "เพิ่มโต๊ะไม่สำเร็จ");
      setNewTableName("");
      const tableResponse = await fetch("/api/tables", { cache: "no-store" });
      const tablePayload = await tableResponse.json() as { tables?: RestaurantTable[] };
      if (tableResponse.ok && tablePayload.tables) setTables(tablePayload.tables);
      toast.success(`สร้าง ${name} และลิงก์สั่งอาหารแล้ว`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "เพิ่มโต๊ะไม่สำเร็จ");
    } finally {
      setAddingTable(false);
    }
  };

  const markOrderDone = async (order: TableOrder) => {
    try {
      const response = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: order.id, status: "done" }),
      });
      if (!response.ok) throw new Error("อัปเดตออเดอร์ไม่สำเร็จ");
      setTableOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: "done" } : item));
      setTables((current) => current.map((table) => table.id === order.tableId ? {
        ...table,
        orderCount: Math.max(0, table.orderCount - 1),
        orderTotal: Math.max(0, table.orderTotal - order.total),
      } : table));
      toast.success(`ออเดอร์ #${order.orderNumber} เสร็จแล้ว`);
    } catch {
      toast.error("อัปเดตออเดอร์ไม่สำเร็จ กรุณาลองอีกครั้ง");
    }
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

  const addProduct = (product: Product) => {
    setCart((current) => {
      const found = current.find((item) => item.id === product.id);
      return found
        ? current.map((item) => item.id === product.id ? { ...item, qty: item.qty + 1 } : item)
        : [...current, { id: product.id, name: product.name, price: product.price, qty: 1 }];
    });
    toast.success(`เพิ่ม ${product.name} แล้ว`);
  };

  const resetProductForm = (nextCategory = availableCategories[0] ?? defaultProductCategories[0]) => {
    setEditingProductId(null);
    setProductName("");
    setProductPrice("");
    setProductCategory(nextCategory);
    setProductDescription("");
    setProductImage(null);
    setProductActive(true);
  };

  const openCategoryDialog = () => {
    setNewCategoryName("");
    setCategoryDialogOpen(true);
  };

  const submitCategory = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const categoryName = newCategoryName.trim().replace(/\s+/g, " ");
    if (!categoryName) return toast.error("กรุณากรอกชื่อหมวดหมู่");
    const existingCategory = availableCategories.find((category) => category.localeCompare(categoryName, "th", { sensitivity: "base" }) === 0);
    if (existingCategory) {
      setProductCategory(existingCategory);
      setCategoryDialogOpen(false);
      setNewCategoryName("");
      toast.info(`เลือกหมวด ${existingCategory} ให้แล้ว`);
      return;
    }
    setCategories((current) => [...current, categoryName]);
    setProductCategory(categoryName);
    setCategoryDialogOpen(false);
    setNewCategoryName("");
    toast.success(`เพิ่มหมวด ${categoryName} แล้ว`);
  };

  const handleProductImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("รองรับรูป JPG, PNG หรือ WebP เท่านั้น");
      input.value = "";
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("รูปสินค้าต้องมีขนาดไม่เกิน 8 MB");
      input.value = "";
      return;
    }
    try {
      setProductImage(await compressProductImage(file));
      toast.success("เพิ่มรูปสินค้าแล้ว");
    } catch {
      toast.error("อ่านรูปสินค้าไม่สำเร็จ กรุณาเลือกรูปใหม่");
    } finally {
      input.value = "";
    }
  };

  const submitProduct = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = productName.trim();
    const parsedPrice = Number(productPrice.replace(",", "."));
    if (!name) return toast.error("กรุณากรอกชื่อสินค้า");
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) return toast.error("กรุณากรอกราคาสินค้ามากกว่า 0 บาท");
    const price = Math.round(parsedPrice * 100) / 100;

    if (editingProductId !== null) {
      setCatalog((current) => current.map((product) => product.id === editingProductId ? {
        ...product,
        name,
        price,
        category: productCategory,
        description: productDescription.trim(),
        image: productImage,
        active: productActive,
      } : product));
      toast.success(`อัปเดต ${name} เรียบร้อยแล้ว`);
    } else {
      setCatalog((current) => [{
        id: Date.now(),
        name,
        price,
        category: productCategory,
        description: productDescription.trim(),
        image: productImage,
        active: productActive,
      }, ...current]);
      toast.success(`บันทึก ${name} เรียบร้อยแล้ว`);
    }
    resetProductForm(productCategory);
  };

  const editProduct = (product: Product) => {
    setEditingProductId(product.id);
    setProductName(product.name);
    setProductPrice(String(product.price));
    setProductCategory(product.category);
    setProductDescription(product.description);
    setProductImage(product.image);
    setProductActive(product.active);
    window.setTimeout(() => productFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const toggleProductActive = (id: number, active: boolean) => {
    setCatalog((current) => current.map((product) => product.id === id ? { ...product, active } : product));
  };

  const deleteProduct = (product: Product) => {
    if (!window.confirm(`ยืนยันลบ “${product.name}” ออกจากรายการสินค้า?`)) return;
    setCatalog((current) => current.filter((item) => item.id !== product.id));
    setCart((current) => current.filter((item) => item.id !== product.id));
    if (editingProductId === product.id) resetProductForm();
    toast.success(`ลบ ${product.name} แล้ว`);
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
        <ScreenTitle title="ออเดอร์จากโต๊ะ" subtitle="อัปเดตอัตโนมัติทุก 6 วินาที พร้อมระบุโต๊ะจากลิงก์ที่ลูกค้าเปิด" />
        <Tabs defaultValue="new" className="orders-tabs">
          <TabsList><TabsTrigger value="new">ออเดอร์ใหม่ {newTableOrders.length}</TabsTrigger><TabsTrigger value="done">เสร็จแล้ว {doneTableOrders.length}</TabsTrigger></TabsList>
          <TabsContent value="new" className="order-stack">
            {ordersLoading && !newTableOrders.length ? <div className="order-loading"><Sparkles /> กำลังตรวจสอบออเดอร์ใหม่...</div> : newTableOrders.length ? newTableOrders.map((order) => (
              <article className="order-card table-order-card" key={order.id}>
                <div className="order-top"><span>#{order.orderNumber}</span><b>{order.tableName}</b></div>
                <p>{order.items.map((item) => `${item.name} × ${item.quantity}`).join(", ")}</p>
                {order.note && <aside><strong>หมายเหตุ:</strong> {order.note}</aside>}
                <div className="table-order-footer">
                  <strong>฿{money.format(order.total)}</strong>
                  <span className="table-order-actions">
                    <button type="button" className="order-done-button" onClick={() => markOrderDone(order)}><Check /> เสร็จแล้ว</button>
                    <button type="button" onClick={() => openMethodPicker(order.total, `${order.tableName} · #${order.orderNumber}`)}>รับชำระ <ChevronRight /></button>
                  </span>
                </div>
              </article>
            )) : <div className="empty-state"><ClipboardList /><strong>ยังไม่มีออเดอร์ใหม่</strong><p>เมื่อลูกค้าส่งรายการจากลิงก์ประจำโต๊ะ ออเดอร์จะขึ้นที่นี่อัตโนมัติ</p></div>}
          </TabsContent>
          <TabsContent value="done" className="order-stack">
            {doneTableOrders.length ? doneTableOrders.map((order) => (
              <article className="order-card table-order-card done" key={order.id}>
                <div className="order-top"><span>#{order.orderNumber}</span><b>{order.tableName}</b></div>
                <p>{order.items.map((item) => `${item.name} × ${item.quantity}`).join(", ")}</p>
                <div><strong>฿{money.format(order.total)}</strong><small><CheckCircle2 /> เสร็จแล้ว</small></div>
              </article>
            )) : <div className="empty-state"><PackageCheck /><strong>ยังไม่มีออเดอร์ที่เสร็จแล้ว</strong><p>กด “เสร็จแล้ว” ในออเดอร์ใหม่เพื่อย้ายรายการมาที่นี่</p></div>}
          </TabsContent>
        </Tabs>
      </main>
    </>
  );

  const TablesScreen = () => (
    <>
      <Header title="จัดการโต๊ะ" />
      <main className="screen content-screen table-manager-screen">
        <ScreenTitle title="โต๊ะ ลิงก์ และ QR สั่งอาหาร" subtitle="เพิ่มโต๊ะได้ไม่จำกัด แล้วดาวน์โหลดรูป QR เฉพาะของแต่ละโต๊ะได้ทันที" />

        <form className="add-table-panel" onSubmit={createTable}>
          <span><UtensilsCrossed /></span>
          <label><strong>เพิ่มโต๊ะใหม่</strong><input value={newTableName} onChange={(event) => setNewTableName(event.target.value)} maxLength={60} placeholder="เช่น โต๊ะ 9, A01 หรือห้อง VIP" autoComplete="off" /></label>
          <button type="submit" disabled={addingTable}><Plus /> {addingTable ? "กำลังสร้าง..." : "เพิ่มโต๊ะ"}</button>
        </form>

        <section className="table-link-note"><Sparkles /><span><strong>QR รู้หมายเลขโต๊ะอัตโนมัติ</strong><small>ดาวน์โหลดรูปไปพิมพ์ติดโต๊ะได้ ลูกค้าเห็นเฉพาะเมนูสั่งอาหาร</small></span></section>

        <div className="table-list-toolbar">
          <span><strong>โต๊ะทั้งหมด</strong><small>{tables.length} โต๊ะ</small></span>
          {tables.length > 6 && <label><Search /><input value={tableSearch} onChange={(event) => setTableSearch(event.target.value)} placeholder="ค้นหาโต๊ะ" /></label>}
        </div>

        {tablesLoading && !tables.length ? <div className="order-loading"><Sparkles /> กำลังโหลดรายการโต๊ะ...</div> : filteredTables.length ? (
          <div className="table-manager-grid">
            {filteredTables.map((table) => (
              <article className={table.orderCount ? "table-manager-card occupied" : "table-manager-card"} key={table.id}>
                <div className="table-manager-card-head">
                  <span><UtensilsCrossed /></span>
                  <div><strong>{table.name}</strong><small>{table.orderCount ? `${table.orderCount} ออเดอร์ใหม่` : "ว่าง · พร้อมรับออเดอร์"}</small></div>
                  <b>{table.orderCount ? `฿${money.format(table.orderTotal)}` : "พร้อม"}</b>
                </div>
                <code>{tableOrderLink(table)}</code>
                <div className="table-link-actions">
                  <button type="button" className="table-qr-action" onClick={() => openTableQr(table)}><ArrowDownToLine /> ดาวน์โหลด QR ประจำโต๊ะ</button>
                  <button type="button" onClick={() => copyTableLink(table)}><Copy /> คัดลอกลิงก์</button>
                  <a href={`/order/${table.token}`} target="_blank" rel="noreferrer"><ExternalLink /> เปิดหน้าสั่ง</a>
                </div>
                {table.orderCount > 0 && <button type="button" className="table-view-orders" onClick={() => go("orders")}><ClipboardList /><span>ดูออเดอร์ของโต๊ะนี้</span><ChevronRight /></button>}
              </article>
            ))}
          </div>
        ) : <div className="empty-state"><Search /><strong>ไม่พบโต๊ะที่ค้นหา</strong><p>ลองเปลี่ยนคำค้นหา หรือเพิ่มโต๊ะใหม่ด้านบน</p></div>}
      </main>
    </>
  );

  const PosScreen = () => (
    <>
      <Header title="POS" />
      <main className="screen content-screen pos-screen">
        <ScreenTitle title="ขายหน้าร้าน" subtitle="แตะสินค้าเพื่อเพิ่มลงตะกร้า" />
        <button className="product-manager-entry" onClick={() => go("product-manager")}>
          <span><PackagePlus /></span>
          <div><strong>บันทึกรายการอาหาร / สินค้า</strong><small>เพิ่มรูป หมวดหมู่ ชื่อ และราคา</small></div>
          <ChevronRight />
        </button>

        <section className="pos-search-panel" aria-label="ค้นหาสินค้า">
          <div className="pos-search-box">
            <Search aria-hidden="true" />
            <input
              type="search"
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              placeholder="ค้นหาอาหารหรือสินค้า เช่น ข้าวมัน"
              aria-label="ค้นหาอาหารหรือสินค้า"
              autoComplete="off"
              inputMode="search"
            />
            {productSearch && (
              <button type="button" onClick={() => setProductSearch("")} aria-label="ล้างคำค้นหา"><X /></button>
            )}
          </div>
          <p className="pos-search-status" aria-live="polite">
            {productSearch.trim()
              ? <>พบ <strong>{searchMatchedProducts.length}</strong> รายการจากคำว่า “{productSearch.trim()}”</>
              : "ค้นหาได้จากชื่อสินค้า หมวดหมู่ หรือรายละเอียด"}
          </p>
        </section>

        <section className="pos-category-filter" aria-label="เลือกหมวดหมู่สินค้า">
          <div className="pos-category-heading"><span><Grid2X2 /> เลือกหมวดหมู่</span><small>{visibleProducts.length} สินค้า</small></div>
          <div className="pos-category-scroll">
            {["ทั้งหมด", ...availableCategories].map((category) => {
              const count = category === "ทั้งหมด" ? searchMatchedProducts.length : searchMatchedProducts.filter((product) => product.category === category).length;
              return <button type="button" key={category} className={posCategory === category ? "active" : ""} onClick={() => setPosCategory(category)}><span>{category}</span><small>{count}</small></button>;
            })}
          </div>
        </section>

        {visibleProducts.length > 0 ? (
          <div className="product-grid">
            {visibleProducts.map((product) => (
              <button className="product-card" key={product.id} onClick={() => addProduct(product)} aria-label={`เพิ่ม ${product.name} ลงตะกร้า`}>
                <div className="product-card-media">
                  {product.image ? <img src={product.image} alt="" /> : <span className="product-card-placeholder"><PackagePlus /></span>}
                </div>
                <span className="product-add-icon"><Plus /></span>
                <em>{product.category}</em>
                <strong>{product.name}</strong>
                <small>฿{money.format(product.price)}</small>
              </button>
            ))}
          </div>
        ) : (
          <div className="product-empty-state">
            {productSearch.trim() ? <Search /> : <PackagePlus />}
            <strong>
              {productSearch.trim()
                ? searchMatchedProducts.length > 0
                  ? `ไม่พบคำค้นหาในหมวด ${posCategory}`
                  : `ไม่พบเมนู “${productSearch.trim()}”`
                : posCategory === "ทั้งหมด"
                  ? "ยังไม่มีสินค้าที่เปิดขาย"
                  : `ยังไม่มีสินค้าในหมวด ${posCategory}`}
            </strong>
            <p>{productSearch.trim() ? "ลองเปลี่ยนคำค้นหา หรือดูสินค้าจากทุกหมวด" : "เพิ่มสินค้าใหม่แล้วเลือกหมวดนี้ได้ทันที"}</p>
            {productSearch.trim() ? (
              searchMatchedProducts.length > 0
                ? <button type="button" onClick={() => setPosCategory("ทั้งหมด")}><Grid2X2 /> ดูทุกหมวด</button>
                : <button type="button" onClick={() => setProductSearch("")}><X /> ล้างการค้นหา</button>
            ) : (
              <button type="button" onClick={() => go("product-manager")}><Plus /> เพิ่มสินค้า</button>
            )}
          </div>
        )}
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

  const ProductManagerScreen = () => (
    <>
      <Header title="เพิ่มสินค้า" onBack={() => go("pos")} />
      <main className="screen content-screen product-manager-screen">
        <ScreenTitle title="บันทึกรายการอาหาร / สินค้า" subtitle="ข้อมูลที่บันทึกจะแสดงใน POS และลิงก์สั่งอาหารของทุกโต๊ะ" />

        <section className="product-manager-intro">
          <span><Sparkles /></span>
          <div><strong>AI Product Setup</strong><p>เพิ่มข้อมูลให้ครบ เพื่อให้พนักงานเลือกขายได้ง่ายและรวดเร็ว</p></div>
        </section>

        <form className="product-form" ref={productFormRef} onSubmit={submitProduct}>
          <div className="product-form-heading">
            <span><PackagePlus /></span>
            <div><h3>{editingProductId === null ? "เพิ่มรายการใหม่" : "แก้ไขรายการสินค้า"}</h3><p>ช่องที่มีเครื่องหมาย * จำเป็นต้องกรอก</p></div>
          </div>

          <div className="product-photo-section">
            <label className={`product-photo-upload ${productImage ? "has-image" : ""}`}>
              <span className="product-photo-frame">
                {productImage ? <img src={productImage} alt="ตัวอย่างรูปสินค้า" /> : <ImagePlus />}
              </span>
              <span className="product-photo-copy"><strong>{productImage ? "เปลี่ยนรูปสินค้า" : "ใส่รูปสินค้า"}</strong><small>รองรับ JPG, PNG, WebP ไม่เกิน 8 MB</small></span>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleProductImage} hidden />
            </label>
            {productImage && <button type="button" className="remove-product-image" onClick={() => setProductImage(null)}>ลบรูป</button>}
          </div>

          <div className="product-fields-grid">
            <label className="product-field product-field-full">
              <span>ชื่ออาหาร / สินค้า *</span>
              <input value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="เช่น กะเพราไก่ไข่ดาว" maxLength={80} autoComplete="off" />
            </label>

            <div className="product-field product-field-full">
              <span>หมวดหมู่ *</span>
              <div className="product-category-control">
                <Select value={productCategory} onValueChange={setProductCategory}>
                  <SelectTrigger className="product-category-select" aria-label="เลือกหมวดหมู่สินค้า"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {availableCategories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}
                  </SelectContent>
                </Select>
                <button type="button" className="add-category-button" onClick={openCategoryDialog}><Plus /> เพิ่มหมวด</button>
              </div>
            </div>

            <label className="product-field product-field-full">
              <span>ราคาขาย (บาท) *</span>
              <div className="product-price-input"><b>฿</b><input value={productPrice} onChange={(event) => setProductPrice(event.target.value)} placeholder="0.00" inputMode="decimal" min="0" step="0.01" type="number" /></div>
            </label>

            <label className="product-field product-field-full">
              <span>รายละเอียดเพิ่มเติม</span>
              <textarea value={productDescription} onChange={(event) => setProductDescription(event.target.value)} placeholder="เช่น ไม่ใส่ผงชูรส หรือรายละเอียดเมนู" maxLength={180} rows={3} />
            </label>
          </div>

          <div className="product-availability">
            <span><strong>เปิดขายในหน้า POS</strong><small>{productActive ? "ลูกค้าสามารถสั่งรายการนี้ได้ทันที" : "บันทึกไว้ก่อน แต่ยังไม่แสดงในหน้า POS"}</small></span>
            <Switch checked={productActive} onCheckedChange={setProductActive} aria-label="เปิดขายสินค้าในหน้า POS" />
          </div>

          <div className="product-form-actions">
            {editingProductId !== null && <button type="button" className="product-cancel-button" onClick={() => resetProductForm()}>ยกเลิกแก้ไข</button>}
            <button type="submit" className="product-save-button"><Save /> {editingProductId === null ? "บันทึกสินค้า" : "บันทึกการแก้ไข"}</button>
          </div>
        </form>

        <section className="saved-products-section">
          <div className="saved-products-heading"><div><h3>รายการที่บันทึกแล้ว</h3><p>จัดการสินค้าและสถานะเปิดขาย</p></div><span>{catalog.length} รายการ</span></div>
          {catalog.length === 0 ? (
            <div className="saved-products-empty"><PackagePlus /><strong>ยังไม่มีรายการสินค้า</strong><p>กรอกข้อมูลด้านบนแล้วกดบันทึกสินค้า</p></div>
          ) : (
            <div className="saved-products-list">
              {catalog.map((product) => (
                <article className="saved-product-card" key={product.id}>
                  <div className="saved-product-main">
                    <span className="saved-product-image">{product.image ? <img src={product.image} alt="" /> : <PackagePlus />}</span>
                    <div className="saved-product-info"><em>{product.category}</em><strong>{product.name}</strong><small>฿{money.format(product.price)}{product.description ? ` · ${product.description}` : ""}</small></div>
                  </div>
                  <div className="saved-product-controls">
                    <label><span><strong>{product.active ? "เปิดขาย" : "ปิดขาย"}</strong><small>แสดงในหน้า POS</small></span><Switch checked={product.active} onCheckedChange={(checked) => toggleProductActive(product.id, checked)} aria-label={`${product.active ? "ปิด" : "เปิด"}ขาย ${product.name}`} /></label>
                    <div><button type="button" onClick={() => editProduct(product)}><Pencil /> แก้ไข</button><button type="button" className="delete-product-button" onClick={() => deleteProduct(product)}><Trash2 /> ลบ</button></div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <button className="go-to-pos-button" onClick={() => go("pos")}><ShoppingBasket /> ไปหน้าขายสินค้า <ChevronRight /></button>
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
    if (view === "product-manager") return <ProductManagerScreen />;
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

      <Dialog open={tableQrOpen} onOpenChange={(open) => { if (!open) closeTableQr(); }}>
        <DialogContent className="table-qr-dialog" showCloseButton={!tableQrPreview}>
          {selectedQrTable && (tableQrPreview ? (
            <section className="table-qr-save-screen">
              <button type="button" className="table-qr-back" onClick={clearTableQrPreview}><ArrowLeft /> กลับไปดู QR</button>
              <div className="table-qr-ready-icon"><CheckCircle2 /></div>
              <DialogTitle>รูป QR พร้อมบันทึก</DialogTitle>
              <DialogDescription>รูปนี้เป็นลิงก์สั่งอาหารเฉพาะของ {selectedQrTable.name}</DialogDescription>

              <a className="table-qr-save-image" href={tableQrPreview} download={tableQrFileName(selectedQrTable)} aria-label={`ดาวน์โหลดรูป QR ${selectedQrTable.name}`}>
                <img src={tableQrPreview} alt={`QR Code สั่งอาหารประจำ ${selectedQrTable.name}`} />
              </a>

              <div className="table-qr-save-actions">
                <a href={tableQrPreview} download={tableQrFileName(selectedQrTable)}><ArrowDownToLine /> ดาวน์โหลดรูป PNG</a>
                <button type="button" onClick={openTableQrFullScreen}><ExternalLink /> เปิดรูปเต็มจอ</button>
                <button type="button" onClick={shareTableQrImage}><ArrowDownToLine /> บันทึกผ่านมือถือ</button>
              </div>
              <p className="table-qr-line-help"><b>เปิดผ่าน LINE:</b> กด “เปิดรูปเต็มจอ” แล้วแตะรูปค้าง เลือก “บันทึกรูปภาพ”</p>
              <button type="button" className="table-qr-finish" onClick={closeTableQr}>เสร็จแล้ว</button>
            </section>
          ) : (
            <section className="table-qr-create-screen">
              <DialogHeader>
                <span className="table-qr-dialog-icon"><QrCode /></span>
                <DialogTitle>QR สั่งอาหารประจำโต๊ะ</DialogTitle>
                <DialogDescription>ลูกค้าสแกนแล้วเปิดเมนูของโต๊ะนี้โดยอัตโนมัติ</DialogDescription>
              </DialogHeader>

              <div className="table-qr-poster-preview">
                <header><b>ChatPOS</b><small>สแกนเพื่อสั่งอาหาร</small></header>
                <div className="table-qr-poster-body">
                  <small>ลิงก์สั่งอาหารประจำโต๊ะ</small>
                  <h3>{selectedQrTable.name}</h3>
                  <div ref={tableQrImageRef} className="table-qr-code" aria-label={`QR Code สำหรับ ${selectedQrTable.name}`}>
                    <QRCodeSVG
                      value={tableOrderLink(selectedQrTable)}
                      size={280}
                      level="H"
                      marginSize={4}
                      bgColor="#ffffff"
                      fgColor="#062e27"
                      title={`สั่งอาหาร ${selectedQrTable.name}`}
                    />
                  </div>
                  <p>เปิดกล้องแล้วสแกน QR Code</p>
                </div>
              </div>

              <div className="table-qr-create-actions">
                <button type="button" className="table-qr-save-primary" disabled={tableQrGenerating} onClick={saveTableQrImage}>
                  <ArrowDownToLine /> {tableQrGenerating ? "กำลังสร้างรูป..." : "บันทึกรูป QR"}
                </button>
                <button type="button" disabled={tableQrGenerating} onClick={shareTableQrImage}><ArrowDownToLine /> บันทึกผ่านมือถือ</button>
              </div>
              <p className="table-qr-link-label"><ShieldCheck /> QR นี้ใช้ได้เฉพาะ {selectedQrTable.name}</p>
            </section>
          ))}
        </DialogContent>
      </Dialog>

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="category-dialog">
          <DialogHeader>
            <div className="category-dialog-icon"><Plus /></div>
            <DialogTitle>เพิ่มหมวดหมู่ใหม่</DialogTitle>
            <DialogDescription>ตั้งชื่อสั้นๆ ให้พนักงานมองเห็นและเลือกได้ง่าย เช่น อาหารเช้า หรือ เมนูแนะนำ</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitCategory}>
            <label>
              <span>ชื่อหมวดหมู่</span>
              <input value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="เช่น อาหารเช้า" maxLength={40} autoFocus autoComplete="off" />
            </label>
            <div className="category-dialog-actions">
              <button type="button" onClick={() => setCategoryDialogOpen(false)}>ยกเลิก</button>
              <button type="submit"><Plus /> เพิ่มหมวดหมู่</button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Toaster position="top-center" richColors />
    </div>
  );
}
