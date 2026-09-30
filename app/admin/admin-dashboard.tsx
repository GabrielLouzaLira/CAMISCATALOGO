"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import {
  FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { formatMoney } from "@/lib/pricing";
import type {
  AdminData,
  Category,
  OrderStatus,
  Product,
  ProductStatus,
  StoreSettings,
  StoreOrder,
} from "@/lib/store-types";

type Tab = "overview" | "products" | "categories" | "orders" | "sales" | "settings";
type CategoryDraft = Omit<Category, "id"> & { id?: number };
type OrdersPage = { orders: StoreOrder[]; hasMore: boolean };
type SalesTotals = { pieces: number; total: number };
type SalesData = {
  month: string;
  currentMonth: string;
  today: SalesTotals;
  monthSummary: SalesTotals;
  orders: StoreOrder[];
  hasMore: boolean;
};

function formatSalesMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function changeSalesMonth(month: string, amount: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

type ProductDraft = {
  id?: number;
  categoryId: number | null;
  name: string;
  description: string;
  basePrice: string;
  personalizationEnabled: boolean;
  personalizationFee: string;
  featured: boolean;
  status: ProductStatus;
  team: string;
  season: string;
  variants: Array<{
    id?: number;
    expectedStock?: number;
    size: string;
    color: string;
    sku: string;
    stock: number;
    active: boolean;
  }>;
  promotion: {
    name: string;
    promotionalPrice: string;
    startsAt: string;
    endsAt: string;
    active: boolean;
  };
};

const emptyProduct: ProductDraft = {
  categoryId: null,
  name: "",
  description: "",
  basePrice: "",
  personalizationEnabled: false,
  personalizationFee: "0",
  featured: false,
  status: "draft",
  team: "",
  season: "",
  variants: [{ size: "", color: "", sku: "", stock: 0, active: true }],
  promotion: {
    name: "",
    promotionalPrice: "",
    startsAt: "",
    endsAt: "",
    active: false,
  },
};

function reaisToCents(value: string): number {
  const normalized = value.replace(",", ".");
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < 0) return -1;
  return Math.round(number * 100);
}

function centsToReais(value: number): string {
  return (value / 100).toFixed(2).replace(".", ",");
}

function formatOrderDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function toLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function productToDraft(product: Product): ProductDraft {
  return {
    id: product.id,
    categoryId: product.categoryId,
    name: product.name,
    description: product.description,
    basePrice: centsToReais(product.basePrice),
    personalizationEnabled: product.personalizationEnabled,
    personalizationFee: centsToReais(product.personalizationFee),
    featured: product.featured,
    status: product.status,
    team: product.team ?? "",
    season: product.season ?? "",
    variants: product.variants.map((variant) => ({
      id: variant.id,
      expectedStock: variant.stock,
      size: variant.size,
      color: variant.color,
      sku: variant.sku,
      stock: variant.stock,
      active: variant.active,
    })),
    promotion: {
      name: product.promotion?.name ?? "",
      promotionalPrice: product.promotion
        ? centsToReais(product.promotion.promotionalPrice)
        : "",
      startsAt: toLocalInput(product.promotion?.startsAt ?? null),
      endsAt: toLocalInput(product.promotion?.endsAt ?? null),
      active: product.promotion?.active ?? false,
    },
  };
}

async function api<T = unknown>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, init);
  const responseText = await response.text();
  let result: T & { error?: string } = {} as T & { error?: string };
  try {
    result = JSON.parse(responseText) as T & { error?: string };
  } catch {
    // Respostas de infraestrutura podem não estar em JSON.
  }
  if (!response.ok) {
    if (response.status === 413) {
      throw new Error("O envio ultrapassou o limite de 10 MB.");
    }
    throw new Error(result.error || "Não foi possível concluir a operação.");
  }
  return result;
}

function AccessibleModal({
  labelledBy,
  onClose,
  className,
  children,
}: {
  labelledBy: string;
  onClose: () => void;
  className: string;
  children: ReactNode;
}) {
  const modalRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const modal = modalRef.current;
    if (!modal) return;
    const modalElement = modal;
    const focusableSelector =
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
    const initial =
      modalElement.querySelector<HTMLElement>("[data-autofocus]") ??
      modalElement.querySelector<HTMLElement>(focusableSelector) ??
      modalElement;
    initial.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [
        ...modalElement.querySelectorAll<HTMLElement>(focusableSelector),
      ].filter((element) => element.offsetParent !== null);
      if (!focusable.length) {
        event.preventDefault();
        modalElement.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <div
      ref={modalRef}
      className={className}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      tabIndex={-1}
    >
      {children}
    </div>
  );
}

