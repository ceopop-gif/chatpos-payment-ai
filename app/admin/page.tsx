"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import {
  Activity, BadgeCheck, BarChart3, Building2, CalendarDays, CheckCircle2, ChevronRight, CircleDollarSign,
  ClipboardCheck, Clock3, CreditCard, Eye, FileCheck2, Landmark, LayoutDashboard, Lightbulb, Link2, LogOut, Menu, PackageSearch, Phone,
  Plus, QrCode, ReceiptText, RefreshCw, ScanSearch, Search, ShieldAlert, ShieldCheck, ShieldX, Sparkles, Store, Target, TrendingUp, UserCheck, Users, WalletCards, X, XCircle,
} from "lucide-react";

type Tab = "dashboard" | "kyc" | "merchants" | "catalog" | "memberships" | "agents" | "reports";
type AiFocus = "overview" | "kyc" | "payments" | "agents";
type Merchant = {
  id: string; applicationNumber: string; phone: string; name: string; address: string; businessDescription: string;
  agentId: string | null; agentReference: string; agentCode: string | null; agentPhone: string | null; agentName: string | null;
  kycStatus: string; kycNote: string; status: string; createdAt: string; approvedAt: string | null;
  tableCount: number; orderCount: number; orderTotal: number; lastOrderAt: string | null;
};
type Agent = { id: string; code: string; phone: string; name: string; externalId: string | null; source: string; syncedAt: string | null; status: string; note: string; createdAt: string; merchantCount: number; approvedCount: number; orderCount: number; orderTotal: number; lastOrderAt: string | null };
type AgentLookup = {
  found: boolean; source: "local" | "external" | null; externalConfigured: boolean;
  agent?: { id?: string; externalId?: string; code: string; phone: string; name: string; status: string; note: string };
};
type Overview = {
  range: { from: string; to: string; today: string };
  summary: { totalMerchants: number; pendingKyc: number; approvedKyc: number; cancelledKyc: number; unassigned: number; totalAgents: number; todayTransactions: number; todayUsage: number; totalTransactions: number; totalUsage: number; periodTransactions: number; periodUsage: number };
  merchants: Merchant[]; agents: Agent[];
  dailyUsage: Array<{ date: string; transactionCount: number; total: number }>;
  paymentChannels: Array<{ method: string; transactionCount: number; total: number }>;
  reviews: Array<{ id: string; applicationNumber: string; merchantName: string; action: string; previousStatus: string; nextStatus: string; note: string; reviewedBy: string; createdAt: string; agentCode: string | null }>;
};
type CatalogMerchant = {
  id: string; applicationNumber: string; phone: string; name: string; businessDescription: string;
  kycStatus: string; productCount: number; flaggedCount: number;
};
type CatalogProduct = {
  id: string; merchantId: string; localProductId: number; name: string; price: number; category: string;
  description: string; image: string | null; active: boolean; moderationStatus: string; riskLevel: string;
  riskCategory: string; riskReason: string; matchedTerms: string[]; scannedAt: string; updatedAt: string;
  applicationNumber: string; merchantPhone: string; merchantName: string; businessDescription: string;
  agentCode: string | null; agentName: string | null;
};
type ModerationAlert = {
  id: string; merchantId: string; productId: string; localProductId: number; productName: string;
  severity: string; category: string; reason: string; matchedTerms: string[]; status: string;
  reviewedBy: string | null; reviewNote: string; reviewedAt: string | null; createdAt: string; updatedAt: string;
  applicationNumber: string; phone: string; merchantName: string;
};
type CatalogOverview = {
  summary: { totalProducts: number; activeProducts: number; flaggedProducts: number; openAlerts: number };
  merchants: CatalogMerchant[]; products: CatalogProduct[]; alerts: ModerationAlert[]; checkedAt: string;
};
type MembershipMerchant = {
  id: string; applicationNumber: string; phone: string; name: string; businessDescription: string;
  plan: string; status: string; startedAt: string | null; cycleStart: string | null; cycleEnd: string | null;
  quota: number; used: number; remaining: number; usagePercent: number; outstanding: number; balance: number;
  serviceFeesPaid: number; transactionFeesPaid: number; transactionCount: number; transactionTotal: number; lifetimeFreeQuota: number;
};
type MembershipCharge = {
  id: string; merchantId: string; type: string; amount: number; dueDate: string; status: string; description: string;
  paymentSource: string; attemptCount: number; paidAt: string | null; createdAt: string;
  applicationNumber: string; phone: string; merchantName: string;
};
type MembershipOverview = {
  summary: { totalMerchants: number; subscribers: number; standardMerchants: number; pastDue: number; outstanding: number; serviceFeesCollected: number; transactionFeesCollected: number };
  merchants: MembershipMerchant[]; charges: MembershipCharge[]; checkedAt: string;
};

const money = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("th-TH");
const dateTime = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
const dateOnly = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
const paymentMethodMeta: Record<string, { label: string; icon: typeof QrCode; tone: string }> = {
  promptpay: { label: "QR PromptPay", icon: QrCode, tone: "promptpay" },
  visa: { label: "VISA THAI", icon: CreditCard, tone: "visa" },
  truemoney: { label: "TrueMoney", icon: WalletCards, tone: "truemoney" },
  wechat: { label: "WeChat Pay", icon: WalletCards, tone: "wechat" },
  alipay: { label: "Alipay", icon: WalletCards, tone: "alipay" },
  mobile: { label: "Mobile Banking", icon: Landmark, tone: "mobile" },
  shopeepay: { label: "ShopeePay", icon: WalletCards, tone: "shopeepay" },
};

function inputDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00+07:00`);
  value.setDate(value.getDate() + days);
  return inputDate(value);
}
const tabs: Array<{ id: Tab; label: string; icon: typeof Store }> = [
  { id: "dashboard", label: "ภาพรวม", icon: LayoutDashboard }, { id: "kyc", label: "ตรวจ KYC", icon: ClipboardCheck },
  { id: "merchants", label: "ร้านค้า", icon: Store }, { id: "catalog", label: "สินค้า & AI", icon: PackageSearch }, { id: "agents", label: "ตัวแทน", icon: Users },
  { id: "memberships", label: "สมาชิก", icon: CircleDollarSign },
  { id: "reports", label: "รายงาน", icon: BarChart3 },
];

function statusLabel(status: string) {
  return status === "approved" ? "อนุมัติแล้ว" : status === "rejected" ? "ไม่ผ่าน" : status === "suspended" ? "ระงับ" : "รอตรวจ KYC";
}

function StatusPill({ status }: { status: string }) {
  return <span className={`admin-status ${status}`}><i />{statusLabel(status)}</span>;
}

function riskLabel(level: string) {
  return level === "critical" ? "วิกฤต" : level === "high" ? "เสี่ยงสูง" : level === "medium" ? "ตรวจเพิ่ม" : "ผ่าน AI";
}

function riskCategoryLabel(category: string) {
  return category === "illegal_drugs" ? "ยาเสพติด/สารควบคุม" : category === "illegal_weapons" ? "อาวุธผิดกฎหมาย" : category === "prohibited_goods" ? "สินค้าต้องห้าม" : "ไม่พบความเสี่ยง";
}

const aiFocusOptions: Array<{ id: AiFocus; label: string }> = [
  { id: "overview", label: "ภาพรวมวันนี้" },
  { id: "kyc", label: "งาน KYC" },
  { id: "payments", label: "ยอดชำระ" },
  { id: "agents", label: "ตัวแทน" },
];

function buildAiSummary(data: Overview, focus: AiFocus) {
  const topChannel = [...data.paymentChannels].sort((left, right) => right.total - left.total)[0];
  const topChannelLabel = topChannel ? (paymentMethodMeta[topChannel.method]?.label ?? topChannel.method) : "ยังไม่มีข้อมูล";
  const topAgent = [...data.agents].sort((left, right) => right.orderTotal - left.orderTotal)[0];
  const topMerchant = [...data.merchants].sort((left, right) => right.orderTotal - left.orderTotal)[0];
  const busiestDay = [...data.dailyUsage].sort((left, right) => right.total - left.total)[0];
  const averageTicket = data.summary.periodTransactions ? data.summary.periodUsage / data.summary.periodTransactions : 0;
  const approvalRate = data.summary.totalMerchants ? data.summary.approvedKyc / data.summary.totalMerchants * 100 : 0;
  const channelShare = topChannel && data.summary.periodUsage ? topChannel.total / data.summary.periodUsage * 100 : 0;

  if (focus === "kyc") return {
    eyebrow: "AI ตรวจงานที่ต้องดำเนินการ",
    headline: data.summary.pendingKyc ? `มี ${number.format(data.summary.pendingKyc)} ร้านรอการตรวจ KYC` : "งาน KYC ปัจจุบันดำเนินการครบแล้ว",
    description: `ร้านผ่านการอนุมัติแล้ว ${number.format(data.summary.approvedKyc)} ร้าน คิดเป็น ${approvalRate.toFixed(1)}% ของร้านทั้งหมด และมี ${number.format(data.summary.unassigned)} ร้านที่ยังไม่ได้ผูกตัวแทน`,
    signals: [
      { label: "รอตรวจ KYC", value: `${number.format(data.summary.pendingKyc)} ร้าน`, tone: data.summary.pendingKyc ? "warning" : "good" },
      { label: "ยังไม่มีตัวแทน", value: `${number.format(data.summary.unassigned)} ร้าน`, tone: data.summary.unassigned ? "danger" : "good" },
      { label: "อัตราอนุมัติ", value: `${approvalRate.toFixed(1)}%`, tone: "info" },
    ],
    actions: [
      data.summary.unassigned ? `ผูกตัวแทนให้ ${number.format(data.summary.unassigned)} ร้านก่อนอนุมัติ KYC` : "ร้านที่รอตรวจมีตัวแทนครบแล้ว",
      data.summary.pendingKyc ? "เริ่มตรวจจากใบสมัครเก่าสุดเพื่อลดเวลารอของร้าน" : "ติดตามใบสมัครใหม่และรักษาเวลาตรวจให้รวดเร็ว",
      data.summary.cancelledKyc ? `ทบทวนเหตุผลของ ${number.format(data.summary.cancelledKyc)} ร้านที่ไม่ผ่านหรือถูกระงับ` : "ยังไม่มีร้านถูกยกเลิกอนุมัติ",
    ],
  };

  if (focus === "payments") return {
    eyebrow: "AI วิเคราะห์ยอดรับชำระ",
    headline: data.summary.periodUsage ? `ยอดตามช่วงที่เลือก ${money.format(data.summary.periodUsage)}` : "ยังไม่มียอดชำระในช่วงวันที่เลือก",
    description: `${number.format(data.summary.periodTransactions)} รายการ มูลค่าเฉลี่ย ${money.format(averageTicket)} ต่อรายการ ช่องทางหลักคือ ${topChannelLabel}${topChannel ? ` คิดเป็น ${channelShare.toFixed(1)}%` : ""}`,
    signals: [
      { label: "ยอดวันนี้", value: money.format(data.summary.todayUsage), tone: "good" },
      { label: "ยอดเฉลี่ย/รายการ", value: money.format(averageTicket), tone: "info" },
      { label: "ช่องทางอันดับ 1", value: topChannelLabel, tone: "purple" },
    ],
    actions: [
      topChannel ? `รักษาความพร้อมของ ${topChannelLabel} ซึ่งเป็นช่องทางที่ลูกค้าใช้มากที่สุด` : "เริ่มติดตามช่องทางชำระเมื่อมีธุรกรรมแรก",
      busiestDay ? `วันที่มียอดสูงสุดในช่วงนี้คือ ${dateOnly.format(new Date(`${busiestDay.date}T12:00:00+07:00`))} ยอด ${money.format(busiestDay.total)}` : "ยังไม่มีวันที่ที่สามารถเปรียบเทียบยอดได้",
      "ติดตามธุรกรรมผิดปกติและยอดที่เปลี่ยนแปลงมากกว่าปกติทุกวัน",
    ],
  };

  if (focus === "agents") return {
    eyebrow: "AI สรุปผลงานตัวแทน",
    headline: topAgent ? `${topAgent.name} มียอดใช้งานสูงสุด ${money.format(topAgent.orderTotal)}` : "ยังไม่มีข้อมูลผลงานตัวแทน",
    description: `มีตัวแทนในระบบ ${number.format(data.summary.totalAgents)} ราย ดูแลร้านทั้งหมด ${number.format(data.summary.totalMerchants)} ร้าน${topAgent ? ` โดย ${topAgent.code} ดูแล ${number.format(topAgent.merchantCount)} ร้าน` : ""}`,
    signals: [
      { label: "ตัวแทนทั้งหมด", value: `${number.format(data.summary.totalAgents)} ราย`, tone: "info" },
      { label: "ร้านผ่าน KYC", value: `${number.format(data.summary.approvedKyc)} ร้าน`, tone: "good" },
      { label: "ผู้นำยอดใช้งาน", value: topAgent?.code ?? "—", tone: "purple" },
    ],
    actions: [
      topAgent ? `ใช้แนวทางของ ${topAgent.name} เป็นตัวอย่างให้ตัวแทนรายอื่น` : "เชื่อมตัวแทนและเริ่มผูกร้านเพื่อดูผลงาน",
      data.summary.unassigned ? `จัดสรร ${number.format(data.summary.unassigned)} ร้านที่ยังไม่มีตัวแทน` : "ร้านทุกแห่งมีตัวแทนดูแลแล้ว",
      "ตรวจตัวแทนที่มีร้านแต่ยังไม่มียอดใช้งานและวางแผนกระตุ้นร้าน",
    ],
  };

  return {
    eyebrow: "AI Executive Briefing",
    headline: data.summary.todayUsage ? `วันนี้ระบบรับชำระแล้ว ${money.format(data.summary.todayUsage)}` : "วันนี้ยังไม่มียอดรับชำระใหม่",
    description: `ภาพรวมมีร้าน ${number.format(data.summary.totalMerchants)} ร้าน ผ่าน KYC ${number.format(data.summary.approvedKyc)} ร้าน และมี ${number.format(data.summary.pendingKyc)} ร้านรอตรวจ${topMerchant ? ` ร้านที่มียอดสะสมสูงสุดคือ ${topMerchant.name}` : ""}`,
    signals: [
      { label: "ธุรกรรมวันนี้", value: `${number.format(data.summary.todayTransactions)} รายการ`, tone: "good" },
      { label: "รอดำเนินการ", value: `${number.format(data.summary.pendingKyc)} KYC`, tone: data.summary.pendingKyc ? "warning" : "good" },
      { label: "ช่องทางหลัก", value: topChannelLabel, tone: "purple" },
    ],
    actions: [
      data.summary.pendingKyc ? `ตรวจ KYC ที่ค้าง ${number.format(data.summary.pendingKyc)} ร้าน` : "ไม่มีงาน KYC ค้างในขณะนี้",
      data.summary.unassigned ? `ผูกตัวแทนให้ร้านที่ยังไม่มีผู้ดูแล ${number.format(data.summary.unassigned)} ร้าน` : "ร้านทั้งหมดมีตัวแทนดูแลแล้ว",
      topChannel ? `ติดตาม ${topChannelLabel} ซึ่งทำยอดสูงสุดในช่วงที่เลือก` : "รอข้อมูลธุรกรรมเพื่อวิเคราะห์ช่องทางหลัก",
    ],
  };
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [data, setData] = useState<Overview | null>(null);
  const [catalog, setCatalog] = useState<CatalogOverview | null>(null);
  const [memberships, setMemberships] = useState<MembershipOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [workingId, setWorkingId] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<Record<string, string>>({});
  const [agentFormOpen, setAgentFormOpen] = useState(false);
  const [agentForm, setAgentForm] = useState({ name: "", phone: "", code: "", note: "" });
  const [agentLookupPhone, setAgentLookupPhone] = useState("");
  const [agentLookup, setAgentLookup] = useState<AgentLookup | null>(null);
  const [notice, setNotice] = useState("");
  const [dateFrom, setDateFrom] = useState(() => inputDate());
  const [dateTo, setDateTo] = useState(() => inputDate());
  const [aiFocus, setAiFocus] = useState<AiFocus>("overview");
  const [selectedMerchantId, setSelectedMerchantId] = useState("");
  const previousAlertCountRef = useRef<number | null>(null);

  const loadData = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ from: dateFrom, to: dateTo });
      const [response, catalogResponse, membershipResponse] = await Promise.all([
        fetch(`/api/admin/overview?${query}`, { cache: "no-store" }),
        fetch("/api/admin/catalog", { cache: "no-store" }),
        fetch("/api/admin/memberships", { cache: "no-store" }),
      ]);
      if (response.status === 401 || catalogResponse.status === 401 || membershipResponse.status === 401) { window.location.replace("/admin/login"); return; }
      const [payload, catalogPayload, membershipPayload] = await Promise.all([
        response.json() as Promise<Overview & { error?: string }>,
        catalogResponse.json() as Promise<CatalogOverview & { error?: string }>,
        membershipResponse.json() as Promise<MembershipOverview & { error?: string }>,
      ]);
      if (!response.ok) throw new Error(payload.error || "โหลดข้อมูลไม่สำเร็จ");
      if (!catalogResponse.ok) throw new Error(catalogPayload.error || "โหลดข้อมูลสินค้าไม่สำเร็จ");
      if (!membershipResponse.ok) throw new Error(membershipPayload.error || "โหลดข้อมูลสมาชิกไม่สำเร็จ");
      setData(payload);
      setCatalog(catalogPayload);
      setMemberships(membershipPayload);
      previousAlertCountRef.current = catalogPayload.summary.openAlerts;
      document.title = catalogPayload.summary.openAlerts ? `(${catalogPayload.summary.openAlerts}) สินค้าเสี่ยง | ChatPOS` : "ChatPOS Backoffice";
      setSelectedAgents(Object.fromEntries(payload.merchants.map((merchant) => [merchant.id, merchant.agentId ?? ""])));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [dateFrom, dateTo]);

  const refreshCatalog = useCallback(async (notifyNewAlerts = false) => {
    const response = await fetch("/api/admin/catalog", { cache: "no-store" });
    if (response.status === 401) { window.location.replace("/admin/login"); return; }
    const payload = await response.json() as CatalogOverview & { error?: string };
    if (!response.ok) throw new Error(payload.error || "โหลดข้อมูลสินค้าไม่สำเร็จ");
    const previousCount = previousAlertCountRef.current;
    setCatalog(payload);
    previousAlertCountRef.current = payload.summary.openAlerts;
    if (notifyNewAlerts && previousCount !== null && payload.summary.openAlerts > previousCount) {
      const added = payload.summary.openAlerts - previousCount;
      setNotice(`AI แจ้งเตือนด่วน: พบสินค้าเสี่ยงใหม่ ${number.format(added)} รายการ กรุณาเปิดเมนูสินค้า & AI`);
      document.title = `(${payload.summary.openAlerts}) สินค้าเสี่ยง | ChatPOS`;
      if ("vibrate" in navigator) navigator.vibrate([180, 80, 180]);
    } else if (!payload.summary.openAlerts) {
      document.title = "ChatPOS Backoffice";
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshCatalog(true).catch(() => undefined);
    }, 5000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refreshCatalog(true).catch(() => undefined);
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refreshCatalog]);

  const filteredMerchants = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLocaleLowerCase("th-TH");
    return data.merchants.filter((merchant) => !term || `${merchant.name} ${merchant.phone} ${merchant.applicationNumber} ${merchant.agentCode ?? ""} ${merchant.businessDescription}`.toLocaleLowerCase("th-TH").includes(term));
  }, [data, search]);
  const pendingMerchants = useMemo(() => filteredMerchants.filter((merchant) => merchant.kycStatus === "pending"), [filteredMerchants]);
  const filteredMemberships = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("th-TH");
    return memberships?.merchants.filter((merchant) => !term || `${merchant.name} ${merchant.phone} ${merchant.applicationNumber} ${merchant.businessDescription}`.toLocaleLowerCase("th-TH").includes(term)) ?? [];
  }, [memberships, search]);
  const filteredCatalogProducts = useMemo(() => {
    if (!catalog) return [];
    const term = search.trim().toLocaleLowerCase("th-TH");
    return catalog.products.filter((product) => (
      (!selectedMerchantId || product.merchantId === selectedMerchantId)
      && (!term || `${product.name} ${product.category} ${product.description} ${product.merchantName} ${product.merchantPhone} ${product.applicationNumber}`.toLocaleLowerCase("th-TH").includes(term))
    ));
  }, [catalog, search, selectedMerchantId]);
  const activeCatalogAlerts = useMemo(() => (
    catalog?.alerts.filter((alert) => ["open", "acknowledged"].includes(alert.status) && (!selectedMerchantId || alert.merchantId === selectedMerchantId)) ?? []
  ), [catalog, selectedMerchantId]);
  const maxDaily = Math.max(1, ...(data?.dailyUsage.map((item) => item.total) ?? [1]));
  const aiSummary = useMemo(() => data ? buildAiSummary(data, aiFocus) : null, [data, aiFocus]);

  const selectQuickRange = (range: "today" | "7days" | "month") => {
    const today = inputDate();
    setDateTo(today);
    setDateFrom(range === "today" ? today : range === "7days" ? shiftDate(today, -6) : `${today.slice(0, 8)}01`);
  };

  const merchantAction = async (merchant: Merchant, action: string) => {
    const agentId = selectedAgents[merchant.id] || merchant.agentId;
    if ((action === "approve" || action === "bind_agent") && !agentId) {
      setNotice("กรุณาเลือกตัวแทนก่อน ระบบไม่อนุญาตให้อนุมัติ KYC โดยไม่มีตัวแทน"); return;
    }
    setWorkingId(merchant.id + action); setNotice("");
    try {
      const response = await fetch("/api/admin/merchants", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ applicationId: merchant.id, action, agentId, note: action === "approve" ? "ตรวจสอบและอนุมัติโดยผู้ดูแล" : "อัปเดตโดยผู้ดูแล" }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "อัปเดตไม่สำเร็จ");
      setNotice(action === "approve" ? `อนุมัติ KYC ${merchant.name} แล้ว` : action === "reject" ? `บันทึกผลไม่ผ่าน KYC ${merchant.name} แล้ว` : "อัปเดตข้อมูลเรียบร้อยแล้ว");
      await loadData(true);
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "อัปเดตไม่สำเร็จ"); }
    finally { setWorkingId(""); }
  };

  const openMerchantCatalog = (merchantId: string) => {
    setSelectedMerchantId(merchantId);
    setTab("catalog");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const moderationAction = async (product: CatalogProduct, action: "acknowledge" | "approve" | "remove" | "rescan") => {
    const alert = catalog?.alerts.find((item) => item.productId === product.id && ["open", "acknowledged"].includes(item.status));
    const confirmation = action === "approve"
      ? `ยืนยันอนุญาตให้ขาย “${product.name}” แม้ระบบ AI จะแจ้งความเสี่ยง?`
      : action === "remove" ? `ยืนยันปิดการขาย “${product.name}”?` : "";
    if (confirmation && !window.confirm(confirmation)) return;
    setWorkingId(`${product.id}-${action}`); setNotice("");
    try {
      const response = await fetch("/api/admin/catalog", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: product.id, alertId: alert?.id, action,
          note: action === "approve" ? "แอดมินตรวจหลักฐานแล้วและอนุญาตให้ขาย" : action === "remove" ? "ปิดรายการหลังตรวจสอบความเสี่ยง" : "แอดมินรับทราบการแจ้งเตือน",
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "อัปเดตผลตรวจไม่สำเร็จ");
      setNotice(action === "approve" ? `อนุญาตให้ขาย ${product.name} แล้ว` : action === "remove" ? `ปิดรายการ ${product.name} แล้ว` : action === "rescan" ? `AI ตรวจ ${product.name} ใหม่แล้ว` : `รับทราบการแจ้งเตือน ${product.name} แล้ว`);
      await refreshCatalog();
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "อัปเดตผลตรวจไม่สำเร็จ"); }
    finally { setWorkingId(""); }
  };

  const addAgent = async (event: FormEvent) => {
    event.preventDefault(); setWorkingId("new-agent"); setNotice("");
    try {
      const response = await fetch("/api/admin/agents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(agentForm) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "เพิ่มตัวแทนไม่สำเร็จ");
      setAgentForm({ name: "", phone: "", code: "", note: "" }); setAgentLookupPhone(""); setAgentLookup(null); setAgentFormOpen(false); setNotice("เพิ่มตัวแทนใหม่ใน ChatPOS เรียบร้อยแล้ว"); await loadData(true);
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "เพิ่มตัวแทนไม่สำเร็จ"); }
    finally { setWorkingId(""); }
  };

  const lookupAgent = async (event: FormEvent) => {
    event.preventDefault(); setWorkingId("lookup-agent"); setNotice(""); setAgentLookup(null);
    try {
      const response = await fetch(`/api/admin/agents?phone=${encodeURIComponent(agentLookupPhone)}`, { cache: "no-store" });
      const payload = await response.json() as AgentLookup & { error?: string };
      if (!response.ok) throw new Error(payload.error || "ค้นหาตัวแทนไม่สำเร็จ");
      setAgentLookup(payload);
      setAgentForm((form) => ({ ...form, phone: agentLookupPhone }));
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "ค้นหาตัวแทนไม่สำเร็จ"); }
    finally { setWorkingId(""); }
  };

  const connectAgent = async () => {
    setWorkingId("connect-agent"); setNotice("");
    try {
      const response = await fetch("/api/admin/agents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "connect", phone: agentLookupPhone }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "เชื่อมตัวแทนไม่สำเร็จ");
      setAgentLookupPhone(""); setAgentLookup(null); setAgentFormOpen(false); setNotice("เชื่อมข้อมูลตัวแทนจากระบบกลางเรียบร้อยแล้ว"); await loadData(true);
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "เชื่อมตัวแทนไม่สำเร็จ"); }
    finally { setWorkingId(""); }
  };

  const toggleAgentForm = () => {
    setAgentFormOpen((value) => !value); setAgentLookupPhone(""); setAgentLookup(null);
    setAgentForm({ name: "", phone: "", code: "", note: "" });
  };

  const refreshAiSummary = async () => {
    setWorkingId("ai-summary"); setNotice("");
    await loadData(true);
    setNotice("AI วิเคราะห์ข้อมูลล่าสุดและอัปเดตสรุปให้แล้ว");
    setWorkingId("");
  };

  const logout = async () => { try { await fetch("/api/admin/login", { method: "DELETE" }); } finally { window.location.replace("/admin/login"); } };

  if (loading) return <div className="admin-loading"><span><ShieldCheck /></span><strong>กำลังโหลดระบบหลังบ้าน</strong><small>กำลังสรุปร้าน ตัวแทน และยอดใช้งาน...</small></div>;
  if (!data) return <div className="admin-loading admin-failed"><ShieldAlert /><strong>เปิดระบบหลังบ้านไม่ได้</strong><p>{error}</p><button onClick={() => void loadData()}><RefreshCw /> ลองอีกครั้ง</button></div>;

  const rangeLabel = dateFrom === dateTo
    ? dateOnly.format(new Date(`${dateFrom}T12:00:00+07:00`))
    : `${dateOnly.format(new Date(`${dateFrom}T12:00:00+07:00`))} – ${dateOnly.format(new Date(`${dateTo}T12:00:00+07:00`))}`;
  const channelRows = Object.entries(paymentMethodMeta).map(([method, meta]) => {
    const usage = data.paymentChannels.find((item) => item.method === method);
    return { method, ...meta, transactionCount: usage?.transactionCount ?? 0, total: usage?.total ?? 0 };
  });

  const MerchantCard = ({ merchant, compact = false }: { merchant: Merchant; compact?: boolean }) => {
    const merchantCatalog = catalog?.merchants.find((item) => item.id === merchant.id);
    const merchantMembership = memberships?.merchants.find((item) => item.id === merchant.id);
    return <article className={`admin-merchant-card ${compact ? "compact" : ""}`}>
      <header><div className="admin-avatar"><Store /></div><div><strong>{merchant.name}</strong><small>{merchant.applicationNumber} · {merchant.phone}</small></div><StatusPill status={merchant.kycStatus} /></header>
      <div className="admin-merchant-meta"><span><Building2 /> {merchant.businessDescription}</span><span><Link2 /> {merchant.agentName ? `${merchant.agentName} (${merchant.agentCode})` : "ยังไม่ผูกตัวแทน"}</span></div>
      <div className="admin-mini-stats"><span><b>{number.format(merchant.orderCount)}</b><small>ออเดอร์</small></span><span><b>{money.format(merchant.orderTotal)}</b><small>ยอดใช้งาน</small></span><span><b>{number.format(merchant.tableCount)}</b><small>โต๊ะ</small></span></div>
      <button className={`admin-membership-brief ${merchantMembership?.plan === "subscriber" ? "subscriber" : "standard"}`} onClick={() => setTab("memberships")}><CircleDollarSign /><span><strong>{merchantMembership?.plan === "subscriber" ? "ร้านสมาชิก" : "ร้านค่าธรรมเนียมปกติ"}</strong><small>{merchantMembership?.plan === "subscriber" ? `PromptPay ฟรีเหลือ ${money.format(merchantMembership.remaining)}${merchantMembership.outstanding ? ` · ค้าง ${money.format(merchantMembership.outstanding)}` : ""}` : "PromptPay 1.5% · ยังไม่สมัครสมาชิก"}</small></span><ChevronRight /></button>
      <button className={`admin-view-products ${(merchantCatalog?.flaggedCount ?? 0) > 0 ? "has-risk" : ""}`} onClick={() => openMerchantCatalog(merchant.id)}><PackageSearch /><span><strong>ดูสินค้าของร้านนี้</strong><small>{number.format(merchantCatalog?.productCount ?? 0)} รายการ{merchantCatalog?.flaggedCount ? ` · AI เตือน ${number.format(merchantCatalog.flaggedCount)} รายการ` : " · ไม่พบรายการเสี่ยง"}</small></span><ChevronRight /></button>
      {merchant.kycStatus === "pending" && <div className="admin-kyc-actions"><select value={selectedAgents[merchant.id] ?? merchant.agentId ?? ""} onChange={(event) => setSelectedAgents((current) => ({ ...current, [merchant.id]: event.target.value }))}><option value="">เลือกตัวแทนก่อนอนุมัติ</option>{data.agents.filter((agent) => agent.status === "active").map((agent) => <option key={agent.id} value={agent.id}>{agent.code} · {agent.name} · {agent.phone}</option>)}</select><div><button className="bind" disabled={!selectedAgents[merchant.id] || workingId === merchant.id + "bind_agent"} onClick={() => void merchantAction(merchant, "bind_agent")}><Link2 /> ผูกตัวแทน</button><button className="approve" disabled={!selectedAgents[merchant.id] || workingId === merchant.id + "approve"} onClick={() => void merchantAction(merchant, "approve")}><BadgeCheck /> อนุมัติ KYC</button><button className="reject" disabled={workingId === merchant.id + "reject"} onClick={() => void merchantAction(merchant, "reject")}><XCircle /> ไม่ผ่าน</button></div></div>}
    </article>;
  };

  return (
    <div className="admin-app">
      <aside className={menuOpen ? "open" : ""}>
        <header><span><ShieldCheck /></span><div><small>CHATPOS</small><strong>BACKOFFICE</strong></div><button onClick={() => setMenuOpen(false)}><X /></button></header>
        <nav>{tabs.map((item) => { const Icon = item.icon; const badge = item.id === "kyc" ? data.summary.pendingKyc : item.id === "catalog" ? (catalog?.summary.openAlerts ?? 0) : item.id === "memberships" ? (memberships?.summary.pastDue ?? 0) : 0; return <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => { setTab(item.id); setMenuOpen(false); }}><Icon /><span>{item.label}</span>{badge > 0 && <b>{badge}</b>}<ChevronRight /></button>; })}</nav>
        <footer><button onClick={() => void logout()}><LogOut /> ออกจากระบบ</button><small>ChatPOS Control Center</small></footer>
      </aside>
      {menuOpen && <button className="admin-overlay" aria-label="ปิดเมนู" onClick={() => setMenuOpen(false)} />}

      <section className="admin-workspace">
        <header className="admin-topbar"><button className="admin-menu-button" onClick={() => setMenuOpen(true)}><Menu /></button><div><small>ระบบหลังบ้าน ChatPOS</small><h1>{tabs.find((item) => item.id === tab)?.label}</h1></div><div className="admin-top-actions"><label><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาร้าน เบอร์ หรือรหัส..." /></label><button onClick={() => void loadData(true)} className={refreshing ? "spinning" : ""}><RefreshCw /></button></div></header>
        {notice && <div className={`admin-notice ${notice.includes("AI แจ้งเตือนด่วน") ? "urgent" : ""}`}>{notice.includes("AI แจ้งเตือนด่วน") ? <ShieldAlert /> : <CheckCircle2 />}<span>{notice}</span><button onClick={() => setNotice("")}><X /></button></div>}
        {(catalog?.summary.openAlerts ?? 0) > 0 && <button className="admin-live-risk-alert" onClick={() => { setSelectedMerchantId(""); setTab("catalog"); }}><span><ShieldAlert /></span><div><small>AI ตรวจพบสินค้าเสี่ยง</small><strong>{number.format(catalog?.summary.openAlerts ?? 0)} รายการรอแอดมินตรวจทันที</strong></div><ChevronRight /></button>}
        <main>
          {tab === "dashboard" && <>
            <section className="admin-dashboard-title"><div><small>CHATPOS CONTROL CENTER</small><h2>ภาพรวมระบบที่ต้องรู้</h2><p>ตรวจสถานะร้านและยอดรับชำระได้จากหน้าเดียว</p></div><span><Activity /><small>ข้อมูลล่าสุด</small><strong>วันนี้</strong></span></section>

            {aiSummary && <section className="admin-ai-center">
              <header>
                <div className="admin-ai-brand"><span><Sparkles /></span><div><small>CHATPOS AI ANALYST</small><h2>AI ช่วยสรุปหลังบ้าน</h2><p>อ่านข้อมูลจริงและชี้เรื่องสำคัญให้ผู้ดูแล</p></div></div>
                <button disabled={workingId === "ai-summary"} onClick={() => void refreshAiSummary()}><RefreshCw /> {workingId === "ai-summary" ? "กำลังวิเคราะห์..." : "วิเคราะห์ข้อมูลใหม่"}</button>
              </header>
              <nav aria-label="เลือกหัวข้อให้ AI สรุป">{aiFocusOptions.map((option) => <button key={option.id} className={aiFocus === option.id ? "active" : ""} onClick={() => setAiFocus(option.id)}>{option.label}</button>)}</nav>
              <div className="admin-ai-content">
                <article className="admin-ai-answer">
                  <span className="admin-ai-eyebrow"><TrendingUp /> {aiSummary.eyebrow}</span>
                  <h3>{aiSummary.headline}</h3>
                  <p>{aiSummary.description}</p>
                  <div className="admin-ai-signals">{aiSummary.signals.map((signal) => <span className={signal.tone} key={signal.label}><small>{signal.label}</small><strong>{signal.value}</strong></span>)}</div>
                </article>
                <aside className="admin-ai-actions"><header><Lightbulb /><strong>สิ่งที่ควรทำต่อ</strong></header><ol>{aiSummary.actions.map((action, index) => <li key={action}><span>{index + 1}</span><p>{action}</p></li>)}</ol><footer><Target /> สรุปจากข้อมูลปัจจุบันในระบบ</footer></aside>
              </div>
            </section>}

            <section className="admin-status-kpis">
              <article className="approved"><span><BadgeCheck /></span><div><small>ร้านอนุมัติแล้ว</small><strong>{number.format(data.summary.approvedKyc)}</strong><p>ร้านพร้อมใช้งาน</p></div></article>
              <article className="pending"><span><Clock3 /></span><div><small>ร้านรออนุมัติ</small><strong>{number.format(data.summary.pendingKyc)}</strong><p>รอตรวจ KYC</p></div></article>
              <article className="cancelled"><span><XCircle /></span><div><small>ยกเลิกอนุมัติ</small><strong>{number.format(data.summary.cancelledKyc)}</strong><p>ไม่ผ่านหรือระงับ</p></div></article>
            </section>

            <section className="admin-date-filter">
              <header><CalendarDays /><div><strong>เลือกวันที่ดูยอดย้อนหลัง</strong><small>เลือกวันเดียวหรือกำหนดช่วงวันที่ได้</small></div></header>
              <div className="admin-quick-ranges"><button onClick={() => selectQuickRange("today")}>วันนี้</button><button onClick={() => selectQuickRange("7days")}>7 วันล่าสุด</button><button onClick={() => selectQuickRange("month")}>เดือนนี้</button></div>
              <label><span>ตั้งแต่วันที่</span><input type="date" value={dateFrom} max={dateTo} onChange={(event) => setDateFrom(event.target.value)} /></label>
              <label><span>ถึงวันที่</span><input type="date" value={dateTo} min={dateFrom} max={inputDate()} onChange={(event) => setDateTo(event.target.value)} /></label>
              <button className="admin-date-refresh" onClick={() => void loadData(true)}><RefreshCw /> แสดงข้อมูล</button>
            </section>

            <section className="admin-usage-kpis">
              <article className="today"><span><CircleDollarSign /></span><div><small>ยอดใช้ประจำวัน</small><strong>{money.format(data.summary.todayUsage)}</strong><p>{number.format(data.summary.todayTransactions)} รายการวันนี้</p></div></article>
              <article className="period"><span><CalendarDays /></span><div><small>ยอดตามวันที่เลือก</small><strong>{money.format(data.summary.periodUsage)}</strong><p>{number.format(data.summary.periodTransactions)} รายการ · {rangeLabel}</p></div></article>
              <article className="all"><span><BarChart3 /></span><div><small>ยอดใช้ทั้งหมด</small><strong>{money.format(data.summary.totalUsage)}</strong><p>{number.format(data.summary.totalTransactions)} รายการสะสม</p></div></article>
            </section>

            <section className="admin-dashboard-grid payment-overview">
              <article className="admin-panel admin-usage-chart"><header><div><small>ยอดรับชำระตามวันที่เลือก</small><h2>แนวโน้มการใช้งาน</h2><p>{rangeLabel}</p></div><Activity /></header><div className="admin-bars">{data.dailyUsage.length ? data.dailyUsage.map((item) => <div key={item.date} title={`${item.date}: ${money.format(item.total)} · ${item.transactionCount} รายการ`}><span style={{ height: `${Math.max(8, item.total / maxDaily * 100)}%` }} /><b>{money.format(item.total)}</b><small>{item.date.slice(5)}</small></div>) : <p>ยังไม่มีรายการชำระเงินในช่วงวันที่เลือก</p>}</div></article>
              <article className="admin-panel admin-payment-channels"><header><div><small>ช่องทางชำระเงิน</small><h2>ลูกค้าจ่ายผ่านช่องทางใด</h2><p>{rangeLabel}</p></div><CreditCard /></header><div>{channelRows.map((channel) => { const Icon = channel.icon; const share = data.summary.periodUsage > 0 ? channel.total / data.summary.periodUsage * 100 : 0; return <article key={channel.method}><span className={channel.tone}><Icon /></span><div><strong>{channel.label}</strong><small>{number.format(channel.transactionCount)} รายการ · {share.toFixed(1)}%</small><i><b style={{ width: `${share}%` }} /></i></div><strong>{money.format(channel.total)}</strong></article>; })}</div></article>
            </section>

            <section className="admin-dashboard-grid admin-actions-grid"><article className="admin-panel admin-attention"><header><div><small>ต้องดำเนินการ</small><h2>สถานะสำคัญ</h2></div><ShieldAlert /></header><div><button className={(catalog?.summary.openAlerts ?? 0) > 0 ? "risk" : ""} onClick={() => setTab("catalog")}><ShieldX /><span><strong>{catalog?.summary.openAlerts ?? 0} สินค้าเสี่ยงรอตรวจ</strong><small>AI พักรายการและแจ้งเตือนแอดมิน</small></span><ChevronRight /></button><button onClick={() => setTab("kyc")}><Clock3 /><span><strong>{data.summary.pendingKyc} ร้านรอ KYC</strong><small>ตรวจข้อมูลและผูกตัวแทน</small></span><ChevronRight /></button><button onClick={() => setTab("kyc")}><Link2 /><span><strong>{data.summary.unassigned} ร้านไม่มีตัวแทน</strong><small>อนุมัติไม่ได้จนกว่าจะผูกตัวแทน</small></span><ChevronRight /></button><button onClick={() => setTab("agents")}><Users /><span><strong>{data.summary.totalAgents} ตัวแทนในระบบ</strong><small>ตรวจผลงานแยกรายตัวแทน</small></span><ChevronRight /></button></div></article></section>
            <section className="admin-section-heading"><div><small>KYC ล่าสุด</small><h2>ร้านที่รอการตรวจสอบ</h2></div><button onClick={() => setTab("kyc")}>ดูทั้งหมด <ChevronRight /></button></section><section className="admin-card-grid">{pendingMerchants.slice(0, 4).map((merchant) => <MerchantCard key={merchant.id} merchant={merchant} compact />)}{!pendingMerchants.length && <div className="admin-empty"><FileCheck2 /><strong>ไม่มีร้านรอตรวจ KYC</strong><small>รายการใหม่จะแสดงที่นี่อัตโนมัติ</small></div>}</section>
          </>}

          {tab === "kyc" && <><section className="admin-page-intro"><div><small>ขั้นตอนบังคับ</small><h2>ตรวจ KYC และผูกตัวแทน</h2><p>ร้านจะอนุมัติไม่ได้จนกว่าจะเลือกตัวแทนจากเบอร์มือถือหรือรหัสตัวแทน</p></div><span><ShieldCheck /></span></section><section className="admin-card-grid wide">{pendingMerchants.map((merchant) => <MerchantCard key={merchant.id} merchant={merchant} />)}{!pendingMerchants.length && <div className="admin-empty"><BadgeCheck /><strong>ตรวจ KYC ครบแล้ว</strong><small>ยังไม่มีใบสมัครที่รอดำเนินการ</small></div>}</section></>}

          {tab === "merchants" && <><section className="admin-page-intro"><div><small>MERCHANT MANAGEMENT</small><h2>ร้านค้าทั้งหมด</h2><p>ค้นหา ดูสถานะตัวแทน และยอดใช้งานของแต่ละร้าน</p></div><span><Store /></span></section><section className="admin-card-grid wide">{filteredMerchants.map((merchant) => <MerchantCard key={merchant.id} merchant={merchant} />)}{!filteredMerchants.length && <div className="admin-empty"><Search /><strong>ไม่พบร้านค้า</strong><small>ลองค้นหาด้วยชื่อ เบอร์โทร หรือเลขใบสมัคร</small></div>}</section></>}

          {tab === "memberships" && memberships && <>
            <section className="admin-page-intro membership-admin-intro"><div><small>SUBSCRIPTION & FEE CONTROL</small><h2>สมาชิกและโควตาค่าธรรมเนียม</h2><p>ตรวจสถานะสมาชิก ยอด PromptPay ฟรี ยอดเกินโควตา และค่าบริการค้างของทุกร้าน</p></div><button className="admin-primary" onClick={() => void loadData(true)}><RefreshCw /> คำนวณล่าสุด</button></section>
            <section className="admin-membership-kpis">
              <article className="subscriber"><BadgeCheck /><span><small>ร้านสมาชิก</small><strong>{number.format(memberships.summary.subscribers)}</strong><p>จาก {number.format(memberships.summary.totalMerchants)} ร้าน</p></span></article>
              <article><Store /><span><small>ร้านแบบปกติ</small><strong>{number.format(memberships.summary.standardMerchants)}</strong><p>ใช้ค่าธรรมเนียมปกติ</p></span></article>
              <article className="past-due"><Clock3 /><span><small>สมาชิกมียอดค้าง</small><strong>{number.format(memberships.summary.pastDue)}</strong><p>{money.format(memberships.summary.outstanding)}</p></span></article>
              <article className="income"><CircleDollarSign /><span><small>ค่าบริการที่เก็บแล้ว</small><strong>{money.format(memberships.summary.serviceFeesCollected)}</strong><p>ไม่รวมค่าธรรมเนียมรายการ</p></span></article>
            </section>
            <section className="admin-plan-rules">
              <article><header><span><ShieldCheck /></span><div><small>SUBSCRIBER</small><h3>สมาชิก ChatPOS</h3></div><b>290 บาท</b></header><ul><li>ค่าบริการวันละ 10 บาท</li><li>PromptPay 0% ภายใน 30,000 บาท/30 วัน</li><li>ส่วนที่เกินโควตาคิด 1%</li><li>ยอดหักไม่สำเร็จสะสมไปวันถัดไป</li></ul></article>
              <article className="standard"><header><span><Store /></span><div><small>STANDARD</small><h3>ไม่เป็นสมาชิก</h3></div><b>ปกติ</b></header><ul><li>ไม่มีค่าสมัครและค่ารายวัน</li><li>PromptPay คิด 1.5% ทุกรายการ</li><li>VISA 3.25%</li><li>กระเป๋าเงิน 3.00%</li></ul></article>
            </section>
            <section className="admin-membership-directory">
              <header><div><small>MERCHANT MEMBERSHIP</small><h2>สถานะของแต่ละร้าน</h2><p>ตัวเลขโควตาเป็นยอดของรอบ 30 วันปัจจุบัน</p></div><CircleDollarSign /></header>
              <div>{filteredMemberships.map((merchant) => <article key={merchant.id} className={`${merchant.plan} ${merchant.status}`}>
                <header><span><Store /></span><div><strong>{merchant.name}</strong><small>{merchant.applicationNumber} · {merchant.phone}</small></div><b>{merchant.plan === "subscriber" ? (merchant.status === "past_due" ? "สมาชิก · มียอดค้าง" : "สมาชิก") : "ปกติ"}</b></header>
                {merchant.plan === "subscriber" ? <>
                  <div className="admin-quota-row"><span><small>PromptPay ฟรีคงเหลือ</small><strong>{money.format(merchant.remaining)}</strong></span><span><small>ใช้แล้ว</small><strong>{money.format(merchant.used)}</strong></span><span><small>วงเงินรอบนี้</small><strong>{money.format(merchant.quota)}</strong></span></div>
                  <div className="admin-quota-progress"><i style={{ width: `${merchant.usagePercent}%` }} /></div>
                  <p>รอบ {merchant.cycleStart ? dateOnly.format(new Date(`${merchant.cycleStart}T12:00:00+07:00`)) : "—"} ถึง {merchant.cycleEnd ? dateOnly.format(new Date(`${merchant.cycleEnd}T12:00:00+07:00`)) : "—"}</p>
                </> : <p className="admin-standard-note">PromptPay 1.5% · ร้านยังไม่ได้สมัครสมาชิก</p>}
                <footer><span><small>ยอดรับชำระ</small><strong>{money.format(merchant.transactionTotal)}</strong></span><span><small>ค่าธรรมเนียมรายการ</small><strong>{money.format(merchant.transactionFeesPaid)}</strong></span><span><small>ค่าบริการที่หักแล้ว</small><strong>{money.format(merchant.serviceFeesPaid)}</strong></span><span className={merchant.outstanding > 0 ? "danger" : ""}><small>ยอดค้าง</small><strong>{money.format(merchant.outstanding)}</strong></span></footer>
              </article>)}{!filteredMemberships.length && <div className="admin-empty"><Search /><strong>ไม่พบข้อมูลสมาชิก</strong><small>ลองค้นหาด้วยชื่อร้าน เบอร์โทร หรือเลขใบสมัคร</small></div>}</div>
            </section>
            <section className="admin-membership-ledger"><header><ReceiptText /><div><small>SERVICE FEE LEDGER</small><h2>ประวัติการตัดค่าบริการล่าสุด</h2></div></header><div>{memberships.charges.slice(0,100).map((charge) => <article key={charge.id}><span className={charge.status}><ReceiptText /></span><div><strong>{charge.merchantName}</strong><small>{charge.description} · {charge.applicationNumber} · ครบกำหนด {dateOnly.format(new Date(`${charge.dueDate}T12:00:00+07:00`))}</small></div><b>{money.format(charge.amount)}</b><em className={charge.status}>{charge.status === "paid" ? "หักแล้ว" : "ยอดค้าง"}</em></article>)}{!memberships.charges.length && <div className="admin-empty"><ReceiptText /><strong>ยังไม่มีรายการค่าบริการ</strong></div>}</div></section>
          </>}

          {tab === "catalog" && catalog && <>
            <section className="admin-page-intro catalog-intro"><div><small>AI PRODUCT CONTROL CENTER</small><h2>ตรวจร้านและสินค้าทั้งระบบ</h2><p>AI ตรวจชื่อ หมวด และรายละเอียดทุกครั้งที่ร้านบันทึกสินค้า พร้อมพักรายการเสี่ยงและแจ้งแอดมินภายใน 5 วินาที</p></div><button className="admin-primary" onClick={() => void refreshCatalog()}><RefreshCw /> ตรวจข้อมูลล่าสุด</button></section>
            <section className="admin-catalog-kpis">
              <article><PackageSearch /><span><small>สินค้าทั้งหมด</small><strong>{number.format(catalog.summary.totalProducts)}</strong></span></article>
              <article className="active"><CheckCircle2 /><span><small>เปิดขายปกติ</small><strong>{number.format(catalog.summary.activeProducts)}</strong></span></article>
              <article className="flagged"><ShieldX /><span><small>AI พักรายการ</small><strong>{number.format(catalog.summary.flaggedProducts)}</strong></span></article>
              <article className="alerts"><ShieldAlert /><span><small>รอแอดมินตรวจ</small><strong>{number.format(catalog.summary.openAlerts)}</strong></span></article>
            </section>

            {activeCatalogAlerts.length > 0 && <section className="admin-risk-queue">
              <header><span><ShieldAlert /></span><div><small>แจ้งเตือนทันที</small><h2>รายการเสี่ยงที่ต้องตรวจสอบ</h2><p>สินค้าเหล่านี้ถูกปิดการแสดงผลอัตโนมัติแล้ว จนกว่าแอดมินจะอนุมัติ</p></div><b>{number.format(activeCatalogAlerts.length)}</b></header>
              <div>{activeCatalogAlerts.map((alert) => {
                const product = catalog.products.find((item) => item.id === alert.productId);
                if (!product) return null;
                return <article key={alert.id} className={alert.severity}>
                  <span><ShieldX /></span><div><small>{riskLabel(alert.severity)} · {riskCategoryLabel(alert.category)}</small><strong>{alert.productName}</strong><p>{alert.merchantName} · {alert.applicationNumber} · {alert.phone}</p><em>{alert.reason}{alert.matchedTerms.length ? ` · พบคำ: ${alert.matchedTerms.join(", ")}` : ""}</em></div><time>{dateTime.format(new Date(alert.createdAt))}</time>
                  <footer><button disabled={workingId === `${product.id}-acknowledge`} onClick={() => void moderationAction(product, "acknowledge")}><Eye /> รับทราบ</button><button className="approve" disabled={workingId === `${product.id}-approve`} onClick={() => void moderationAction(product, "approve")}><ShieldCheck /> อนุญาตขาย</button><button className="remove" disabled={workingId === `${product.id}-remove`} onClick={() => void moderationAction(product, "remove")}><ShieldX /> ปิดรายการ</button></footer>
                </article>;
              })}</div>
            </section>}

            <section className="admin-catalog-layout">
              <aside className="admin-merchant-directory">
                <header><Store /><div><strong>ร้านที่สมัครเข้ามา</strong><small>เลือกเพื่อดูสินค้าทั้งหมดของร้าน</small></div></header>
                <button className={!selectedMerchantId ? "active" : ""} onClick={() => setSelectedMerchantId("")}><span><Building2 /></span><div><strong>ทุกร้าน</strong><small>{number.format(catalog.summary.totalProducts)} สินค้า</small></div><ChevronRight /></button>
                {catalog.merchants.map((merchant) => <button key={merchant.id} className={selectedMerchantId === merchant.id ? "active" : ""} onClick={() => setSelectedMerchantId(merchant.id)}><span><Store /></span><div><strong>{merchant.name}</strong><small>{merchant.applicationNumber} · {number.format(merchant.productCount)} สินค้า</small></div>{merchant.flaggedCount > 0 ? <b>{merchant.flaggedCount}</b> : <ChevronRight />}</button>)}
              </aside>
              <section className="admin-product-center">
                <header><div><small>PRODUCT CATALOG</small><h2>{selectedMerchantId ? catalog.merchants.find((merchant) => merchant.id === selectedMerchantId)?.name ?? "สินค้าของร้าน" : "สินค้าจากทุกร้าน"}</h2><p>{number.format(filteredCatalogProducts.length)} รายการ · AI ตรวจล่าสุดอัตโนมัติ</p></div><ScanSearch /></header>
                <div className="admin-product-grid">{filteredCatalogProducts.map((product) => <article key={product.id} className={product.moderationStatus === "flagged" ? "flagged" : ""}>
                  <div className="admin-product-image">{product.image ? <Image src={product.image} alt={product.name} width={180} height={130} unoptimized /> : <PackageSearch />}{product.moderationStatus === "flagged" && <span><ShieldAlert /> พักขาย</span>}</div>
                  <div className="admin-product-body"><header><span className={product.moderationStatus === "approved_override" ? "override" : product.riskLevel}>{product.moderationStatus === "approved_override" ? "แอดมินอนุญาต" : riskLabel(product.riskLevel)}</span><small>{product.category}</small></header><h3>{product.name}</h3><p>{product.description || "ไม่มีรายละเอียดเพิ่มเติม"}</p><strong>{money.format(product.price)}</strong><div><small>ร้าน</small><b>{product.merchantName}</b><em>{product.applicationNumber} · {product.merchantPhone}</em></div>{product.riskLevel !== "safe" && <aside><ShieldAlert /><span><strong>{riskCategoryLabel(product.riskCategory)}</strong><small>{product.riskReason}</small>{product.matchedTerms.length > 0 && <em>คำที่พบ: {product.matchedTerms.join(", ")}</em>}</span></aside>}</div>
                  <footer><button disabled={workingId === `${product.id}-rescan`} onClick={() => void moderationAction(product, "rescan")}><ScanSearch /> ตรวจ AI ใหม่</button>{product.moderationStatus === "flagged" && <><button className="approve" disabled={workingId === `${product.id}-approve`} onClick={() => void moderationAction(product, "approve")}><ShieldCheck /> อนุญาต</button><button className="remove" disabled={workingId === `${product.id}-remove`} onClick={() => void moderationAction(product, "remove")}><ShieldX /> ปิดสินค้า</button></>}</footer>
                </article>)}{!filteredCatalogProducts.length && <div className="admin-empty"><PackageSearch /><strong>ร้านนี้ยังไม่มีสินค้า</strong><small>เมื่อร้านเพิ่มสินค้า รายการจะปรากฏที่นี่และถูกตรวจโดย AI อัตโนมัติ</small></div>}</div>
              </section>
            </section>
          </>}

          {tab === "agents" && <>
            <section className="admin-page-intro"><div><small>AGENT MANAGEMENT</small><h2>ตัวแทนในระบบ</h2><p>ค้นหาจากเบอร์มือถือ เชื่อมข้อมูลจากระบบตัวแทนกลาง หรือเพิ่มตัวแทนภายใน ChatPOS</p></div><button className="admin-primary" onClick={toggleAgentForm}><Plus /> เพิ่ม/เชื่อมตัวแทน</button></section>
            {agentFormOpen && <section className="admin-agent-connect">
              <header><span><Users /></span><div><strong>เพิ่มตัวแทนด้วยเบอร์มือถือ</strong><small>ระบบจะตรวจใน ChatPOS ก่อน แล้วค้นต่อจากระบบตัวแทนกลางอัตโนมัติ</small></div></header>
              <form className="admin-agent-lookup" onSubmit={lookupAgent}>
                <label><span>เบอร์มือถือตัวแทน</span><input required inputMode="tel" value={agentLookupPhone} onChange={(event) => { const phone = event.target.value.replace(/\D/g, "").slice(0, 10); setAgentLookupPhone(phone); setAgentLookup(null); }} placeholder="08XXXXXXXX" /></label>
                <button className="admin-primary" disabled={workingId === "lookup-agent"}><Search /> {workingId === "lookup-agent" ? "กำลังค้นหา..." : "ค้นหาตัวแทน"}</button>
              </form>
              {agentLookup?.found && agentLookup.agent && <article className="admin-agent-found"><span><UserCheck /></span><div><small>{agentLookup.source === "external" ? "พบในระบบตัวแทนกลาง" : "มีอยู่ใน ChatPOS แล้ว"}</small><strong>{agentLookup.agent.name}</strong><p>{agentLookup.agent.code} · {agentLookup.agent.phone}</p></div>{agentLookup.source === "external" ? <button className="admin-primary" type="button" disabled={workingId === "connect-agent"} onClick={() => void connectAgent()}><Link2 /> {workingId === "connect-agent" ? "กำลังเชื่อม..." : "เชื่อมเข้าระบบ"}</button> : <b>เชื่อมแล้ว</b>}</article>}
              {agentLookup && !agentLookup.found && <div className="admin-agent-not-found"><ShieldAlert /><div><strong>ยังไม่พบเบอร์นี้</strong><p>{agentLookup.externalConfigured ? "ไม่พบในระบบตัวแทนกลาง คุณสามารถเพิ่มตัวแทนใหม่ใน ChatPOS ได้" : "ระบบตัวแทนกลางยังไม่ได้ตั้งค่า แต่คุณสามารถเพิ่มตัวแทนใหม่ใน ChatPOS ได้ทันที"}</p></div></div>}
              {agentLookup && !agentLookup.found && <form className="admin-agent-form local" onSubmit={addAgent}><header><Plus /><div><strong>เพิ่มตัวแทนใหม่ใน ChatPOS</strong><small>ระบบจะสร้างรหัสตัวแทนให้อัตโนมัติ หากไม่กรอกรหัสเอง</small></div></header><div><label>ชื่อตัวแทน<input required value={agentForm.name} onChange={(event) => setAgentForm((form) => ({ ...form, name: event.target.value }))} placeholder="ชื่อ-นามสกุล หรือชื่อบริษัท" /></label><label>เบอร์มือถือ<input readOnly value={agentForm.phone} /></label><label>รหัสตัวแทน (ไม่บังคับ)<input value={agentForm.code} onChange={(event) => setAgentForm((form) => ({ ...form, code: event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "") }))} placeholder="ปล่อยว่างเพื่อสร้างอัตโนมัติ" /></label><label>หมายเหตุ<input value={agentForm.note} onChange={(event) => setAgentForm((form) => ({ ...form, note: event.target.value }))} placeholder="พื้นที่หรือทีมที่ดูแล" /></label></div><footer><button type="button" onClick={toggleAgentForm}>ยกเลิก</button><button className="admin-primary" disabled={workingId === "new-agent"}><Plus /> {workingId === "new-agent" ? "กำลังบันทึก..." : "เพิ่มตัวแทนใหม่"}</button></footer></form>}
            </section>}
            <section className="admin-agent-grid">{data.agents.map((agent) => <article key={agent.id}><header><span><UserCheck /></span><div><strong>{agent.name}</strong><small>{agent.code} · {agent.phone}</small></div><b className={agent.status}>{agent.status === "active" ? "ใช้งาน" : "ปิด"}</b></header><div><span><strong>{number.format(agent.merchantCount)}</strong><small>ร้านทั้งหมด</small></span><span><strong>{number.format(agent.approvedCount)}</strong><small>KYC ผ่าน</small></span><span><strong>{number.format(agent.orderCount)}</strong><small>ออเดอร์</small></span><span><strong>{money.format(agent.orderTotal)}</strong><small>ยอดใช้งาน</small></span></div><p><Phone /> {agent.phone}<span>•</span><b className={`agent-source ${agent.source}`}>{agent.source === "external" ? "ระบบกลาง" : "เพิ่มใน ChatPOS"}</b><span>•</span>{agent.lastOrderAt ? `ล่าสุด ${dateTime.format(new Date(agent.lastOrderAt))}` : "ยังไม่มียอดใช้งาน"}</p></article>)}{!data.agents.length && <div className="admin-empty"><Users /><strong>ยังไม่มีตัวแทน</strong><small>กด “เพิ่ม/เชื่อมตัวแทน” แล้วกรอกเบอร์มือถือเพื่อเริ่มต้น</small></div>}</section>
          </>}

          {tab === "reports" && <><section className="admin-page-intro"><div><small>PERFORMANCE REPORT</small><h2>สรุปผลงานแยกตัวแทน</h2><p>เปรียบเทียบจำนวนร้าน KYC ออเดอร์ และยอดใช้งาน</p></div><span><BarChart3 /></span></section><div className="admin-report-table"><table><thead><tr><th>ตัวแทน</th><th>ร้านทั้งหมด</th><th>KYC ผ่าน</th><th>ออเดอร์</th><th>ยอดใช้งาน</th><th>ใช้งานล่าสุด</th></tr></thead><tbody>{data.agents.map((agent) => <tr key={agent.id}><td><strong>{agent.name}</strong><small>{agent.code} · {agent.phone}</small></td><td>{number.format(agent.merchantCount)}</td><td>{number.format(agent.approvedCount)}</td><td>{number.format(agent.orderCount)}</td><td><b>{money.format(agent.orderTotal)}</b></td><td>{agent.lastOrderAt ? dateTime.format(new Date(agent.lastOrderAt)) : "—"}</td></tr>)}</tbody></table>{!data.agents.length && <div className="admin-empty"><BarChart3 /><strong>ยังไม่มีข้อมูลตัวแทน</strong></div>}</div><section className="admin-audit"><header><FileCheck2 /><div><small>AUDIT LOG</small><h2>ประวัติการตรวจ KYC</h2></div></header>{data.reviews.map((review) => <article key={review.id}><span className={review.nextStatus}><FileCheck2 /></span><div><strong>{review.merchantName} · {review.applicationNumber}</strong><small>{review.action} · {review.agentCode ?? "ไม่ระบุตัวแทน"} · โดย {review.reviewedBy}</small></div><time>{dateTime.format(new Date(review.createdAt))}</time></article>)}{!data.reviews.length && <div className="admin-empty"><FileCheck2 /><strong>ยังไม่มีประวัติการตรวจ</strong></div>}</section></>}
        </main>
      </section>
    </div>
  );
}
