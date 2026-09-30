import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const wrangler = join(root, "node_modules", "wrangler", "bin", "wrangler.js");
const config = join(root, "wrangler.local.jsonc");
const integrationConfig = join(root, "tests", "fixtures", "wrangler.integration.jsonc");
const migration0 = join(root, "drizzle", "0000_aberrant_night_nurse.sql");
const migration1 = join(root, "drizzle", "0001_gigantic_richard_fisk.sql");
const migration2 = join(root, "drizzle", "0002_returns.sql");

function execute(persistTo, options, configPath = config, cwd = root) {
  const args = [
    wrangler,
    "d1",
    "execute",
    "DB",
    "--local",
    "--persist-to",
    persistTo,
    "--config",
    configPath,
    "--cwd",
    root,
    ...options,
  ];
  try {
    return execFileSync(process.execPath, args, {
      cwd,
      encoding: "utf8",
      env: { ...process.env, WRANGLER_WRITE_LOGS: "false" },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw new Error(
      `${error.message}\n${error.stdout ?? ""}\n${error.stderr ?? ""}`,
    );
  }
}

function command(persistTo, sql, configPath = config) {
  return execute(persistTo, ["--command", sql, "--json"], configPath);
}

function query(persistTo, sql) {
  const result = JSON.parse(command(persistTo, sql));
  return result[0]?.results ?? [];
}

test("migrações oficiais cobrem banco zero e upgrade do 0000", () => {
  const zero = mkdtempSync(join(tmpdir(), "camisa10-zero-"));
  const upgrade = mkdtempSync(join(tmpdir(), "camisa10-upgrade-"));
  try {
    execute(zero, ["--file", migration0]);
    execute(zero, ["--file", migration1]);
    execute(zero, ["--file", migration2]);
    assert.deepEqual(
      query(
        zero,
        `SELECT name FROM sqlite_master
         WHERE type='table' AND name IN (
           'audit_log','order_terminal_claims','stock_movements','store_settings',
           'order_returns','order_return_items'
         ) ORDER BY name`,
      ),
      [
        { name: "audit_log" },
        { name: "order_return_items" },
        { name: "order_returns" },
        { name: "order_terminal_claims" },
        { name: "stock_movements" },
        { name: "store_settings" },
      ],
    );
    assert.deepEqual(
      query(zero, "SELECT id, store_name FROM store_settings"),
      [{ id: 1, store_name: "Camisa 10" }],
    );

    execute(upgrade, ["--file", migration0]);
    command(
      upgrade,
      `INSERT INTO categories (id,name,slug) VALUES (1,'Legado','legado');
       INSERT INTO products (
         id,category_id,name,slug,description,base_price,status
       ) VALUES (1,1,'Produto legado','produto-legado','',10000,'published');
       INSERT INTO product_variants (
         id,product_id,size,color,sku,stock,active
       ) VALUES (1,1,'M','Preta','LEGADO-1',7,1);`,
    );
    execute(upgrade, ["--file", migration1]);
    execute(upgrade, ["--file", migration2]);
    assert.deepEqual(
      query(
        upgrade,
        `SELECT p.name, v.sku, v.stock
         FROM products p JOIN product_variants v ON v.product_id=p.id
         WHERE p.id=1`,
      ),
      [{ name: "Produto legado", sku: "LEGADO-1", stock: 7 }],
    );
    assert.deepEqual(
      query(upgrade, "SELECT COUNT(*) AS count FROM stock_movements"),
      [{ count: 0 }],
    );
  } finally {
    rmSync(zero, { recursive: true, force: true });
    rmSync(upgrade, { recursive: true, force: true });
  }
});

async function startIntegrationWorker(persistTo, port) {
  const fixtureRoot = join(root, "tests", "fixtures");
  const child = spawn(
    process.execPath,
    [
      wrangler,
      "dev",
      "--local",
      "--config",
      integrationConfig,
      "--port",
      String(port),
      "--persist-to",
      persistTo,
      "--show-interactive-dev-session=false",
    ],
    {
      cwd: fixtureRoot,
      env: { ...process.env, WRANGLER_WRITE_LOGS: "false" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let logs = "";
  child.stdout.on("data", (chunk) => {
    logs += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk.toString();
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Worker de integração encerrou cedo:\n${logs}`);
    }
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return { child, baseUrl, logs: () => logs };
    } catch {
      // O servidor ainda está inicializando.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  child.kill();
  throw new Error(`Worker de integração não iniciou:\n${logs}`);
}

async function stopIntegrationWorker(child) {
  if (child.exitCode !== null) return;
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill.exe", [
        "/pid",
        String(child.pid),
        "/t",
        "/f",
      ]);
    } catch {
      child.kill();
    }
  } else {
    child.kill("SIGTERM");
  }
  await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    new Promise((resolveDelay) => setTimeout(resolveDelay, 3_000)),
  ]);
}

async function removeTemporaryDirectory(path) {
  let lastError;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      rmSync(path, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    }
  }
  throw lastError;
}

function createIsolatedRouteProject() {
  const sandbox = mkdtempSync(join(tmpdir(), "camisa10-route-"));
  const excluded = new Set([
    "node_modules",
    ".git",
    ".wrangler",
    ".dev.vars",
    "dist",
    ".next",
  ]);
  cpSync(root, sandbox, {
    recursive: true,
    filter(source) {
      const name = source.split(/[\\/]/).at(-1);
      return !excluded.has(name);
    },
  });
  symlinkSync(join(root, "node_modules"), join(sandbox, "node_modules"), "junction");
  writeFileSync(
    join(sandbox, ".dev.vars"),
    "ADMIN_EMAIL_ALLOWLIST=sales-route-test@local.invalid\n",
  );
  return sandbox;
}

async function startRouteApp(projectRoot, port) {
  const childEnvironment = { ...process.env, WRANGLER_WRITE_LOGS: "false" };
  delete childEnvironment.ADMIN_EMAIL_ALLOWLIST;
  delete childEnvironment.NEXT_PUBLIC_STORE_WHATSAPP;
  const child = spawn(
    process.execPath,
    [
      join(root, "node_modules", "vinext", "dist", "cli.js"),
      "dev",
      "--host",
      "::1",
      "--port",
      String(port),
    ],
    {
      cwd: projectRoot,
      env: childEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let logs = "";
  child.stdout.on("data", (chunk) => {
    logs += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk.toString();
  });
  const baseUrl = `http://[::1]:${port}`;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Servidor de rota encerrou cedo:\n${logs}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/admin/sales`);
      if (response.status === 401) return { child, baseUrl, logs: () => logs };
    } catch {
      // O servidor ainda está inicializando.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  child.kill();
  throw new Error(`Servidor de rota não iniciou:\n${logs}`);
}

async function api(baseUrl, path, input) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: input === undefined ? "GET" : "POST",
    headers:
      input === undefined ? undefined : { "Content-Type": "application/json" },
    body: input === undefined ? undefined : JSON.stringify(input),
  });
  return { status: response.status, body: await response.json() };
}

function productInput(slug, sku, stock) {
  return {
    categoryId: null,
    name: `Produto ${slug}`,
    slug,
    description: "",
    basePrice: 10000,
    personalizationEnabled: true,
    personalizationFee: 500,
    featured: false,
    status: "published",
    team: null,
    season: null,
    variants: [
      { size: "M", color: "Preta", sku, stock, active: true },
    ],
  };
}

function orderInput(variantId, items) {
  return {
    customerName: "Cliente",
    customerPhone: "18999999999",
    customerCity: "Cidade",
    deliveryMethod: "Retirada",
    notes: "",
    items:
      items ??
      [
        {
          variantId,
          quantity: 1,
          customName: "",
          customNumber: "",
        },
      ],
  };
}

test("endpoints reais exercitam concorrência, rollback e duplicatas no D1", async () => {
  const persistTo = mkdtempSync(join(tmpdir(), "camisa10-worker-"));
  const port = 8799;
  const worker = await startIntegrationWorker(persistTo, port);
  try {
    const duplicatedProduct = await api(
      worker.baseUrl,
      "/product",
      productInput("duplicadas", "DUP-1", 10),
    );
    assert.equal(duplicatedProduct.status, 200);
    const duplicatedState = await api(
      worker.baseUrl,
      `/state?productId=${duplicatedProduct.body.productId}`,
    );
    const duplicatedVariant = duplicatedState.body.productVariants[0];
    const duplicatedOrder = await api(
      worker.baseUrl,
      "/order",
      orderInput(duplicatedVariant.id, [
        {
          variantId: duplicatedVariant.id,
          quantity: 2,
          customName: "Ana",
          customNumber: "10",
        },
        {
          variantId: duplicatedVariant.id,
          quantity: 3,
          customName: " ana ",
          customNumber: "10",
        },
      ]),
    );
    assert.equal(duplicatedOrder.status, 200);
    assert.equal(duplicatedOrder.body.items.length, 1);
    assert.equal(duplicatedOrder.body.items[0].quantity, 5);

    const [confirm, cancel] = await Promise.all([
      api(worker.baseUrl, "/transition", {
        orderId: duplicatedOrder.body.id,
        status: "confirmado",
      }),
      api(worker.baseUrl, "/transition", {
        orderId: duplicatedOrder.body.id,
        status: "cancelado",
      }),
    ]);
    assert.deepEqual(
      [confirm.status, cancel.status].sort(),
      [200, 400],
    );
    const winner = confirm.status === 200 ? "confirmado" : "cancelado";
    const sameAgain = await api(worker.baseUrl, "/transition", {
      orderId: duplicatedOrder.body.id,
      status: winner,
    });
    assert.equal(sameAgain.status, 200);
    const oppositeAgain = await api(worker.baseUrl, "/transition", {
      orderId: duplicatedOrder.body.id,
      status: winner === "confirmado" ? "cancelado" : "confirmado",
    });
    assert.equal(oppositeAgain.status, 400);
    const terminalState = await api(
      worker.baseUrl,
      `/state?variantId=${duplicatedVariant.id}&orderId=${duplicatedOrder.body.id}`,
    );
    assert.equal(terminalState.body.order.status, winner);
    assert.equal(
      terminalState.body.variant.stock,
      winner === "confirmado" ? 5 : 10,
    );
    assert.equal(
      terminalState.body.movements.filter(
        (movement) => movement.reason === "order_reservation",
      ).length,
      1,
    );
    assert.equal(
      terminalState.body.movements.filter(
        (movement) => movement.reason === "order_cancellation",
      ).length,
      winner === "cancelado" ? 1 : 0,
    );

    const rollbackA = await api(
      worker.baseUrl,
      "/product",
      productInput("rollback-a", "ROLL-A", 5),
    );
    const rollbackB = await api(
      worker.baseUrl,
      "/product",
      productInput("rollback-b", "ROLL-B", 5),
    );
    const rollbackAState = await api(
      worker.baseUrl,
      `/state?productId=${rollbackA.body.productId}`,
    );
    const rollbackVariant = rollbackAState.body.productVariants[0];
    const failedEdit = await api(worker.baseUrl, "/product", {
      ...productInput("rollback-a", "ROLL-A", 5),
      id: rollbackA.body.productId,
      name: "Nome que deve sofrer rollback",
      variants: [
        {
          ...rollbackVariant,
          size: "G",
          color: "Dourada",
          expectedStock: 5,
        },
        {
          size: "P",
          color: "Branca",
          sku: "ROLL-B",
          stock: 2,
          active: true,
        },
      ],
    });
    assert.equal(rollbackB.status, 200);
    assert.equal(failedEdit.status, 400);
    const rollbackAfter = await api(
      worker.baseUrl,
      `/state?productId=${rollbackA.body.productId}`,
    );
    assert.equal(rollbackAfter.body.product.name, "Produto rollback-a");
    assert.equal(rollbackAfter.body.productVariants.length, 1);
    assert.equal(rollbackAfter.body.productVariants[0].id, rollbackVariant.id);
    assert.equal(rollbackAfter.body.productVariants[0].sku, "ROLL-A");

    const raceProduct = await api(
      worker.baseUrl,
      "/product",
      productInput("estoque-race", "RACE-1", 5),
    );
    const raceBefore = await api(
      worker.baseUrl,
      `/state?productId=${raceProduct.body.productId}`,
    );
    const raceVariant = raceBefore.body.productVariants[0];
    const raceOrder = await api(
      worker.baseUrl,
      "/order",
      orderInput(raceVariant.id),
    );
    const [editRace, confirmRace] = await Promise.all([
      api(worker.baseUrl, "/product", {
        ...productInput("estoque-race", "RACE-1", 20),
        id: raceProduct.body.productId,
        variants: [
          {
            ...raceVariant,
            stock: 20,
            expectedStock: 4,
            size: "M",
            color: "Preta",
          },
        ],
      }),
      api(worker.baseUrl, "/transition", {
        orderId: raceOrder.body.id,
        status: "confirmado",
      }),
    ]);
    assert.equal(confirmRace.status, 200);
    assert.equal(editRace.status, 200);
    const raceAfter = await api(
      worker.baseUrl,
      `/state?variantId=${raceVariant.id}&orderId=${raceOrder.body.id}`,
    );
    const raceMovements = raceAfter.body.movements.filter(
      (movement) =>
        movement.reason === "admin_adjustment" ||
        movement.reason === "order_reservation",
    );
    assert.equal(raceAfter.body.variant.stock, 20);
    assert.deepEqual(
      raceMovements.map((movement) => [
        movement.stock_before,
        movement.stock_after,
      ]),
      [
        [5, 4],
        [4, 20],
      ],
    );
  } finally {
    await stopIntegrationWorker(worker.child);
    await removeTemporaryDirectory(persistTo);
  }
});

test("resumo de caixa usa a confirmação da venda e o mês da devolução", async () => {
  const persistTo = mkdtempSync(join(tmpdir(), "camisa10-sales-"));
  const port = 8800;
  try {
    execute(persistTo, ["--file", migration0], integrationConfig);
    execute(persistTo, ["--file", migration1], integrationConfig);
    execute(persistTo, ["--file", migration2], integrationConfig);
    command(
      persistTo,
      `INSERT INTO categories (id, name, slug) VALUES (1, 'Teste', 'teste');
       INSERT INTO products (
         id, category_id, name, slug, description, base_price, status
       ) VALUES (1, 1, 'Camiseta teste', 'camiseta-teste', '', 10000, 'published');
       INSERT INTO product_variants (
         id, product_id, size, color, sku, stock, active
       ) VALUES (1, 1, 'M', 'Preta', 'TESTE-M-PRETA', 20, 1);
       INSERT INTO orders (
         id, customer_name, customer_phone, customer_city, delivery_method,
         notes, status, payment_status, subtotal, total,
         inventory_deducted_at, created_at
       ) VALUES
         ('JULHO-CONFIRMADO', 'Cliente julho', '11999999999', 'Cidade', 'Retirada', '', 'confirmado', 'nao_iniciado', 20000, 20000, '2026-07-10T12:00:00.000Z', '2026-07-09T12:00:00.000Z'),
         ('AGOSTO-CONFIRMADO', 'Cliente agosto', '11999999998', 'Cidade', 'Retirada', '', 'confirmado', 'nao_iniciado', 30000, 30000, '2026-08-02T12:00:00.000Z', '2026-07-31T12:00:00.000Z');
       INSERT INTO order_items (
         id, order_id, product_id, variant_id, product_name, size, color, sku,
         quantity, unit_price, line_total
       ) VALUES
         (1, 'JULHO-CONFIRMADO', 1, 1, 'Camiseta teste', 'M', 'Preta', 'TESTE-M-PRETA', 2, 10000, 20000),
         (2, 'AGOSTO-CONFIRMADO', 1, 1, 'Camiseta teste', 'M', 'Preta', 'TESTE-M-PRETA', 3, 10000, 30000);
       INSERT INTO order_returns (id, order_id, actor, created_at)
       VALUES ('RETORNO-AGOSTO', 'JULHO-CONFIRMADO', 'teste@local', '2026-08-05T12:00:00.000Z');
       INSERT INTO order_return_items (
         return_id, order_item_id, variant_id, quantity, restock_quantity
       ) VALUES ('RETORNO-AGOSTO', 1, 1, 1, 0);`,
      integrationConfig,
    );
    const worker = await startIntegrationWorker(persistTo, port);
    try {
      const july = await api(worker.baseUrl, "/sales?month=2026-07");
      const august = await api(worker.baseUrl, "/sales?month=2026-08");

      assert.equal(july.status, 200, JSON.stringify(july.body));
      assert.equal(july.body.monthSummary.pieces, 2);
      assert.equal(july.body.monthSummary.total, 20000);
      assert.deepEqual(july.body.orders.map((order) => order.id), ["JULHO-CONFIRMADO"]);

      assert.equal(august.status, 200);
      assert.equal(august.body.monthSummary.pieces, 2);
      assert.equal(august.body.monthSummary.total, 20000);
      assert.deepEqual(august.body.orders.map((order) => order.id), ["AGOSTO-CONFIRMADO"]);
    } finally {
      await stopIntegrationWorker(worker.child);
    }
  } finally {
    await removeTemporaryDirectory(persistTo);
  }
});

test("rota real de vendas exige autenticação e valida o mês", async () => {
  const projectRoot = createIsolatedRouteProject();
  const stateDirectory = join(projectRoot, ".wrangler", "state");
  const routeConfig = join(projectRoot, "wrangler.local.jsonc");
  const port = 8801;
  let routeApp;
  try {
    for (const migration of [
      "0000_aberrant_night_nurse.sql",
      "0001_gigantic_richard_fisk.sql",
      "0002_returns.sql",
    ]) {
      execute(
        stateDirectory,
        ["--file", join(projectRoot, "drizzle", migration)],
        routeConfig,
        projectRoot,
      );
    }
    routeApp = await startRouteApp(projectRoot, port);
    const unauthenticated = await fetch(`${routeApp.baseUrl}/api/admin/sales`);
    assert.equal(unauthenticated.status, 401);

    const authenticatedHeaders = {
      "oai-authenticated-user-email": "sales-route-test@local.invalid",
    };
    const invalidMonth = await fetch(
      `${routeApp.baseUrl}/api/admin/sales?month=2026-13`,
      { headers: authenticatedHeaders },
    );
    assert.equal(invalidMonth.status, 400);
    assert.match((await invalidMonth.json()).error, /formato AAAA-MM/);

    const futureMonth = await fetch(
      `${routeApp.baseUrl}/api/admin/sales?month=2099-12`,
      { headers: authenticatedHeaders },
    );
    const futureData = await futureMonth.json();
    assert.equal(futureMonth.status, 200, JSON.stringify(futureData));
    assert.equal(futureData.month, futureData.currentMonth);
  } finally {
    if (routeApp) await stopIntegrationWorker(routeApp.child);
    await removeTemporaryDirectory(projectRoot);
  }
});

test("reserva estoque no pedido, devolve no cancelamento e recria com validação atual", async () => {
  const persistTo = mkdtempSync(join(tmpdir(), "camisa10-reservation-"));
  const port = 8804;
  const worker = await startIntegrationWorker(persistTo, port);
  try {
    const product = await api(
      worker.baseUrl,
      "/product",
      productInput("reserva", "RESERVA-1", 2),
    );
    assert.equal(product.status, 200);
    const initial = await api(worker.baseUrl, `/state?productId=${product.body.productId}`);
    const variant = initial.body.productVariants[0];

    const order = await api(worker.baseUrl, "/order", orderInput(variant.id));
    assert.equal(order.status, 200);
    const afterReservation = await api(worker.baseUrl, `/state?variantId=${variant.id}`);
    assert.equal(afterReservation.body.variant.stock, 1);
    assert.equal(
      afterReservation.body.movements.filter(
        (movement) => movement.reason === "order_reservation",
      ).length,
      1,
    );

    const unavailable = await api(
      worker.baseUrl,
      "/order",
      orderInput(variant.id, [{ variantId: variant.id, quantity: 2, customName: "", customNumber: "" }]),
    );
    assert.equal(unavailable.status, 400);

    const cancelled = await api(worker.baseUrl, "/transition", {
      orderId: order.body.id,
      status: "cancelado",
    });
    assert.equal(cancelled.status, 200);
    const afterCancellation = await api(worker.baseUrl, `/state?variantId=${variant.id}`);
    assert.equal(afterCancellation.body.variant.stock, 2);

    const recreated = await api(worker.baseUrl, "/recreate", { orderId: order.body.id });
    assert.equal(recreated.status, 200);
    assert.notEqual(recreated.body.id, order.body.id);
    const afterRecreation = await api(worker.baseUrl, `/state?variantId=${variant.id}`);
    assert.equal(afterRecreation.body.variant.stock, 1);

    const confirmed = await api(worker.baseUrl, "/transition", {
      orderId: recreated.body.id,
      status: "confirmado",
    });
    assert.equal(confirmed.status, 200);
    const afterConfirmation = await api(worker.baseUrl, `/state?variantId=${variant.id}`);
    assert.equal(afterConfirmation.body.variant.stock, 1);
  } finally {
    await stopIntegrationWorker(worker.child);
    await removeTemporaryDirectory(persistTo);
  }
});
