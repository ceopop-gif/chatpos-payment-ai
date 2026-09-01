export type ProductRiskLevel = "safe" | "medium" | "high" | "critical";

export type ProductRiskResult = {
  level: ProductRiskLevel;
  score: number;
  category: "" | "illegal_drugs" | "illegal_weapons" | "prohibited_goods";
  categoryLabel: string;
  reason: string;
  matchedTerms: string[];
  shouldBlock: boolean;
};

type RiskRule = {
  category: Exclude<ProductRiskResult["category"], "">;
  categoryLabel: string;
  level: Exclude<ProductRiskLevel, "safe">;
  reason: string;
  terms: string[];
};

const riskRules: RiskRule[] = [
  {
    category: "illegal_drugs",
    categoryLabel: "ยาเสพติดและสารผิดกฎหมาย",
    level: "critical",
    reason: "พบคำที่เกี่ยวข้องกับยาเสพติดผิดกฎหมายโดยตรง",
    terms: [
      "ยาบ้า", "ยาไอซ์", "เฮโรอีน", "โคเคน", "เมทแอมเฟตามีน", "ยาอี",
      "crystal meth", "methamphetamine", "heroin", "cocaine", "ecstasy", "fentanyl", "เฟนทานิล",
    ],
  },
  {
    category: "illegal_weapons",
    categoryLabel: "อาวุธและวัตถุระเบิดผิดกฎหมาย",
    level: "critical",
    reason: "พบคำที่เกี่ยวข้องกับอาวุธปืน เครื่องกระสุน หรือวัตถุระเบิด",
    terms: [
      "ปืนเถื่อน", "ปืนไม่มีทะเบียน", "ปืนจริง", "อาวุธปืน", "กระสุนปืน", "เครื่องกระสุน",
      "วัตถุระเบิด", "ลูกระเบิด", "ระเบิดแสวงเครื่อง", "firearm", "ammunition", "grenade", "explosive weapon",
    ],
  },
  {
    category: "illegal_drugs",
    categoryLabel: "ยาเสพติดและสารควบคุม",
    level: "high",
    reason: "พบข้อความที่สื่อถึงการจำหน่ายยาเสพติดหรือสารควบคุม",
    terms: ["ยาเสพติด", "ขายยาเค", "จำหน่ายยาเค", "ketamine for sale", "illegal drug"],
  },
  {
    category: "prohibited_goods",
    categoryLabel: "สินค้าต้องห้าม",
    level: "high",
    reason: "พบข้อความที่เกี่ยวข้องกับสินค้าซึ่งห้ามจำหน่ายผ่านระบบ",
    terms: ["บุหรี่ไฟฟ้า", "น้ำยาบุหรี่ไฟฟ้า", "พอตไฟฟ้า", "vape for sale", "e-cigarette for sale"],
  },
];

const educationalDrugPhrases = [
  "ต่อต้านยาเสพติด", "รณรงค์ต้านยาเสพติด", "รณรงค์ป้องกันยาเสพติด",
  "ป้องกันยาเสพติด", "บำบัดยาเสพติด", "หนังสือยาเสพติด",
];

function normalize(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("th-TH")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value: string) {
  return normalize(value).replace(/[^\p{L}\p{N}]+/gu, "");
}

function includesTerm(text: string, compactText: string, term: string) {
  const normalizedTerm = normalize(term);
  return text.includes(normalizedTerm) || compactText.includes(compact(normalizedTerm));
}

function severityScore(level: ProductRiskLevel) {
  return level === "critical" ? 100 : level === "high" ? 82 : level === "medium" ? 55 : 0;
}

export function scanProductRisk(input: { name?: string; description?: string; category?: string }): ProductRiskResult {
  const text = normalize(`${input.name ?? ""} ${input.category ?? ""} ${input.description ?? ""}`);
  const compactText = compact(text);
  const educationalContext = educationalDrugPhrases.some((phrase) => includesTerm(text, compactText, phrase));
  const matches = riskRules.flatMap((rule) => {
    const terms = rule.terms.filter((term) => includesTerm(text, compactText, term));
    const filteredTerms = educationalContext && rule.level === "high"
      ? terms.filter((term) => normalize(term) !== "ยาเสพติด")
      : terms;
    return filteredTerms.length ? [{ rule, terms: filteredTerms }] : [];
  });

  if (!matches.length) {
    return {
      level: "safe", score: 0, category: "", categoryLabel: "ผ่านการตรวจอัตโนมัติ",
      reason: "ไม่พบข้อความที่เข้าข่ายสินค้าผิดกฎหมายจากกฎความเสี่ยงปัจจุบัน",
      matchedTerms: [], shouldBlock: false,
    };
  }

  const priority: Record<ProductRiskLevel, number> = { safe: 0, medium: 1, high: 2, critical: 3 };
  const primary = [...matches].sort((left, right) => priority[right.rule.level] - priority[left.rule.level])[0];
  const matchedTerms = [...new Set(matches.flatMap((match) => match.terms))];
  return {
    level: primary.rule.level,
    score: severityScore(primary.rule.level),
    category: primary.rule.category,
    categoryLabel: primary.rule.categoryLabel,
    reason: primary.rule.reason,
    matchedTerms,
    shouldBlock: primary.rule.level === "high" || primary.rule.level === "critical",
  };
}

