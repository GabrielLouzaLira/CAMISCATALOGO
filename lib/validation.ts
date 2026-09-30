export function textValue(
  value: unknown,
  label: string,
  options: { required?: boolean; max?: number } = {},
): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (options.required && !text) throw new Error(`${label} é obrigatório.`);
  if (text.length > (options.max ?? 500)) {
    throw new Error(`${label} excede o tamanho permitido.`);
  }
  return text;
}

export function intValue(
  value: unknown,
  label: string,
  options: { min?: number; max?: number } = {},
): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number)) throw new Error(`${label} deve ser inteiro.`);
  if (number < (options.min ?? 0) || number > (options.max ?? 10_000_000)) {
    throw new Error(`${label} está fora do intervalo permitido.`);
  }
  return number;
}

export function boolValue(value: unknown): boolean {
  return value === true || value === 1 || value === "true";
}

export function slugify(value: string): string {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);
  return slug || `item-${crypto.randomUUID().slice(0, 8)}`;
}

export function optionalIsoDate(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} é inválido.`);
  return date.toISOString();
}