export default function AdminDashboard({
  initialData,
  user,
  signOutUrl,
}: {
  initialData: AdminData;
  user: { displayName: string; email: string };
  signOutUrl: string;
}) {
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState<Tab>("overview");
  const [editor, setEditor] = useState<ProductDraft | null>(null);
  const [categoryEditor, setCategoryEditor] = useState<CategoryDraft | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<StoreSettings>(initialData.settings);
  const [productSearch, setProductSearch] = useState("");
  const [productCategory, setProductCategory] = useState("all");
  const [productStatus, setProductStatus] = useState("all");
  const [visibleProductCount, setVisibleProductCount] = useState(12);
  const [orders, setOrders] = useState(initialData.orders);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatus, setOrderStatus] = useState<"all" | OrderStatus>("all");
  const [hasMoreOrders, setHasMoreOrders] = useState(false);
  const [ordersBusy, setOrdersBusy] = useState(false);
  const ordersRequest = useRef(0);
  const [salesData, setSalesData] = useState<SalesData | null>(null);
  const [salesMonth, setSalesMonth] = useState<string | null>(null);
  const [salesBusy, setSalesBusy] = useState(false);
  const [orderAction, setOrderAction] = useState<{ order: StoreOrder; status: "confirmado" | "cancelado" } | null>(null);
  const [returnOrder, setReturnOrder] = useState<StoreOrder | null>(null);
  const [returnDraft, setReturnDraft] = useState<Record<number, { quantity: number; restock: boolean }>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    const next = await api<AdminData>("/api/admin/catalog");
    setData(next);
    setSettingsDraft(next.settings);
  }

  async function loadOrders(reset: boolean) {
    const requestId = ++ordersRequest.current;
    setOrdersBusy(true);
    try {
      const params = new URLSearchParams({
        search: orderSearch,
        offset: String(reset ? 0 : orders.length),
      });
      if (orderStatus !== "all") params.set("status", orderStatus);
      const result = await api<OrdersPage>(`/api/admin/orders?${params}`);
      if (requestId !== ordersRequest.current) return;
      setOrders((current) => (reset ? result.orders : [...current, ...result.orders]));
      setHasMoreOrders(result.hasMore);
    } catch (caught) {
      if (requestId === ordersRequest.current) {
        setError(caught instanceof Error ? caught.message : "Não foi possível carregar pedidos.");
      }
    } finally {
      if (requestId === ordersRequest.current) setOrdersBusy(false);
    }
  }

  async function loadSales() {
    setSalesBusy(true);
    try {
      const query = salesMonth ? `?month=${encodeURIComponent(salesMonth)}` : "";
      setSalesData(await api<SalesData>(`/api/admin/sales${query}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível carregar vendas.");
    } finally {
      setSalesBusy(false);
    }
  }

  useEffect(() => {
    if (tab !== "orders") return;
    const timer = window.setTimeout(() => void loadOrders(true), 250);
    return () => window.clearTimeout(timer);
  }, [tab, orderSearch, orderStatus]);

  useEffect(() => {
    if (tab === "sales") void loadSales();
  }, [tab, salesMonth]);

  const filteredProducts = useMemo(() => {
    const term = productSearch.trim().toLocaleLowerCase("pt-BR");
    return data.allProducts.filter((product) => {
      const searchable = `${product.name} ${product.categoryName ?? ""} ${product.team ?? ""} ${product.variants.map((variant) => variant.sku).join(" ")}`.toLocaleLowerCase("pt-BR");
      return (!term || searchable.includes(term)) &&
        (productCategory === "all" || product.categoryId === Number(productCategory)) &&
        (productStatus === "all" || product.status === productStatus);
    });
  }, [data.allProducts, productCategory, productSearch, productStatus]);

  const stockAttention = useMemo(
    () =>
      data.allProducts.flatMap((product) =>
        product.status === "archived"
          ? []
          : (() => {
              const variants = product.variants.filter(
                (variant) => variant.active && variant.stock <= 3,
              );
              return variants.length ? [{ product, variants }] : [];
            })(),
      ),
    [data.allProducts],
  );

  function feedback(ok: string) {
    setMessage(ok);
    setError("");
    window.setTimeout(() => setMessage(""), 3000);
  }

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
      feedback(success);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ocorreu um erro.");
    } finally {
      setBusy(false);
    }
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryEditor) return;
    await run(async () => {
      await api("/api/admin/categories", {
        method: categoryEditor.id !== undefined ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(categoryEditor),
      });
      setCategoryEditor(null);
    }, "Categoria salva.");
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const basePrice = reaisToCents(editor.basePrice);
    const personalizationFee = reaisToCents(editor.personalizationFee);
    if (basePrice < 0 || personalizationFee < 0) {
      setError("Confira os valores informados.");
      return;
    }
    await run(async () => {
      const result = await api<{ productId: number }>("/api/admin/products", {
        method: editor.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editor,
          basePrice,
          personalizationFee,
        }),
      });
      const productId = editor.id ?? result.productId;
      if (editor.promotion.promotionalPrice) {
        const promotionalPrice = reaisToCents(
          editor.promotion.promotionalPrice,
        );
        if (promotionalPrice < 0) throw new Error("Preço promocional inválido.");
        await api("/api/admin/promotions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId,
            ...editor.promotion,
            promotionalPrice,
          }),
        });
      } else if (editor.id && editor.promotion.active) {
        throw new Error("Informe o preço da promoção.");
      }
      setEditor(null);
    }, "Produto salvo.");
  }

  async function changeOrder(order: StoreOrder, status: "confirmado" | "cancelado") {
    setOrderAction({ order, status });
  }

  async function confirmOrderAction() {
    if (!orderAction) return;
    const { order, status } = orderAction;
    await run(async () => {
      await api("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, status }),
      });
    }, status === "confirmado" ? "Pedido confirmado." : "Pedido cancelado.");
    await loadOrders(true);
    setOrderAction(null);
  }

  async function recreateCancelledOrder(order: StoreOrder) {
    if (!window.confirm("Criar um novo pedido com estes itens e reservar o estoque por uma hora?")) {
      return;
    }
    await run(async () => {
      await api("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "recreate", orderId: order.id }),
      });
    }, "Novo pedido criado com estoque reservado por uma hora.");
    await loadOrders(true);
  }

  async function submitReturn() {
    if (!returnOrder) return;
    await run(async () => {
      await api("/api/admin/orders", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "return", orderId: returnOrder.id, items: returnOrder.items.map((item) => ({ orderItemId: item.id, quantity: returnDraft[item.id]?.quantity ?? 0, restock: returnDraft[item.id]?.restock ?? false })) }),
      });
    }, "Devolução registrada.");
    await loadOrders(true);
    void loadSales();
    setReturnOrder(null);
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!window.confirm("Deseja realmente salvar as alterações das configurações?")) {
      return;
    }
    await run(async () => {
      await api("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsDraft),
      });
    }, "Configurações da loja salvas.");
  }

  function cancelSettingsChanges() {
    const hasChanges =
      JSON.stringify(settingsDraft) !== JSON.stringify(data.settings);
    if (
      hasChanges &&
      !window.confirm("Descartar as alterações feitas nas configurações?")
    ) {
      return;
    }
    setSettingsDraft(structuredClone(data.settings));
    setError("");
    setMessage("");
  }

  async function archiveProduct(product: Product) {
    if (
      !window.confirm(
        `Arquivar "${product.name}"? Ele deixará de aparecer na loja.`,
      )
    )
      return;
    const draft = productToDraft(product);
    await run(async () => {
      await api("/api/admin/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          basePrice: product.basePrice,
          personalizationFee: product.personalizationFee,
          status: "archived",
        }),
      });
    }, "Produto arquivado.");
  }

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="brand" href="/">
          <span>10</span>
          <strong>CAMISA 10</strong>
        </Link>
        <p>Gestão da loja</p>
        <nav aria-label="Seções do painel">
          {(
            [
              ["overview", "Visão geral"],
              ["products", "Produtos"],
              ["categories", "Categorias"],
              ["orders", "Pedidos"],
              ["sales", "Vendas"],
              ["settings", "Configurações"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={tab === value ? "active" : ""}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="admin-account">
          <strong>{user.displayName}</strong>
          <small>{user.email}</small>
          <a href={signOutUrl}>Sair</a>
        </div>
      </aside>

      <section className="admin-content">
        <header className="admin-topbar">
          <div>
            <p className="eyebrow">Painel administrativo</p>
            <h1>
              {tab === "overview" && "Visão geral"}
              {tab === "products" && "Produtos"}
              {tab === "categories" && "Categorias"}
              {tab === "orders" && "Pedidos"}
              {tab === "sales" && "Vendas"}
              {tab === "settings" && "Configurações"}
            </h1>
          </div>
          <Link className="button button-outline" href="/" target="_blank">
            Ver loja ↗
          </Link>
        </header>
        {message && <div className="admin-alert success">{message}</div>}
        {error && <div className="admin-alert error">{error}</div>}

        {tab === "overview" && (
          <>
            <div className="metric-grid">
              <article>
                <span>Produtos ativos</span>
                <strong>{data.metrics.products}</strong>
              </article>
              <article>
                <span>Pedidos aguardando</span>
                <strong>{data.metrics.pendingOrders}</strong>
              </article>
              <article>
                <span>Variações esgotadas</span>
                <strong>{data.metrics.soldOut}</strong>
              </article>
              <article>
                <span>Variações com estoque baixo</span>
                <strong>{data.metrics.lowStock}</strong>
              </article>
            </div>
            <div className="admin-panel">
              <div className="admin-panel-title">
                <div>
                  <p className="eyebrow">Atenção</p>
                  <h2>Atenção ao estoque</h2>
                </div>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setTab("products")}
                >
                  Gerenciar produtos →
                </button>
              </div>
              <div className="simple-list">
                {stockAttention.map(({ product, variants }) => (
                    <div key={product.id}>
                      <div className="stock-attention-product">
                        <strong>{product.name}</strong>
                        <div className="stock-attention-variants">
                          {variants.slice(0, 2).map((variant) => (
                            <span
                              key={variant.id}
                              className={
                                variant.stock === 0
                                  ? "stock-status sold-out"
                                  : "stock-status low"
                              }
                            >
                              {variant.size || "Sem tamanho"} · {variant.color || "Sem cor"}: {" "}
                              {variant.stock === 0
                                ? "esgotado"
                                : `${variant.stock} un.`}
                            </span>
                          ))}
                          {variants.length > 2 && (
                            <span>+ {variants.length - 2} variações</span>
                          )}
                        </div>
                      </div>
                      <div className="stock-attention-actions">
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => {
                            setTab("products");
                            setEditor(productToDraft(product));
                          }}
                        >
                          Editar
                        </button>
                      </div>
                    </div>
                  ))}
                {!stockAttention.length && <p>Nenhuma variação precisa de reposição.</p>}
              </div>
            </div>
          </>
        )}

        {tab === "products" && (
          <div className="admin-panel">
            <div className="admin-panel-title">
              <div>
                <p className="eyebrow">Conteúdo da loja</p>
                <h2>Produtos</h2>
              </div>
              <button
                className="button button-gold"
                type="button"
                onClick={() =>
                  setEditor(structuredClone(emptyProduct) as ProductDraft)
                }
              >
                + Novo produto
              </button>
            </div>
            <div className="admin-filter-bar">
              <input aria-label="Buscar produto" placeholder="Buscar produto" value={productSearch} onChange={(event) => { setProductSearch(event.target.value); setVisibleProductCount(12); }} />
              <select aria-label="Filtrar por categoria" value={productCategory} onChange={(event) => { setProductCategory(event.target.value); setVisibleProductCount(12); }}>
                <option value="all">Todas as categorias</option>
                {data.allCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <select aria-label="Filtrar por status" value={productStatus} onChange={(event) => { setProductStatus(event.target.value); setVisibleProductCount(12); }}>
                <option value="all">Todos os status</option><option value="published">Publicado</option><option value="draft">Rascunho</option><option value="archived">Arquivado</option>
              </select>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Status</th>
                    <th>Preço</th>
                    <th>Estoque</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.slice(0, visibleProductCount).map((product) => (
                    <tr key={product.id}>
                      <td>
                        <div className="admin-product-name">
                          <div className="admin-thumb">
                            {product.images[0] ? (
                              <img
                                src={product.images[0].url}
                                alt=""
                                loading="lazy"
                              />
                            ) : (
                              "10"
                            )}
                          </div>
                          <div>
                            <strong>{product.name}</strong>
                            <small>{product.categoryName || "Sem categoria"}</small>
                            {product.images.length > 1 && (
                              <small className="admin-image-count">
                                + {product.images.length - 1} foto(s)
                              </small>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`status-pill ${product.status}`}>
                          {product.status === "published"
                            ? "Publicado"
                            : product.status === "draft"
                              ? "Rascunho"
                              : "Arquivado"}
                        </span>
                      </td>
                      <td>{formatMoney(product.effectivePrice)}</td>
                      <td>
                        <div className="stock-cell">
                          <strong>{product.totalStock}</strong>
                          {product.status !== "archived" &&
                            product.variants.some(
                              (variant) => variant.active && variant.stock === 0,
                            ) && (
                              <span className="stock-alert sold-out">
                                Variação esgotada
                              </span>
                            )}
                          {product.status !== "archived" &&
                            product.variants.some(
                              (variant) =>
                                variant.active &&
                                variant.stock > 0 &&
                                variant.stock <= 3,
                            ) && (
                              <span className="stock-alert low">
                                Variação com estoque baixo
                              </span>
                            )}
                        </div>
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            type="button"
                            onClick={() => setEditor(productToDraft(product))}
                          >
                            Editar
                          </button>
                          {product.status !== "archived" && (
                            <button
                              type="button"
                              className="danger"
                              onClick={() => archiveProduct(product)}
                            >
                              Arquivar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filteredProducts.length && (
                <div className="admin-empty">
                  <h3>{data.allProducts.length ? "Nenhum produto encontrado" : "Cadastre o primeiro produto"}</h3>
                  <p>
                    Produtos só aparecem na loja depois que você os publica.
                  </p>
                </div>
              )}
              {filteredProducts.length > visibleProductCount && (
                <button className="button button-outline" type="button" onClick={() => setVisibleProductCount((count) => count + 12)}>Carregar mais produtos</button>
              )}
            </div>
          </div>
        )}

        {tab === "categories" && (
          <div className="admin-panel">
            <div className="admin-panel-title">
              <div>
                <p className="eyebrow">Organização flexível</p>
                <h2>Categorias</h2>
              </div>
              <button
                className="button button-gold"
                type="button"
                onClick={() =>
                  setCategoryEditor({
                    name: "",
                    slug: "",
                    sortOrder: data.allCategories.length,
                    active: true,
                  })
                }
              >
                + Nova categoria
              </button>
            </div>
            <div className="category-admin-list">
              {data.allCategories.map((item) => (
                <article key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <small>
                      Ordem {item.sortOrder} ·{" "}
                      {item.active ? "Ativa" : "Desativada"}
                    </small>
                  </div>
                  <div className="table-actions">
                    <button type="button" onClick={() => setCategoryEditor(item)}>
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        run(
                          async () =>
                            void (await api("/api/admin/categories", {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                ...item,
                                active: !item.active,
                              }),
                            })),
                          item.active
                            ? "Categoria desativada."
                            : "Categoria ativada.",
                        )
                      }
                    >
                      {item.active ? "Desativar" : "Ativar"}
                    </button>
                  </div>
                </article>
              ))}
              {!data.allCategories.length && (
                <div className="admin-empty">
                  <h3>Nenhuma categoria</h3>
                  <p>Crie categorias de acordo com os produtos da loja.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "orders" && (
          <div className="admin-panel">
            <div className="admin-panel-title">
              <div>
                <p className="eyebrow">Atendimento pelo WhatsApp</p>
                <h2>Pedidos</h2>
              </div>
            </div>
            <div className="order-filter-bar">
              <input aria-label="Buscar pedido" placeholder="Buscar por nome, telefone ou pedido" value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} />
              <select aria-label="Filtrar pedidos por status" value={orderStatus} onChange={(event) => setOrderStatus(event.target.value as "all" | OrderStatus)}>
                <option value="all">Todos os status</option>
                <option value="aguardando_confirmacao">Aguardando confirmação</option>
                <option value="confirmado">Confirmado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
            <div className="order-list">
              {orders.map((order) => (
                <article className="order-card" key={order.id}>
                  <div className="order-heading">
                    <div>
                      <span className={`status-pill ${order.status}`}>
                        {order.status.replaceAll("_", " ")}
                      </span>
                      <h3>{order.id}</h3>
                      <p>
                        {order.customerName} · {order.customerPhone} ·{" "}
                        {order.customerCity}
                      </p>
                      <p className="order-date">Criado em {formatOrderDate(order.createdAt)}</p>
                    </div>
                    <strong>{formatMoney(order.total)}</strong>
                  </div>
                  <div className="order-items">
                    {order.items.map((item) => (
                      <div key={item.id}>
                        <span>
                          {item.quantity}× {item.productName} · {item.size} ·{" "}
                          {item.color}
                          {(item.customName || item.customNumber) && (
                            <small className="order-customization">
                              Personalização: {item.customName || "sem nome"}
                              {item.customNumber ? ` · nº ${item.customNumber}` : ""}
                            </small>
                          )}
                        </span>
                        <strong>{formatMoney(item.lineTotal)}</strong>
                      </div>
                    ))}
                  </div>
                  <p>
                    Entrega: {order.deliveryMethod}
                    {order.notes ? ` · ${order.notes}` : ""}
                  </p>
                  {order.status === "aguardando_confirmacao" && order.reservationExpiresAt && (
                    <p className="order-date">
                      Estoque reservado até {formatOrderDate(order.reservationExpiresAt)}
                    </p>
                  )}
                  {order.status === "aguardando_confirmacao" && (
                    <div className="order-actions">
                      <button
                        className="button button-gold"
                        type="button"
                        disabled={busy}
                        onClick={() => changeOrder(order, "confirmado")}
                      >
                        Confirmar pedido
                      </button>
                      <button
                        className="button button-outline danger"
                        type="button"
                        disabled={busy}
                        onClick={() => changeOrder(order, "cancelado")}
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                  {order.status === "confirmado" && (
                    <div className="order-actions">
                      <button className="button button-outline" type="button" disabled={busy} onClick={() => { setReturnOrder(order); setReturnDraft({}); }}>
                        Registrar devolução
                      </button>
                    </div>
                  )}
                  {order.status === "cancelado" && (
                    <div className="order-actions">
                      <button
                        className="button button-outline"
                        type="button"
                        disabled={busy}
                        onClick={() => void recreateCancelledOrder(order)}
                      >
                        Criar novo pedido com estes itens
                      </button>
                    </div>
                  )}
                </article>
              ))}
              {!orders.length && !ordersBusy && (
                <div className="admin-empty">
                  <h3>{orderSearch || orderStatus !== "all" ? "Nenhum pedido encontrado" : "Nenhum pedido recebido"}</h3>
                  <p>{orderSearch || orderStatus !== "all" ? "Tente mudar a busca ou o filtro." : "Pedidos criados na loja aparecerão aqui."}</p>
                </div>
              )}
            </div>
            {hasMoreOrders && (
              <button className="button button-outline" type="button" disabled={ordersBusy} onClick={() => void loadOrders(false)}>
                {ordersBusy ? "Carregando…" : "Carregar mais pedidos"}
              </button>
            )}
          </div>
        )}
        {tab === "sales" && (
          <div className="admin-panel">
            <div className="admin-panel-title">
              <div>
                <p className="eyebrow">Vendas líquidas</p>
                <h2>Resumo de caixa</h2>
              </div>
            </div>
            <section className="sales-period" aria-label="Mês do resumo de caixa">
              <button
                className="button button-outline sales-period-button"
                type="button"
                disabled={salesBusy || !salesData}
                onClick={() => salesData && setSalesMonth(changeSalesMonth(salesData.month, -1))}
                aria-label="Ver mês anterior"
              >
                ←
              </button>
              <strong>{salesData ? formatSalesMonth(salesData.month) : "Carregando mês…"}</strong>
              <button
                className="button button-outline sales-period-button"
                type="button"
                disabled={salesBusy || !salesData || salesData.month >= salesData.currentMonth}
                onClick={() => salesData && setSalesMonth(changeSalesMonth(salesData.month, 1))}
                aria-label="Ver próximo mês"
              >
                →
              </button>
            </section>
            <p className="sales-period-note">Use as setas para consultar os meses anteriores. O mês atual é exibido primeiro.</p>
            <h3 className="sales-section-heading">Vendas de hoje</h3>
            <div className="sales-summary-grid">
              <article>
                <span>Peças vendidas hoje</span>
                <strong>{salesData?.today.pieces ?? 0}</strong>
              </article>
              <article>
                <span>Total líquido de hoje</span>
                <strong>{formatMoney(salesData?.today.total ?? 0)}</strong>
              </article>
            </div>
            <h3 className="sales-section-heading">Resumo de {salesData ? formatSalesMonth(salesData.month) : "mês"}</h3>
            <div className="sales-summary-grid">
              <article>
                <span>Peças vendidas no mês</span>
                <strong>{salesData?.monthSummary.pieces ?? 0}</strong>
              </article>
              <article>
                <span>Total líquido do mês</span>
                <strong>{formatMoney(salesData?.monthSummary.total ?? 0)}</strong>
              </article>
            </div>
            <div className="admin-panel-title sales-history-title">
              <div><p className="eyebrow">Pedidos confirmados</p><h3>Histórico de {salesData ? formatSalesMonth(salesData.month) : "vendas"}</h3></div>
            </div>
            {salesBusy && <p>Carregando vendas…</p>}
            {!salesBusy && salesData?.orders.length === 0 && (
              <div className="admin-empty"><h3>Nenhuma venda confirmada</h3><p>As vendas aparecerão aqui depois que um pedido for confirmado.</p></div>
            )}
            <div className="order-list">
              {salesData?.orders.map((order) => (
                <article className="order-card" key={order.id}>
                  <div className="order-heading">
                    <div>
                      <span className="status-pill confirmado">Confirmado</span>
                      <h3>{order.id}</h3>
                      <p>{order.customerName} · Confirmado em {formatOrderDate(order.inventoryDeductedAt ?? order.createdAt)}</p>
                    </div>
                    <strong>{formatMoney(order.total)}</strong>
                  </div>
                  <div className="order-items">
                    {order.items.map((item) => (
                      <div key={item.id}>
                        <span>
                          {item.quantity}× {item.productName} · {item.size} · {item.color}
                          {(item.customName || item.customNumber) && (
                            <small className="order-customization">
                              Personalização: {item.customName || "sem nome"}{item.customNumber ? ` · nº ${item.customNumber}` : ""}
                            </small>
                          )}
                        </span>
                        <strong>{formatMoney(item.lineTotal)}</strong>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
        {tab === "settings" && (
          <form className="admin-panel settings-form" onSubmit={saveSettings}>
            <div className="admin-panel-title"><div><p className="eyebrow">Dados públicos da loja</p><h2>Configurações</h2></div></div>
            <div className="admin-form-grid">
              <label><span>Nome da loja</span><input required value={settingsDraft.storeName} onChange={(event) => setSettingsDraft({ ...settingsDraft, storeName: event.target.value })} /></label>
              <label><span>WhatsApp</span><input required inputMode="tel" value={settingsDraft.whatsappNumber} onChange={(event) => setSettingsDraft({ ...settingsDraft, whatsappNumber: event.target.value })} /></label>
              <label><span>Instagram</span><input type="url" value={settingsDraft.instagramUrl} onChange={(event) => setSettingsDraft({ ...settingsDraft, instagramUrl: event.target.value })} /></label>
              <label><span>Cidade</span><input required value={settingsDraft.city} onChange={(event) => setSettingsDraft({ ...settingsDraft, city: event.target.value })} /></label>
              <label className="wide"><span>Texto superior</span><input required value={settingsDraft.heroEyebrow} onChange={(event) => setSettingsDraft({ ...settingsDraft, heroEyebrow: event.target.value })} /></label>
              <label className="wide"><span>Título principal</span><input required value={settingsDraft.heroTitle} onChange={(event) => setSettingsDraft({ ...settingsDraft, heroTitle: event.target.value })} /></label>
              <label className="wide"><span>Subtítulo</span><input required value={settingsDraft.heroSubtitle} onChange={(event) => setSettingsDraft({ ...settingsDraft, heroSubtitle: event.target.value })} /></label>
              <label className="wide"><span>Opções de entrega (uma por linha)</span><textarea required value={settingsDraft.deliveryOptions.join("\n")} onChange={(event) => setSettingsDraft({ ...settingsDraft, deliveryOptions: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} /></label>
            </div>
            <div className="modal-actions">
              <button
                className="button button-outline"
                type="button"
                disabled={busy}
                onClick={cancelSettingsChanges}
              >
                Cancelar alterações
              </button>
              <button className="button button-gold" disabled={busy}>{busy ? "Salvando…" : "Salvar configurações"}</button>
            </div>
          </form>
        )}
      </section>

      {orderAction && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Confirmar ação do pedido">
          <div className="modal-card order-confirmation">
            <p className="eyebrow">Confirmar ação</p>
            <h2>{orderAction.status === "confirmado" ? "Confirmar pedido?" : "Cancelar pedido?"}</h2>
            <p>{orderAction.status === "confirmado" ? "O estoque será baixado. Esta ação não poderá ser desfeita; use devolução caso uma peça retorne." : "O pedido será cancelado sem baixar estoque."}</p>
            <div className="modal-actions">
              <button className="button button-outline" type="button" disabled={busy} onClick={() => setOrderAction(null)}>Voltar</button>
              <button className="button button-gold" type="button" disabled={busy} onClick={() => void confirmOrderAction()}>{orderAction.status === "confirmado" ? "Confirmar pedido" : "Cancelar pedido"}</button>
            </div>
          </div>
        </div>
      )}

      {returnOrder && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Registrar devolução">
          <div className="modal-card return-modal">
            <p className="eyebrow">Pedido {returnOrder.id}</p><h2>Registrar devolução</h2>
            {returnOrder.items.map((item) => {
              const available = item.quantity - item.returnedQuantity;
              return <div className="return-line" key={item.id}><strong>{item.productName} · {item.size} · {item.color}</strong><small>Vendeu: {item.quantity} · Já devolvida: {item.returnedQuantity}</small><label>Quantidade <input type="number" min="0" max={available} value={returnDraft[item.id]?.quantity ?? 0} onChange={(event) => setReturnDraft({ ...returnDraft, [item.id]: { quantity: Math.min(Math.max(Number(event.target.value), 0), available), restock: returnDraft[item.id]?.restock ?? true } })} /></label><label className="check-label"><input type="checkbox" checked={returnDraft[item.id]?.restock ?? true} onChange={(event) => setReturnDraft({ ...returnDraft, [item.id]: { quantity: returnDraft[item.id]?.quantity ?? 0, restock: event.target.checked } })} /> Peça em condição de venda — voltar ao estoque</label></div>;
            })}
            <div className="modal-actions"><button className="button button-outline" type="button" onClick={() => setReturnOrder(null)}>Voltar</button><button className="button button-gold" type="button" disabled={busy} onClick={() => void submitReturn()}>Confirmar devolução</button></div>
          </div>
        </div>
      )}

      {categoryEditor && (
        <AccessibleModal
          className="overlay"
          labelledBy="category-dialog-title"
          onClose={() => setCategoryEditor(null)}
        >
          <form className="admin-modal compact" onSubmit={saveCategory}>
            <button
              className="close-button"
              type="button"
              aria-label="Fechar categoria"
              onClick={() => setCategoryEditor(null)}
            >
              ×
            </button>
            <p className="eyebrow">Categoria</p>
            <h2 id="category-dialog-title">
              {categoryEditor.id ? "Editar" : "Nova categoria"}
            </h2>
            <label>
              <span>Nome</span>
              <input
                data-autofocus
                required
                maxLength={80}
                value={categoryEditor.name}
                onChange={(event) =>
                  setCategoryEditor({
                    ...categoryEditor,
                    name: event.target.value,
                  })
                }
              />
            </label>
            <label>
              <span>Ordem</span>
              <input
                type="number"
                min="0"
                value={categoryEditor.sortOrder}
                onChange={(event) =>
                  setCategoryEditor({
                    ...categoryEditor,
                    sortOrder: Number(event.target.value),
                  })
                }
              />
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={categoryEditor.active}
                onChange={(event) =>
                  setCategoryEditor({
                    ...categoryEditor,
                    active: event.target.checked,
                  })
                }
              />
              Categoria ativa
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="button button-gold" disabled={busy}>
              {busy ? "Salvando…" : "Salvar categoria"}
            </button>
          </form>
        </AccessibleModal>
      )}

      {editor && (
        <ProductEditor
          draft={editor}
          setDraft={setEditor}
          categories={data.allCategories}
          product={editor.id ? data.allProducts.find((p) => p.id === editor.id) : undefined}
          busy={busy}
          error={error}
          onSubmit={saveProduct}
          onRefresh={refresh}
          onFeedback={feedback}
          onError={setError}
        />
      )}
    </main>
  );
}

function ProductEditor({
  draft,
  setDraft,
  categories,
  product,
  busy,
  error,
  onSubmit,
  onRefresh,
  onFeedback,
  onError,
}: {
  draft: ProductDraft;
  setDraft: (draft: ProductDraft | null) => void;
  categories: Category[];
  product?: Product;
  busy: boolean;
  error: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onRefresh: () => Promise<void>;
  onFeedback: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<Array<{ key: string; url: string; name: string }>>([]);
  const [imageAlt, setImageAlt] = useState("");
  const [uploadProgress, setUploadProgress] = useState("");
  const [expandedImage, setExpandedImage] = useState<{
    url: string;
    altText: string;
  } | null>(null);
  const updateVariant = (
    index: number,
    patch: Partial<ProductDraft["variants"][number]>,
  ) =>
    setDraft({
      ...draft,
      variants: draft.variants.map((variant, position) =>
        position === index ? { ...variant, ...patch } : variant,
      ),
    });

  async function uploadImage() {
    if (!draft.id || !imageFiles.length) {
      onError("Selecione uma imagem.");
      return;
    }
    try {
      for (const [index, imageFile] of imageFiles.entries()) {
        setUploadProgress(`Enviando imagem ${index + 1} de ${imageFiles.length}…`);
        const formData = new FormData();
        formData.set("productId", String(draft.id));
        formData.set("file", imageFile);
        formData.set("altText", imageAlt || draft.name);
        await api("/api/admin/images", { method: "POST", body: formData });
      }
      await onRefresh();
      setImageFiles([]);
      setImagePreviews([]);
      setImageAlt("");
      onFeedback(`${imageFiles.length} imagem(ns) enviada(s).`);
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Falha no upload.");
    } finally {
      setUploadProgress("");
    }
  }

  async function removeImage(imageId: number) {
    if (!window.confirm("Remover esta imagem do produto?")) return;
    try {
      await api(`/api/admin/images?id=${imageId}`, { method: "DELETE" });
      await onRefresh();
      onFeedback("Imagem removida.");
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Falha ao remover.");
    }
  }

  async function moveImage(imageId: number, direction: -1 | 1) {
    if (!draft.id || !product) return;
    const imageIds = product.images.map((image) => image.id);
    const index = imageIds.indexOf(imageId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= imageIds.length) return;
    [imageIds[index], imageIds[target]] = [imageIds[target], imageIds[index]];
    try {
      await api("/api/admin/images", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: draft.id, imageIds }),
      });
      await onRefresh();
      onFeedback("Ordem das imagens atualizada.");
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Falha ao ordenar.");
    }
  }

  return (
    <AccessibleModal
      className="overlay admin-overlay"
      labelledBy="product-dialog-title"
      onClose={() => setDraft(null)}
    >
      <form className="admin-modal product-editor" onSubmit={onSubmit}>
        <button
          className="close-button"
          type="button"
          aria-label="Fechar"
          onClick={() => setDraft(null)}
        >
          ×
        </button>
        <p className="eyebrow">Produto</p>
        <h2 id="product-dialog-title">
          {draft.id ? "Editar produto" : "Novo produto"}
        </h2>
        <div className="admin-form-grid">
          <label className="wide">
            <span>Nome</span>
            <input
              data-autofocus
              required
              maxLength={140}
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
          <label>
            <span>Categoria</span>
            <select
              value={draft.categoryId ?? ""}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  categoryId: event.target.value
                    ? Number(event.target.value)
                    : null,
                })
              }
            >
              <option value="">Sem categoria</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select
              value={draft.status}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  status: event.target.value as ProductStatus,
                })
              }
            >
              <option value="draft">Rascunho</option>
              <option value="published">Publicado</option>
              <option value="archived">Arquivado</option>
            </select>
          </label>
          <label>
            <span>Preço (R$)</span>
            <input
              required
              inputMode="decimal"
              placeholder="159,90"
              value={draft.basePrice}
              onChange={(event) =>
                setDraft({ ...draft, basePrice: event.target.value })
              }
            />
          </label>
          <label>
            <span>Time (opcional)</span>
            <input
              maxLength={100}
              value={draft.team}
              onChange={(event) => setDraft({ ...draft, team: event.target.value })}
            />
          </label>
          <label>
            <span>Temporada (opcional)</span>
            <input
              maxLength={50}
              value={draft.season}
              onChange={(event) =>
                setDraft({ ...draft, season: event.target.value })
              }
            />
          </label>
          <label className="wide">
            <span>Descrição</span>
            <textarea
              maxLength={2000}
              value={draft.description}
              onChange={(event) =>
                setDraft({ ...draft, description: event.target.value })
              }
            />
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={draft.featured}
              onChange={(event) =>
                setDraft({ ...draft, featured: event.target.checked })
              }
            />
            Produto em destaque
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={draft.personalizationEnabled}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  personalizationEnabled: event.target.checked,
                })
              }
            />
            Aceita personalização
          </label>
          {draft.personalizationEnabled && (
            <label>
              <span>Adicional da personalização (R$)</span>
              <input
                inputMode="decimal"
                value={draft.personalizationFee}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    personalizationFee: event.target.value,
                  })
                }
              />
            </label>
          )}
        </div>

        <section className="editor-section">
          <div className="admin-panel-title">
            <div>
              <p className="eyebrow">Tamanho · cor · estoque</p>
              <h3>Variações</h3>
              <p className="variant-help">
                Deixe a variação ativa para ela aparecer na loja e entrar no estoque disponível.
              </p>
            </div>
            <button
              className="text-button"
              type="button"
              onClick={() =>
                setDraft({
                  ...draft,
                  variants: [
                    ...draft.variants,
                    { size: "", color: "", sku: "", stock: 0, active: true },
                  ],
                })
              }
            >
              + Adicionar variação
            </button>
          </div>
          <div className="variant-admin-list">
            {draft.variants.map((variant, index) => (
              <div key={variant.id ?? `new-${index}`}>
                <label>
                  <span>Tamanho</span>
                  <input
                    required
                    value={variant.size}
                    onChange={(event) =>
                      updateVariant(index, { size: event.target.value })
                    }
                  />
                </label>
                <label>
                  <span>Cor</span>
                  <input
                    required
                    value={variant.color}
                    onChange={(event) =>
                      updateVariant(index, { color: event.target.value })
                    }
                  />
                </label>
                <label>
                  <span>SKU</span>
                  <input
                    required
                    value={variant.sku}
                    onChange={(event) =>
                      updateVariant(index, { sku: event.target.value })
                    }
                  />
                </label>
                <label>
                  <span>Estoque</span>
                  <input
                    required
                    type="number"
                    min="0"
                    value={variant.stock}
                    onChange={(event) =>
                      updateVariant(index, { stock: Number(event.target.value) })
                    }
                  />
                </label>
                <label className="check-label variant-active-control">
                  <input
                    type="checkbox"
                    checked={variant.active}
                    onChange={(event) =>
                      updateVariant(index, { active: event.target.checked })
                    }
                  />
                  Variação ativa
                </label>
                <button
                  type="button"
                  className="danger"
                  disabled={draft.variants.length === 1}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      variants: draft.variants.filter(
                        (_, position) => position !== index,
                      ),
                    })
                  }
                >
                  Remover da loja
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="editor-section">
          <div className="admin-panel-title">
            <div>
              <p className="eyebrow">Preço e período opcionais</p>
              <h3>Promoção</h3>
            </div>
          </div>
          <div className="admin-form-grid">
            <label>
              <span>Nome da promoção</span>
              <input
                value={draft.promotion.name}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    promotion: {
                      ...draft.promotion,
                      name: event.target.value,
                    },
                  })
                }
              />
            </label>
            <label>
              <span>Preço promocional (R$)</span>
              <input
                inputMode="decimal"
                value={draft.promotion.promotionalPrice}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    promotion: {
                      ...draft.promotion,
                      promotionalPrice: event.target.value,
                    },
                  })
                }
              />
            </label>
            <label>
              <span>Início</span>
              <input
                type="datetime-local"
                value={draft.promotion.startsAt}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    promotion: {
                      ...draft.promotion,
                      startsAt: event.target.value,
                    },
                  })
                }
              />
            </label>
            <label>
              <span>Fim</span>
              <input
                type="datetime-local"
                value={draft.promotion.endsAt}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    promotion: {
                      ...draft.promotion,
                      endsAt: event.target.value,
                    },
                  })
                }
              />
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={draft.promotion.active}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    promotion: {
                      ...draft.promotion,
                      active: event.target.checked,
                    },
                  })
                }
              />
              Promoção ativa
            </label>
          </div>
        </section>

        {draft.id && (
          <section className="editor-section">
            <div className="admin-panel-title">
              <div>
                <p className="eyebrow">JPEG, PNG, WebP ou AVIF · até 10 MB</p>
                <h3>Imagens</h3>
              </div>
            </div>
            <div className="image-admin-grid">
              {product?.images.map((image) => (
                <div key={image.id}>
                  <button
                    type="button"
                    className="admin-image-preview"
                    aria-label={`Ampliar ${image.altText || "imagem"}`}
                    onClick={() =>
                      setExpandedImage({
                        url: image.url,
                        altText: image.altText || "Imagem do produto",
                      })
                    }
                  >
                    <img src={image.url} alt={image.altText} loading="lazy" />
                  </button>
                  <div className="image-actions">
                    {product.images[0]?.id === image.id && <small>Principal</small>}
                    <button type="button" onClick={() => moveImage(image.id, -1)}>
                      ←
                    </button>
                    <button type="button" onClick={() => moveImage(image.id, 1)}>
                      →
                    </button>
                    <button
                      className="danger"
                      type="button"
                      onClick={() => removeImage(image.id)}
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="upload-form">
              <label>
                <span>Arquivo</span>
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  onChange={async (event) => {
                    const input = event.currentTarget;
                    const selected = Array.from(input.files ?? []);
                    const existing = new Set(imageFiles.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
                    const unique = selected.filter((file) => !existing.has(`${file.name}:${file.size}:${file.lastModified}`));
                    if (unique.length !== selected.length) onError("Imagens duplicadas foram ignoradas.");
                    setImageFiles((current) => [...current, ...unique]);
                    const previews = await Promise.all(unique.map(async (file) => ({
                      key: `${file.name}:${file.size}:${file.lastModified}`,
                      name: file.name,
                      url: await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(String(reader.result));
                        reader.onerror = () => reject(new Error("Não foi possível abrir a prévia da imagem."));
                        reader.readAsDataURL(file);
                      }),
                    })));
                    setImagePreviews((current) => [...current, ...previews]);
                    input.value = "";
                  }}
                />
              </label>
              <label>
                <span>Descrição da imagem</span>
                <input
                  maxLength={160}
                  value={imageAlt}
                  onChange={(event) => setImageAlt(event.target.value)}
                />
              </label>
              <button
                className="button button-outline"
                type="button"
                disabled={!imageFiles.length || Boolean(uploadProgress)}
                onClick={uploadImage}
              >
                {uploadProgress || "Enviar imagens"}
              </button>
            </div>
            {imagePreviews.length > 0 && <div className="selected-image-list">{imagePreviews.map((preview) => <figure key={preview.key}><img src={preview.url} alt={`Prévia de ${preview.name}`} /><figcaption>{preview.name}</figcaption></figure>)}</div>}
          </section>
        )}

        {expandedImage && (
          <div
            className="image-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label="Imagem ampliada"
            onClick={() => setExpandedImage(null)}
          >
            <button
              type="button"
              className="close-button lightbox-close"
              aria-label="Fechar imagem ampliada"
              onClick={() => setExpandedImage(null)}
            >
              ×
            </button>
            <img
              src={expandedImage.url}
              alt={expandedImage.altText}
              onClick={(event) => event.stopPropagation()}
            />
          </div>
        )}

        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button
            className="button button-outline"
            type="button"
            onClick={() => setDraft(null)}
          >
            Cancelar
          </button>
          <button className="button button-gold" disabled={busy}>
            {busy ? "Salvando…" : "Salvar produto"}
          </button>
        </div>
      </form>
    </AccessibleModal>
  );
}
