import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPendingOrder,
  calculateOrderTotal,
  canTransitionOrder,
  requiresInventoryDeduction,
} from "../lib/order-domain.ts";
import { effectivePrice, isPromotionActive } from "../lib/pricing.ts";
import { adminAuthorization } from "../lib/admin-authorization.ts";
import {
  createAdminSession,
  readAdminSession,
  secretsMatch,
} from "../lib/admin-session.ts";
import { normalizeSalesMonth, salesMonthRange } from "../lib/sales-period.ts";

test("calcula promoção somente dentro do período ativo", () => {
  const now = new Date("2026-07-28T15:00:00.000Z");
  const active = {
    active: true,
    promotionalPrice: 12990,
    startsAt: "2026-07-28T00:00:00.000Z",
    endsAt: "2026-07-29T00:00:00.000Z",
  };
  assert.equal(isPromotionActive(active, now), true);
  assert.equal(effectivePrice(15990, active, now), 12990);
  assert.equal(
    effectivePrice(
      15990,
      { ...active, startsAt: "2026-07-29T01:00:00.000Z" },
      now,
    ),
    15990,
  );
  assert.equal(
    effectivePrice(15990, { ...active, active: false }, now),
    15990,
  );
});

test("cria snapshot pendente com total imutável dos itens", () => {
  const items = [
    { variantId: 1, unitPrice: 12990, quantity: 2 },
    { variantId: 2, unitPrice: 8990, quantity: 1 },
  ];
  assert.equal(calculateOrderTotal(items), 34970);
  assert.deepEqual(
    buildPendingOrder({
      id: "C10-20260728-ABC123",
      customerName: "Cliente",
      items,
    }),
    {
      id: "C10-20260728-ABC123",
      customerName: "Cliente",
      status: "aguardando_confirmacao",
      paymentStatus: "nao_iniciado",
      subtotal: 34970,
      total: 34970,
      inventoryDeductedAt: null,
      items,
    },
  );
});

test("permite apenas transições seguras de pedido", () => {
  assert.equal(
    canTransitionOrder("aguardando_confirmacao", "confirmado"),
    true,
  );
  assert.equal(
    canTransitionOrder("aguardando_confirmacao", "cancelado"),
    true,
  );
  assert.equal(canTransitionOrder("confirmado", "cancelado"), false);
  assert.equal(canTransitionOrder("cancelado", "confirmado"), false);
});

test("planeja a baixa de estoque uma única vez", () => {
  assert.equal(
    requiresInventoryDeduction(
      "aguardando_confirmacao",
      "confirmado",
      null,
    ),
    true,
  );
  assert.equal(
    requiresInventoryDeduction(
      "aguardando_confirmacao",
      "confirmado",
      "2026-07-28T15:00:00.000Z",
    ),
    false,
  );
  assert.equal(
    requiresInventoryDeduction(
      "aguardando_confirmacao",
      "cancelado",
      null,
    ),
    false,
  );
});

test("nega administração sem identidade ou allowlist", () => {
  assert.equal(adminAuthorization(null, "admin@loja.com"), "identity_missing");
  assert.equal(adminAuthorization("admin@loja.com", ""), "allowlist_unset");
  assert.equal(
    adminAuthorization("outra@loja.com", "admin@loja.com"),
    "not_allowed",
  );
  assert.equal(
    adminAuthorization("ADMIN@LOJA.COM", "admin@loja.com"),
    "authorized",
  );
});

test("assina sessão administrativa, rejeita adulteração e expiração", async () => {
  const secret = "chave-de-sessao-segura-com-pelo-menos-trinta-e-dois-caracteres";
  const now = new Date("2026-08-22T12:00:00.000Z").getTime();
  const token = await createAdminSession("Admin@Loja.com", secret, now);
  assert.deepEqual(await readAdminSession(token, secret, now), {
    email: "admin@loja.com",
  });
  assert.equal(await readAdminSession(`${token}x`, secret, now), null);
  assert.equal(await readAdminSession(token, secret, now + 9 * 60 * 60 * 1000), null);
  assert.equal(await secretsMatch("senha-correta", "senha-correta"), true);
  assert.equal(await secretsMatch("senha-correta", "senha-errada"), false);
});

test("rejeita mes invalido e delimita corretamente a competencia mensal", () => {
  const referenceDate = new Date("2026-08-08T15:00:00.000Z");
  assert.throws(
    () => normalizeSalesMonth("2026-13", referenceDate),
    /Mes invalido\./,
  );
  assert.deepEqual(salesMonthRange("2026-08"), {
    start: "2026-08-01T03:00:00.000Z",
    end: "2026-09-01T03:00:00.000Z",
  });
});
