export type SalesDateRange = {
  start: string;
  end: string;
};

const BRAZIL_TIME_ZONE = "America/Sao_Paulo";

function brazilDateParts(date: Date): {
  year: number;
  month: number;
  day: number;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRAZIL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const read = (type: "year" | "month" | "day") => Number(
    parts.find((part) => part.type === type)?.value,
  );
  return { year: read("year"), month: read("month"), day: read("day") };
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function midnightInBrazil(year: number, month: number, day: number): string {
  // O Brasil nao utiliza horario de verao desde 2019; Sao Paulo permanece em UTC-3.
  return new Date(Date.UTC(year, month - 1, day, 3)).toISOString();
}

export function currentBrazilMonth(now = new Date()): string {
  const { year, month } = brazilDateParts(now);
  return monthKey(year, month);
}

export function normalizeSalesMonth(
  value: string | null | undefined,
  now = new Date(),
): string {
  const currentMonth = currentBrazilMonth(now);
  if (!value) return currentMonth;
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  if (!match) throw new Error("Mes invalido.");
  return value > currentMonth ? currentMonth : value;
}

export function salesMonthRange(month: string): SalesDateRange {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) throw new Error("Mes invalido.");
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const next = new Date(Date.UTC(year, monthNumber, 1));
  return {
    start: midnightInBrazil(year, monthNumber, 1),
    end: midnightInBrazil(next.getUTCFullYear(), next.getUTCMonth() + 1, 1),
  };
}

export function salesTodayRange(now = new Date()): SalesDateRange {
  const { year, month, day } = brazilDateParts(now);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return {
    start: midnightInBrazil(year, month, day),
    end: midnightInBrazil(
      next.getUTCFullYear(),
      next.getUTCMonth() + 1,
      next.getUTCDate(),
    ),
  };
}
