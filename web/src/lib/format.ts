import { format, formatDistanceToNowStrict, isValid, parseISO } from "date-fns";

export const ROLE_LABELS: Record<string, string> = {
  super_admin: "Platform admin",
  school_admin: "School admin",
  principal: "Principal",
  teacher: "Teacher",
  accountant: "Accountant",
  receptionist: "Receptionist",
  librarian: "Librarian",
  hr_manager: "HR manager",
  transport_manager: "Transport manager",
  security_guard: "Security guard",
  staff: "Staff",
  driver: "Driver",
  parent: "Parent",
  student: "Student",
};

export const SCHOOL_ROLES = Object.keys(ROLE_LABELS).filter((r) => r !== "super_admin");

export const roleLabel = (role: string) => ROLE_LABELS[role] ?? role.replace(/_/g, " ");

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

function toDate(v: string | Date | null | undefined) {
  if (!v) return null;
  const d = typeof v === "string" ? parseISO(v) : v;
  return isValid(d) ? d : null;
}

export function formatDate(v: string | Date | null | undefined, pattern = "d MMM yyyy") {
  const d = toDate(v);
  return d ? format(d, pattern) : "—";
}

export function formatDateTime(v: string | Date | null | undefined) {
  return formatDate(v, "d MMM yyyy, h:mm a");
}

export function timeAgo(v: string | Date | null | undefined, now = new Date()) {
  const d = toDate(v);
  if (!d) return "Never";
  if (Math.abs(now.getTime() - d.getTime()) < 45_000) return "just now";
  return `${formatDistanceToNowStrict(d)} ago`;
}

export function formatNumber(n: number, opts: Intl.NumberFormatOptions = {}) {
  return new Intl.NumberFormat("en-IN", opts).format(n);
}

export function formatMoney(n: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
}

/** The name to greet someone by: "Dr. Rajesh Kumar" → "Rajesh" (titles such as Dr., Mr., Mrs., Ms. and Prof. skipped). */
export function firstName(fullName: string) {
  const words = fullName.trim().split(/\s+/);
  const named = words.find((w) => !/^(dr|mr|mrs|ms|miss|prof|sir|smt|shri|sri)\.?$/i.test(w));
  return named ?? words[0] ?? "";
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Whole-rupee amounts in Indian grouping: ₹1,79,990 */
export function inr(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}
