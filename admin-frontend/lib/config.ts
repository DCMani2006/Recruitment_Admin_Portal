export const IS_MOCK =
  process.env.NEXT_PUBLIC_USE_MOCK !== "false";

export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.BACKEND_URL ||
  "http://localhost:5000";

// Endpoints have landed on both mock and real backend
export const SLOT_DELETE_SUPPORTED = true;
export const FORM_EDIT_SUPPORTED = true;
export const TEAM_LIST_SUPPORTED = true;

// Round 2 maximum marks
export const REVIEW2_MAX = 10;

// Timezone standard for TAM
export const TIMEZONE = "Asia/Kolkata";

/**
 * Format date as "26 Oct 2026" (or "Today" / "Tomorrow" if useRelative is true).
 * Always in Asia/Kolkata timezone. Never MM/DD/YYYY.
 */
export function formatDate(dateInput: string | Date | number, useRelative = false): string {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return "";

  if (useRelative) {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const dParts = formatter.formatToParts(d);
    const nowParts = formatter.formatToParts(now);

    const dStr = `${dParts.find((p) => p.type === "year")?.value}-${dParts.find((p) => p.type === "month")?.value}-${dParts.find((p) => p.type === "day")?.value}`;
    const nowStr = `${nowParts.find((p) => p.type === "year")?.value}-${nowParts.find((p) => p.type === "month")?.value}-${nowParts.find((p) => p.type === "day")?.value}`;

    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomParts = formatter.formatToParts(tomorrow);
    const tomStr = `${tomParts.find((p) => p.type === "year")?.value}-${tomParts.find((p) => p.type === "month")?.value}-${tomParts.find((p) => p.type === "day")?.value}`;

    if (dStr === nowStr) return "Today";
    if (dStr === tomStr) return "Tomorrow";
  }

  const day = d.toLocaleDateString("en-GB", { timeZone: TIMEZONE, day: "numeric" });
  const month = d.toLocaleDateString("en-GB", { timeZone: TIMEZONE, month: "short" });
  const year = d.toLocaleDateString("en-GB", { timeZone: TIMEZONE, year: "numeric" });
  return `${day} ${month} ${year}`;
}

/**
 * Format time as "2:00 PM IST".
 * Always in Asia/Kolkata timezone.
 */
export function formatTime(dateInput: string | Date | number): string {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return "";

  const timeStr = d.toLocaleTimeString("en-US", {
    timeZone: TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${timeStr} IST`;
}

/**
 * Format date-and-time as "26 Oct 2026, 2:00 PM IST" (or "Today, 2:00 PM IST").
 */
export function formatDateTime(dateInput: string | Date | number, useRelative = false): string {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return "";

  const datePart = formatDate(d, useRelative);
  const timePart = formatTime(d);
  return `${datePart}, ${timePart}`;
}
