export type RequestedOrderItem = {
  variantId: number;
  quantity: number;
  customName: string;
  customNumber: string;
};

/**
 * Normaliza linhas idênticas antes de qualquer consulta de estoque.
 * Personalizações diferentes continuam em linhas distintas, mas o chamador
 * ainda deve somar a quantidade por variação para validar a disponibilidade.
 */
export function aggregateOrderItems(
  items: RequestedOrderItem[],
): RequestedOrderItem[] {
  const aggregated = new Map<string, RequestedOrderItem>();
  for (const item of items) {
    const customName = item.customName.trim();
    const customNumber = item.customNumber.trim();
    const key = `${item.variantId}\u0000${customName.toLocaleLowerCase("pt-BR")}\u0000${customNumber}`;
    const current = aggregated.get(key);
    if (current) {
      current.quantity += item.quantity;
      continue;
    }
    aggregated.set(key, { ...item, customName, customNumber });
  }
  return [...aggregated.values()];
}

export function quantityByVariant(
  items: RequestedOrderItem[],
): Map<number, number> {
  const quantities = new Map<number, number>();
  for (const item of items) {
    quantities.set(
      item.variantId,
      (quantities.get(item.variantId) ?? 0) + item.quantity,
    );
  }
  return quantities;
}
