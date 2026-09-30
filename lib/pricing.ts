export type PricePromotion = {
  active: boolean;
  promotionalPrice: number;
  startsAt: string | null;
  endsAt: string | null;
};

export function isPromotionActive(
  promotion: PricePromotion | null | undefined,
  now = new Date(),
): boolean {
  if (!promotion?.active || promotion.promotionalPrice < 0) return false;
  const instant = now.getTime();
  const starts = promotion.startsAt
    ? new Date(promotion.startsAt).getTime()
    : null;
  const ends = promotion.endsAt ? new Date(promotion.endsAt).getTime() : null;
  if (starts !== null && (!Number.isFinite(starts) || instant < starts)) {
    return false;
  }
  if (ends !== null && (!Number.isFinite(ends) || instant > ends)) return false;
  return true;
}

export function effectivePrice(
  basePrice: number,
  promotion: PricePromotion | null | undefined,
  now = new Date(),
): number {
  return isPromotionActive(promotion, now)
    ? Math.min(basePrice, promotion!.promotionalPrice)
    : basePrice;
}

export function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
