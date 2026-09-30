"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { formatMoney } from "@/lib/pricing";
import { normalizeInstagramUrl } from "@/lib/store-settings";
import type {
  Product,
  StorefrontData,
} from "@/lib/store-types";

type CartItem = {
  key: string;
  productId: number;
  variantId: number;
  productName: string;
  imageUrl: string | null;
  size: string;
  color: string;
  sku: string;
  quantity: number;
  stock: number;
  unitPrice: number;
  customName: string;
  customNumber: string;
};

type Checkout = {
  customerName: string;
  customerPhone: string;
  customerCity: string;
  deliveryMethod: string;
  notes: string;
};

const emptyCheckout: Checkout = {
  customerName: "",
  customerPhone: "",
  customerCity: "",
  deliveryMethod: "",
  notes: "",
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function ProductVisual({
  product,
  storeName,
  priority = false,
}: {
  product: Product;
  storeName: string;
  priority?: boolean;
}) {
  const image = product.images[0];
  if (image) {
    return (
      <div className="product-image">
        <img
          src={image.url}
          alt={image.altText || product.name}
          loading={priority ? "eager" : "lazy"}
        />
      </div>
    );
  }
  return (
    <div className="product-placeholder" role="img" aria-label={product.name}>
      <span>10</span>
      <small>{storeName}</small>
    </div>
  );
}

function ProductGallery({
  product,
  storeName,
  activeImageIndex,
  onSelectImage,
}: {
  product: Product;
  storeName: string;
  activeImageIndex: number;
  onSelectImage: (index: number) => void;
}) {
  const images = product.images;
  const image = images[activeImageIndex] ?? images[0];
  if (!image) return <ProductVisual product={product} storeName={storeName} />;

  const hasMultipleImages = images.length > 1;
  const selectPreviousImage = () =>
    onSelectImage((activeImageIndex - 1 + images.length) % images.length);
  const selectNextImage = () =>
    onSelectImage((activeImageIndex + 1) % images.length);

  return (
    <section className="product-gallery" aria-label={`Fotos de ${product.name}`}>
      <div className="product-gallery-main">
        <button
          className="gallery-image-zoom"
          type="button"
          aria-label={`Ampliar foto ${activeImageIndex + 1}`}
          onClick={() => onSelectImage(activeImageIndex)}
        >
          <img src={image.url} alt={image.altText || product.name} />
        </button>
        {hasMultipleImages && (
          <>
            <button
              className="gallery-nav gallery-nav-previous"
              type="button"
              aria-label="Foto anterior"
              onClick={selectPreviousImage}
            >
              ←
            </button>
            <button
              className="gallery-nav gallery-nav-next"
              type="button"
              aria-label="Próxima foto"
              onClick={selectNextImage}
            >
              →
            </button>
            <p className="gallery-position" aria-live="polite">
              Foto {activeImageIndex + 1} de {images.length}
            </p>
          </>
        )}
      </div>
      {hasMultipleImages && (
        <div className="gallery-thumbnails" aria-label="Selecionar foto">
          {images.map((entry, index) => (
            <button
              className={index === activeImageIndex ? "selected" : ""}
              type="button"
              key={entry.id}
              aria-label={`Ver foto ${index + 1}`}
              aria-pressed={index === activeImageIndex}
              onClick={() => onSelectImage(index)}
            >
              <img src={entry.url} alt="" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export default function Storefront({
  initialData,
}: {
  initialData: StorefrontData;
}) {
  const [data, setData] = useState(initialData);
  const store = data.settings;
  const instagramUrl = store.instagramUrl
    ? normalizeInstagramUrl(store.instagramUrl)
    : null;
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [size, setSize] = useState("all");
  const [color, setColor] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [price, setPrice] = useState("all");
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [variantId, setVariantId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [customName, setCustomName] = useState("");
  const [customNumber, setCustomNumber] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [returnToCart, setReturnToCart] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkout, setCheckout] = useState(emptyCheckout);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("camisa10-cart");
      if (saved) {
        const restored = JSON.parse(saved) as CartItem[];
        queueMicrotask(() => setCart(restored));
      }
    } catch {
      // O carrinho permanece em memória quando o armazenamento está indisponível.
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem("camisa10-cart", JSON.stringify(cart));
    } catch {
      // O carrinho permanece em memória.
    }
  }, [cart]);

  useEffect(() => {
    const refresh = async () => {
      try {
        const response = await fetch("/api/storefront");
        if (response.ok) setData((await response.json()) as StorefrontData);
      } catch {
        // Os dados renderizados no servidor continuam disponíveis.
      }
    };
    void refresh();
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveProduct(null);
        setImageViewerOpen(false);
        setCartOpen(false);
        setCheckoutOpen(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const sizes = useMemo(
    () =>
      Array.from(
        new Set(
          data.products.flatMap((product) =>
            product.variants.map((variant) => variant.size),
          ),
        ),
      ).sort(),
    [data.products],
  );
  const colors = useMemo(
    () =>
      Array.from(
        new Set(
          data.products.flatMap((product) =>
            product.variants.map((variant) => variant.color),
          ),
        ),
      ).sort(),
    [data.products],
  );
  const filtered = useMemo(
    () =>
      data.products.filter((product) => {
        const haystack = normalize(
          [product.name, product.description, product.categoryName, product.team]
            .filter(Boolean)
            .join(" "),
        );
        const categoryMatch =
          category === "all" || product.categoryId === Number(category);
        const sizeMatch =
          size === "all" ||
          product.variants.some(
            (variant) => variant.active && variant.size === size,
          );
        const colorMatch =
          color === "all" ||
          product.variants.some(
            (variant) => variant.active && variant.color === color,
          );
        const availableMatch =
          availability === "all" ||
          (availability === "available"
            ? product.totalStock > 0
            : product.totalStock === 0);
        const priceMatch =
          price === "all" ||
          (price === "under100" && product.effectivePrice < 10000) ||
          (price === "100to200" &&
            product.effectivePrice >= 10000 &&
            product.effectivePrice <= 20000) ||
          (price === "over200" && product.effectivePrice > 20000);
        return (
          haystack.includes(normalize(search)) &&
          categoryMatch &&
          sizeMatch &&
          colorMatch &&
          availableMatch &&
          priceMatch
        );
      }),
    [availability, category, color, data.products, price, search, size],
  );
  const selectedVariant =
    activeProduct?.variants.find((variant) => variant.id === variantId) ?? null;
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cart.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0,
  );

  function announce(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }

  function openProduct(
    product: Product,
    requestedVariantId?: number,
    shouldReturnToCart = false,
  ) {
    setActiveProduct(product);
    setActiveImageIndex(0);
    setImageViewerOpen(false);
    const requested = product.variants.find(
      (variant) =>
        variant.id === requestedVariantId && variant.active && variant.stock > 0,
    );
    const firstAvailable = product.variants.find(
      (variant) => variant.active && variant.stock > 0,
    );
    setVariantId(requested?.id ?? firstAvailable?.id ?? null);
    setQuantity(1);
    setCustomName("");
    setCustomNumber("");
    setError("");
    setReturnToCart(shouldReturnToCart);
  }

  function closeProduct() {
    setActiveProduct(null);
    setImageViewerOpen(false);
    if (returnToCart) setCartOpen(true);
    setReturnToCart(false);
  }

  function openCartItem(item: CartItem) {
    const product = data.products.find((entry) => entry.id === item.productId);
    if (!product) {
      announce("Esta camiseta não está mais disponível para visualização.");
      return;
    }
    setCartOpen(false);
    openProduct(product, item.variantId, true);
  }

  function addToCart(event: FormEvent) {
    event.preventDefault();
    if (!activeProduct || !selectedVariant || selectedVariant.stock < 1) {
      setError("Selecione uma variação disponível.");
      return;
    }
    if (quantity > selectedVariant.stock) {
      setError("A quantidade escolhida é maior que o estoque disponível.");
      return;
    }
    const personalized = Boolean(customName.trim() || customNumber.trim());
    const unitPrice =
      activeProduct.effectivePrice +
      (personalized ? activeProduct.personalizationFee : 0);
    const key = [
      selectedVariant.id,
      customName.trim(),
      customNumber.trim(),
    ].join("|");
    setCart((current) => {
      const existing = current.find((item) => item.key === key);
      if (existing) {
        return current.map((item) =>
          item.key === key
            ? {
                ...item,
                quantity: Math.min(item.stock, item.quantity + quantity),
              }
            : item,
        );
      }
      return [
        ...current,
        {
          key,
          productId: activeProduct.id,
          variantId: selectedVariant.id,
          productName: activeProduct.name,
          imageUrl: activeProduct.images[0]?.url ?? null,
          size: selectedVariant.size,
          color: selectedVariant.color,
          sku: selectedVariant.sku,
          stock: selectedVariant.stock,
          quantity,
          unitPrice,
          customName: customName.trim(),
          customNumber: customNumber.trim(),
        },
      ];
    });
    setQuantity(1);
    announce("Produto adicionado ao pedido.");
  }

  function updateQuantity(key: string, next: number) {
    setCart((current) =>
      current.map((item) =>
        item.key === key
          ? { ...item, quantity: Math.max(1, Math.min(item.stock, next)) }
          : item,
      ),
    );
  }

  async function submitOrder(event: FormEvent) {
    event.preventDefault();
    if (!cart.length || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...checkout,
          items: cart.map((item) => ({
            variantId: item.variantId,
            quantity: item.quantity,
            customName: item.customName,
            customNumber: item.customNumber,
          })),
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        whatsappUrl?: string;
      };
      if (!response.ok || !result.whatsappUrl) {
        throw new Error(result.error || "Não foi possível registrar o pedido.");
      }
      setCart([]);
      setCheckout(emptyCheckout);
      setCheckoutOpen(false);
      setCartOpen(false);
      window.location.assign(result.whatsappUrl);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível registrar o pedido.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="site-header">
        <a className="brand" href="#inicio" aria-label={`${store.storeName} — início`}>
          <span>10</span>
          <strong>{store.storeName}</strong>
        </a>
        <nav className="desktop-nav" aria-label="Navegação principal">
          <a href="#inicio">Início</a>
          <a href="#produtos">Camisetas</a>
          <a href="#como-comprar">Como comprar</a>
        </nav>
        <div className="header-actions">
          <a
            className="button button-outline"
            href={`https://wa.me/${store.whatsappNumber}`}
            target="_blank"
            rel="noreferrer"
          >
            WhatsApp ↗
          </a>
          <button
            className="cart-button"
            type="button"
            onClick={() => setCartOpen(true)}
          >
            Pedido <span>{cartCount}</span>
          </button>
        </div>
      </header>

      <div id="conteudo">
        <section className="hero" id="inicio">
          <div className="hero-copy">
            <p className="eyebrow">{store.heroEyebrow}</p>
            <h1>{store.heroTitle}</h1>
            <p className="hero-subtitle">{store.heroSubtitle}</p>
            <div className="hero-actions">
              <a className="button button-gold" href="#produtos">
                Ver camisetas →
              </a>
              <a
                className="button button-dark"
                href={`https://wa.me/${store.whatsappNumber}`}
                target="_blank"
                rel="noreferrer"
              >
                Falar com a loja ↗
              </a>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="hero-lines" />
            <span className="hero-ten">10</span>
            <small>{store.storeName} · {store.city}</small>
          </div>
        </section>

        <section className="trust-strip" aria-label="Diferenciais">
          <div>
            <b>✓</b> Variedade de estilos
          </div>
          <div>
            <b>10</b> Personalização selecionada
          </div>
          <div>
            <b>↗</b> Pedido seguro pelo WhatsApp
          </div>
          <div>
            <b>•</b> Estoque atualizado
          </div>
        </section>

        <section className="catalog-section" id="produtos">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Escolha a sua</p>
              <h2>Nossas camisetas</h2>
            </div>
            <p>
              {filtered.length} {filtered.length === 1 ? "produto" : "produtos"}
            </p>
          </div>

          <div className="category-row" aria-label="Categorias">
            <button
              type="button"
              className={category === "all" ? "active" : ""}
              onClick={() => setCategory("all")}
            >
              Todas
            </button>
            {data.categories.map((item) => (
              <button
                key={item.id}
                type="button"
                className={category === String(item.id) ? "active" : ""}
                onClick={() => setCategory(String(item.id))}
              >
                {item.name}
              </button>
            ))}
          </div>

          <div className="filters" aria-label="Pesquisa e filtros">
            <label className="search-field">
              <span>Pesquisar</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nome, estilo ou categoria"
              />
            </label>
            <label>
              <span>Tamanho</span>
              <select value={size} onChange={(event) => setSize(event.target.value)}>
                <option value="all">Todos</option>
                {sizes.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Cor</span>
              <select
                value={color}
                onChange={(event) => setColor(event.target.value)}
              >
                <option value="all">Todas</option>
                {colors.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Disponibilidade</span>
              <select
                value={availability}
                onChange={(event) => setAvailability(event.target.value)}
              >
                <option value="all">Todos</option>
                <option value="available">Em estoque</option>
                <option value="soldout">Esgotados</option>
              </select>
            </label>
            <label>
              <span>Faixa de preço</span>
              <select
                value={price}
                onChange={(event) => setPrice(event.target.value)}
              >
                <option value="all">Todas</option>
                <option value="under100">Até R$ 99,99</option>
                <option value="100to200">R$ 100 a R$ 200</option>
                <option value="over200">Acima de R$ 200</option>
              </select>
            </label>
            <button
              className="clear-button"
              type="button"
              onClick={() => {
                setSearch("");
                setCategory("all");
                setSize("all");
                setColor("all");
                setAvailability("all");
                setPrice("all");
              }}
            >
              Limpar filtros
            </button>
          </div>

          {filtered.length ? (
            <div className="product-grid">
              {filtered.map((product, index) => (
                <article className="product-card" key={product.id}>
                  <button
                    className="product-visual-button"
                    type="button"
                    aria-label={`Ver opções de ${product.name}`}
                    onClick={() => openProduct(product)}
                  >
                    <ProductVisual
                      product={product}
                      storeName={store.storeName}
                      priority={index < 3}
                    />
                  </button>
                  <div className="product-body">
                    <div className="badge-row">
                      <span
                        className={
                          product.totalStock > 0 ? "badge ready" : "badge soldout"
                        }
                      >
                        {product.totalStock > 0 ? "Em estoque" : "Esgotado"}
                      </span>
                      {product.categoryName && <span>{product.categoryName}</span>}
                    </div>
                    <h3>
                      <button
                        className="product-title-button"
                        type="button"
                        onClick={() => openProduct(product)}
                      >
                        {product.name}
                      </button>
                    </h3>
                    <p>{product.description}</p>
                    <div className="price-row">
                      {product.effectivePrice < product.basePrice && (
                        <del>{formatMoney(product.basePrice)}</del>
                      )}
                      <strong>{formatMoney(product.effectivePrice)}</strong>
                    </div>
                    <button
                      className="button button-gold"
                      type="button"
                      disabled={product.totalStock < 1}
                      onClick={() => openProduct(product)}
                    >
                      {product.totalStock > 0 ? "Escolher opções" : "Esgotado"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : data.products.length ? (
            <div className="empty-state">
              <span>10</span>
              <h3>Nenhuma camiseta encontrada</h3>
              <p>Tente limpar ou alterar os filtros para ver outros produtos.</p>
            </div>
          ) : (
            <div className="empty-state">
              <span>10</span>
              <h3>Novidades chegando</h3>
              <p>
                Nossa seleção está sendo preparada. Fale com a loja para saber o
                que já está disponível.
              </p>
              <a
                className="button button-gold"
                href={`https://wa.me/${store.whatsappNumber}`}
                target="_blank"
                rel="noreferrer"
              >
                Consultar pelo WhatsApp
              </a>
            </div>
          )}
        </section>

        <section className="how-section" id="como-comprar">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Simples e direto</p>
              <h2>Como comprar</h2>
            </div>
          </div>
          <ol className="steps">
            <li>
              <b>01</b>
              <h3>Escolha</h3>
              <p>Selecione camiseta, tamanho, cor e quantidade.</p>
            </li>
            <li>
              <b>02</b>
              <h3>Monte o pedido</h3>
              <p>Confira os itens e informe seus dados de contato.</p>
            </li>
            <li>
              <b>03</b>
              <h3>Envie</h3>
              <p>O pedido é registrado antes de abrir o WhatsApp.</p>
            </li>
            <li>
              <b>04</b>
              <h3>Confirme</h3>
              <p>A loja confirma disponibilidade, entrega e pagamento.</p>
            </li>
          </ol>
        </section>
      </div>

      <footer>
        <div>
          <a className="brand" href="#inicio">
            <span>10</span>
            <strong>{store.storeName}</strong>
          </a>
          <p>Camisetas para todos os estilos em {store.city}.</p>
        </div>
        <div>
          <b>Atendimento</b>
          <a href={`https://wa.me/${store.whatsappNumber}`}>WhatsApp</a>
          {instagramUrl && <a href={instagramUrl}>Instagram</a>}
        </div>
        <div>
          <b>Loja</b>
          <a href="#produtos">Camisetas</a>
          <a href="#como-comprar">Como comprar</a>
        </div>
      </footer>

      {activeProduct && (
        <div
          className="overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-title"
        >
          <div className="product-modal">
            <button
              className="close-button"
              type="button"
              aria-label="Fechar"
              onClick={closeProduct}
            >
              ×
            </button>
            <ProductGallery
              product={activeProduct}
              storeName={store.storeName}
              activeImageIndex={activeImageIndex}
              onSelectImage={(index) => {
                setActiveImageIndex(index);
                if (index === activeImageIndex) setImageViewerOpen(true);
              }}
            />
            <form className="product-form" onSubmit={addToCart}>
              <p className="eyebrow">{activeProduct.categoryName || "Camiseta"}</p>
              <h2 id="product-title">{activeProduct.name}</h2>
              <p>{activeProduct.description}</p>
              <div className="price-row">
                {activeProduct.effectivePrice < activeProduct.basePrice && (
                  <del>{formatMoney(activeProduct.basePrice)}</del>
                )}
                <strong>{formatMoney(activeProduct.effectivePrice)}</strong>
              </div>
              <fieldset className="variant-options">
                <legend>Tamanho e cor</legend>
                {activeProduct.variants.map((variant) => (
                  <label
                    key={variant.id}
                    className={variant.stock < 1 ? "disabled" : ""}
                  >
                    <input
                      type="radio"
                      name="variant"
                      value={variant.id}
                      checked={variantId === variant.id}
                      disabled={!variant.active || variant.stock < 1}
                      onChange={() => {
                        setVariantId(variant.id);
                        setQuantity(1);
                      }}
                    />
                    <span>
                      {variant.size} · {variant.color}
                      <small>
                        {variant.stock > 0
                          ? `${variant.stock} disponível(is)`
                          : "Esgotado"}
                      </small>
                    </span>
                  </label>
                ))}
              </fieldset>
              <label>
                <span>Quantidade</span>
                <input
                  type="number"
                  min="1"
                  max={selectedVariant?.stock ?? 1}
                  value={quantity}
                  onChange={(event) =>
                    setQuantity(
                      Math.max(
                        1,
                        Math.min(
                          selectedVariant?.stock ?? 1,
                          Number(event.target.value),
                        ),
                      ),
                    )
                  }
                />
              </label>
              {activeProduct.personalizationEnabled && (
                <div className="personalization">
                  <p>
                    Personalização opcional ·{" "}
                    {formatMoney(activeProduct.personalizationFee)}
                  </p>
                  <label>
                    <span>Nome</span>
                    <input
                      maxLength={30}
                      value={customName}
                      onChange={(event) => setCustomName(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Número</span>
                    <input
                      maxLength={4}
                      value={customNumber}
                      onChange={(event) => setCustomNumber(event.target.value)}
                    />
                  </label>
                </div>
              )}
              {error && <p className="form-error">{error}</p>}
              <button
                className="button button-gold"
                type="submit"
                disabled={!selectedVariant}
              >
                Adicionar ao pedido
              </button>
            </form>
          </div>
        </div>
      )}

      {activeProduct && imageViewerOpen && activeProduct.images.length > 0 && (
        <div
          className="image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Fotos de ${activeProduct.name}`}
        >
          <button
            className="close-button lightbox-close"
            type="button"
            aria-label="Fechar imagem"
            onClick={() => setImageViewerOpen(false)}
          >
            ×
          </button>
          {activeProduct.images.length > 1 && (
            <button
              className="lightbox-nav lightbox-nav-previous"
              type="button"
              aria-label="Foto anterior"
              onClick={() =>
                setActiveImageIndex(
                  (current) =>
                    (current - 1 + activeProduct.images.length) %
                    activeProduct.images.length,
                )
              }
            >
              ←
            </button>
          )}
          <img
            src={
              activeProduct.images[activeImageIndex]?.url ??
              activeProduct.images[0].url
            }
            alt={
              activeProduct.images[activeImageIndex]?.altText ||
              activeProduct.name
            }
          />
          {activeProduct.images.length > 1 && (
            <button
              className="lightbox-nav lightbox-nav-next"
              type="button"
              aria-label="Próxima foto"
              onClick={() =>
                setActiveImageIndex(
                  (current) => (current + 1) % activeProduct.images.length,
                )
              }
            >
              →
            </button>
          )}
        </div>
      )}

      {cartOpen && (
        <div className="overlay cart-overlay" role="dialog" aria-modal="true">
          <aside className="cart-drawer" aria-labelledby="cart-title">
            <div className="cart-header">
              <div>
                <p className="eyebrow">Seu pedido</p>
                <h2 id="cart-title">
                  Carrinho <span>{cartCount}</span>
                </h2>
              </div>
              <button
                className="close-button"
                type="button"
                aria-label="Fechar"
                onClick={() => setCartOpen(false)}
              >
                ×
              </button>
            </div>
            {cart.length ? (
              <>
                <div className="cart-list">
                  {cart.map((item) => (
                    <article className="cart-item" key={item.key}>
                      <button
                        className="cart-thumb cart-product-link"
                        type="button"
                        aria-label={`Ver camiseta ${item.productName}`}
                        onClick={() => openCartItem(item)}
                      >
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.productName} />
                        ) : (
                          "10"
                        )}
                      </button>
                      <div>
                        <div className="cart-item-title">
                          <h3>
                            <button
                              className="cart-product-name"
                              type="button"
                              onClick={() => openCartItem(item)}
                            >
                              {item.productName}
                            </button>
                          </h3>
                          <button
                            type="button"
                            onClick={() =>
                              setCart((current) =>
                                current.filter((entry) => entry.key !== item.key),
                              )
                            }
                          >
                            Remover
                          </button>
                        </div>
                        <p>
                          {item.size} · {item.color}
                        </p>
                        <button
                          className="cart-view-product"
                          type="button"
                          onClick={() => openCartItem(item)}
                        >
                          Ver camiseta
                        </button>
                        {(item.customName || item.customNumber) && (
                          <p>
                            Personalização: {item.customName || "—"} /{" "}
                            {item.customNumber || "—"}
                          </p>
                        )}
                        <div className="cart-item-footer">
                          <div className="quantity-control">
                            <button
                              type="button"
                              onClick={() =>
                                updateQuantity(item.key, item.quantity - 1)
                              }
                            >
                              −
                            </button>
                            <span>{item.quantity}</span>
                            <button
                              type="button"
                              disabled={item.quantity >= item.stock}
                              onClick={() =>
                                updateQuantity(item.key, item.quantity + 1)
                              }
                            >
                              +
                            </button>
                          </div>
                          <strong>
                            {formatMoney(item.unitPrice * item.quantity)}
                          </strong>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="cart-summary">
                  <div>
                    <span>Total</span>
                    <strong>{formatMoney(cartTotal)}</strong>
                  </div>
                  <p>
                    O estoque será atualizado somente quando a loja confirmar o
                    pedido.
                  </p>
                  <button
                    className="button whatsapp-button"
                    type="button"
                    onClick={() => {
                      setCheckoutOpen(true);
                      setError("");
                    }}
                  >
                    Continuar pedido
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-cart">
                <span>10</span>
                <h3>Seu pedido está vazio</h3>
                <p>Escolha uma camiseta para começar.</p>
                <button
                  className="button button-gold"
                  type="button"
                  onClick={() => setCartOpen(false)}
                >
                  Ver camisetas
                </button>
              </div>
            )}
          </aside>
        </div>
      )}

      {checkoutOpen && (
        <div className="overlay" role="dialog" aria-modal="true">
          <form className="checkout-modal" onSubmit={submitOrder}>
            <button
              className="close-button"
              type="button"
              aria-label="Fechar"
              onClick={() => setCheckoutOpen(false)}
            >
              ×
            </button>
            <p className="eyebrow">Finalizar pelo WhatsApp</p>
            <h2>Seus dados</h2>
            <p>
              Vamos registrar o pedido e preparar a mensagem para a loja.
            </p>
            <p className="checkout-availability-note">
              Pedido sujeito à confirmação de disponibilidade pela loja.
            </p>
            <label>
              <span>Nome</span>
              <input
                required
                maxLength={120}
                value={checkout.customerName}
                onChange={(event) =>
                  setCheckout({ ...checkout, customerName: event.target.value })
                }
              />
            </label>
            <label>
              <span>Telefone</span>
              <input
                required
                inputMode="tel"
                maxLength={30}
                value={checkout.customerPhone}
                onChange={(event) =>
                  setCheckout({ ...checkout, customerPhone: event.target.value })
                }
              />
            </label>
            <label>
              <span>Cidade</span>
              <input
                required
                maxLength={120}
                value={checkout.customerCity}
                onChange={(event) =>
                  setCheckout({ ...checkout, customerCity: event.target.value })
                }
              />
            </label>
            <label>
              <span>Forma de entrega</span>
              <select
                required
                value={checkout.deliveryMethod}
                onChange={(event) =>
                  setCheckout({ ...checkout, deliveryMethod: event.target.value })
                }
              >
                <option value="">Selecione</option>
                {store.deliveryOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            <label>
              <span>Observações</span>
              <textarea
                maxLength={500}
                value={checkout.notes}
                onChange={(event) =>
                  setCheckout({ ...checkout, notes: event.target.value })
                }
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button
              className="button whatsapp-button"
              type="submit"
              disabled={busy}
            >
              {busy ? "Registrando pedido…" : "Registrar e abrir WhatsApp"}
            </button>
          </form>
        </div>
      )}

      <button
        className="mobile-cart"
        type="button"
        onClick={() => setCartOpen(true)}
      >
        <span>Pedido · {cartCount}</span>
        <strong>{formatMoney(cartTotal)}</strong>
      </button>
      <div className={`toast ${toast ? "show" : ""}`} role="status">
        {toast}
      </div>
    </main>
  );
}
