import type { StoreSettings } from "@/lib/store-types";

export type OperationalStoreSettings = Omit<
  StoreSettings,
  "storeName" | "whatsappNumber"
>;

export const defaultStoreSettings: StoreSettings = {
  storeName: "Camisa 10",
  whatsappNumber: "5518981296009",
  instagramUrl: "https://www.instagram.com/camisa.10____/",
  city: "Martinópolis-SP",
  deliveryOptions: ["Retirada em Martinópolis", "Entrega a combinar"],
  heroEyebrow: "Martinópolis-SP · Loja de camisetas",
  heroTitle: "Camisetas para todos os estilos.",
  heroSubtitle: "Vista o que representa você.",
};

const allowedInstagramHosts = new Set(["instagram.com", "www.instagram.com"]);

export function normalizeInstagramUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      !allowedInstagramHosts.has(url.hostname.toLowerCase()) ||
      url.username ||
      url.password
    ) {
      return null;
    }
    url.hostname = "www.instagram.com";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

const defaultOperationalSettings: OperationalStoreSettings = {
  instagramUrl: defaultStoreSettings.instagramUrl,
  city: defaultStoreSettings.city,
  deliveryOptions: defaultStoreSettings.deliveryOptions,
  heroEyebrow: defaultStoreSettings.heroEyebrow,
  heroTitle: defaultStoreSettings.heroTitle,
  heroSubtitle: defaultStoreSettings.heroSubtitle,
};

function textOrDefault(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function normalizeOperationalSettings(raw: string): OperationalStoreSettings {
  try {
    const value = JSON.parse(raw) as Partial<OperationalStoreSettings>;
    const deliveryOptions = Array.isArray(value.deliveryOptions)
      ? value.deliveryOptions
          .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
          .slice(0, 8)
      : [];
    return {
      instagramUrl:
        typeof value.instagramUrl === "string"
          ? value.instagramUrl.trim()
            ? normalizeInstagramUrl(value.instagramUrl) ?? defaultOperationalSettings.instagramUrl
            : ""
          : defaultOperationalSettings.instagramUrl,
      city: textOrDefault(value.city, defaultOperationalSettings.city),
      deliveryOptions: deliveryOptions.length
        ? deliveryOptions
        : defaultOperationalSettings.deliveryOptions,
      heroEyebrow: textOrDefault(value.heroEyebrow, defaultOperationalSettings.heroEyebrow),
      heroTitle: textOrDefault(value.heroTitle, defaultOperationalSettings.heroTitle),
      heroSubtitle: textOrDefault(value.heroSubtitle, defaultOperationalSettings.heroSubtitle),
    };
  } catch {
    return { ...defaultOperationalSettings };
  }
}

export function normalizeStoreSettingsRow(row: {
  storeName: string | null | undefined;
  whatsappNumber: string | null | undefined;
  operationalText: string | null | undefined;
}): StoreSettings {
  return {
    storeName: textOrDefault(row.storeName, defaultStoreSettings.storeName),
    whatsappNumber: textOrDefault(row.whatsappNumber, defaultStoreSettings.whatsappNumber),
    ...normalizeOperationalSettings(row.operationalText ?? ""),
  };
}
