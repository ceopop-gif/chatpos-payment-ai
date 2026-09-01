import { env } from "cloudflare:workers";

type AgentDirectoryEnvironment = {
  CHATPOS_AGENT_DIRECTORY_URL?: string;
  CHATPOS_AGENT_DIRECTORY_API_KEY?: string;
};

export type DirectoryAgent = {
  externalId: string;
  code: string;
  phone: string;
  name: string;
  status: "active" | "inactive";
  note: string;
};

export function normalizeAgentPhone(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.startsWith("66") && digits.length === 11 ? "0" + digits.slice(2) : digits;
}

export function isAgentPhone(value: string) {
  return /^0[689]\d{8}$/.test(value);
}

function text(value: unknown, maxLength: number) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function code(value: unknown) {
  return text(value, 24).toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

export function agentDirectoryConfigured() {
  const values = env as unknown as AgentDirectoryEnvironment;
  return /^https:\/\//i.test(String(values.CHATPOS_AGENT_DIRECTORY_URL ?? "").trim());
}

export async function lookupDirectoryAgent(phone: string): Promise<DirectoryAgent | null> {
  const values = env as unknown as AgentDirectoryEnvironment;
  const endpoint = String(values.CHATPOS_AGENT_DIRECTORY_URL ?? "").trim();
  if (!/^https:\/\//i.test(endpoint)) return null;

  const url = new URL(endpoint);
  url.searchParams.set("phone", phone);
  const apiKey = String(values.CHATPOS_AGENT_DIRECTORY_API_KEY ?? "").trim();
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`AGENT_DIRECTORY_${response.status}`);

  const payload = await response.json() as Record<string, unknown>;
  const candidate = (payload.agent ?? payload.data ?? payload) as Record<string, unknown>;
  const normalizedPhone = normalizeAgentPhone(candidate.phone ?? candidate.mobile ?? candidate.username);
  const name = text(candidate.name ?? candidate.fullName ?? candidate.full_name, 100);
  const externalId = text(candidate.id ?? candidate.agentId ?? candidate.agent_id, 100);
  const agentCode = code(candidate.code ?? candidate.agentCode ?? candidate.agent_code);
  if (normalizedPhone !== phone || name.length < 2 || !externalId || !agentCode) return null;

  return {
    externalId,
    code: agentCode,
    phone: normalizedPhone,
    name,
    status: String(candidate.status).toLowerCase() === "inactive" ? "inactive" : "active",
    note: text(candidate.note ?? candidate.area ?? candidate.team, 500),
  };
}
