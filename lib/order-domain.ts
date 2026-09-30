import type { OrderStatus } from "./store-types";

export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  aguardando_confirmacao: ["confirmado", "cancelado"],
  confirmado: [],
  cancelado: [],
};

export function canTransitionOrder(
  current: OrderStatus,
  next: OrderStatus,
): boolean {
  return current === next || ORDER_TRANSITIONS[current].includes(next);
}

export function requiresInventoryDeduction(
  current: OrderStatus,
  next: OrderStatus,
  inventoryDeductedAt: string | null,
): boolean {
  return (
    current === "aguardando_confirmacao" &&
    next === "confirmado" &&
    inventoryDeductedAt === null
  );
}

export function calculateOrderTotal(
  items: Array<{ unitPrice: number; quantity: number }>,
): number {
  return items.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
}

export function buildPendingOrder<T extends { unitPrice: number; quantity: number }>(
  input: {
    id: string;
    customerName: string;
    items: T[];
  },
) {
  const total = calculateOrderTotal(input.items);
  return {
    id: input.id,
    customerName: input.customerName,
    status: "aguardando_confirmacao" as const,
    paymentStatus: "nao_iniciado" as const,
    subtotal: total,
    total,
    inventoryDeductedAt: null,
    items: input.items,
  };
}
