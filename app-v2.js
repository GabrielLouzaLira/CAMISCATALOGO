const $ = selector => document.querySelector(selector);
let data = { settings: {}, categories: [], teams: [], products: [] };
let view = { name: "home", categoryId: null, teamId: null, group: "", query: "" };
let homeFilters = { categoryId: "", group: "", teamId: "" };
let galleryState = { productId: null, photoIndex: 0, opener: null, pointerStart: null };

const esc = value => String(value ?? "").replace(/[&<>\"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
const ordered = list => [...list].sort((a, b) => (a.order || 0) - (b.order || 0));
const media = file => file?.url || "";
const productsFor = teamId => ordered(data.products.filter(product => product.teamKey === teamId));
const teamsFor = categoryId => ordered(data.teams.filter(team => team.categoryId === categoryId && !team.hidden));
const visibleCategories = () => ordered(data.categories.filter(category => !category.hidden));
const categoryFor = id => data.categories.find(category => category.id === id);
const teamFor = id => data.teams.find(team => team.id === id);
const initials = name => String(name || "10").split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase();
const allProducts = () => ordered(data.products).filter(product => {
  const team = teamFor(product.teamKey);
  const category = categoryFor(team?.categoryId);
  return team && !team.hidden && category && !category.hidden;
});
const groupsFor = categoryId => [...new Set(data.teams
  .filter(team => team.categoryId === categoryId && !team.hidden && team.group)
  .map(team => team.group))].sort((a, b) => a.localeCompare(b, "pt-BR"));
const filteredProducts = () => allProducts().filter(product => {
  const team = teamFor(product.teamKey);
  return (!homeFilters.categoryId || team.categoryId === homeFilters.categoryId)
    && (!homeFilters.group || team.group === homeFilters.group)
    && (!homeFilters.teamId || team.id === homeFilters.teamId);
});

function setView(name, extra = {}) {
  view = { name, categoryId: null, teamId: null, group: "", query: "", ...extra };
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function productCard(product, showContext = false) {
  const image = media(product.images?.[0]);
  const team = teamFor(product.teamKey);
  const category = categoryFor(team?.categoryId);
  const context = showContext
    ? [category?.title, team?.group, team?.name].filter(Boolean).join(" / ")
    : product.reference || "MODELO DISPONIVEL";
  return `<button class="product-card" type="button" data-product="${esc(product.id)}">
    <span class="product-card__image">${image ? `<img src="${esc(image)}" alt="${esc(product.name)}" loading="lazy">` : ""}</span>
    <span class="product-card__copy"><small>${esc(context)}</small><strong>${esc(product.name)}</strong><span>Ver detalhes e solicitar</span></span>
  </button>`;
}

function categoryCard(category) {
  const count = teamsFor(category.id).length;
  return `<button class="category-card" type="button" data-category="${esc(category.id)}">
    <span class="category-card__top"><span>${esc(category.accent || "COLECAO")}</span><b>${esc(String(category.number || "").padStart(2, "0"))}</b></span>
    <span class="category-card__ball" aria-hidden="true">10</span>
    <span class="category-card__copy"><strong>${esc(category.title)}</strong><small>${esc(category.subtitle || `${count} times disponiveis`)}</small></span>
    <span class="category-card__arrow" aria-hidden="true">-&gt;</span>
  </button>`;
}

function renderHome() {
  const products = allProducts();
  const featured = products.filter(product => product.featured).sort((a, b) => (a.featuredOrder || 0) - (b.featuredOrder || 0) || (a.order || 0) - (b.order || 0));
  const galleryProducts = featured.length ? featured : products;
  const firstPhotos = galleryProducts.flatMap(product => product.images || []).map(media).filter(Boolean).slice(0, 3);
  const categoryFilters = visibleCategories().map(category => `<button class="filter-chip ${homeFilters.categoryId === category.id ? "is-active" : ""}" type="button" data-filter-category="${esc(category.id)}">${esc(category.title)}</button>`).join("");
  const groupFilters = homeFilters.categoryId ? groupsFor(homeFilters.categoryId) : [];
  const visibleProducts = filteredProducts();
  const filterTeams = ordered(data.teams.filter(team => !team.hidden && visibleCategories().some(category => category.id === team.categoryId)
    && (!homeFilters.categoryId || team.categoryId === homeFilters.categoryId)
    && (!homeFilters.group || team.group === homeFilters.group)));
  const gallery = firstPhotos.length
    ? `<div class="hero-gallery">${firstPhotos.map((url, index) => `<img src="${esc(url)}" alt="Modelo do catalogo ${index + 1}">`).join("")}</div>`
    : `<div class="hero-gallery hero-gallery--empty"><div class="hero-empty"><span>10</span><strong>Novos modelos em breve</strong><small>As fotos publicadas pelo painel aparecerao aqui.</small></div></div>`;
  return `<section class="hero"><div class="hero-copy"><p class="eyebrow"><span></span>CATALOGO CAMISA 10</p>
      <h1>${esc(data.settings.catalogTitle || "Seu time. Sua camisa.")}</h1>
      <p>${esc(data.settings.introText || "Veja os modelos em destaque ou filtre por esporte, grupo e time.")}</p>
      <button class="primary-button" type="button" data-explore><span>VER CAMISETAS</span><span>-&gt;</span></button>
      <p class="hero-note">Atendimento e pedidos pelo WhatsApp.</p></div>${gallery}</section>
    ${featured.length ? `<section class="catalog-section showcase-section"><div class="section-heading"><div><p class="eyebrow"><span></span>ESCOLHIDAS PELA LOJA</p><h2>DESTAQUES</h2></div><p>Os modelos mais procurados aparecem primeiro.</p></div><div class="product-grid">${featured.map(product => productCard(product, true)).join("")}</div></section>` : ""}
    <section id="all-products" class="catalog-section"><div class="section-heading"><div><p class="eyebrow"><span></span>CATALOGO COMPLETO</p><h2>TODAS AS<br>CAMISETAS</h2></div><p>Veja tudo ou filtre pelo esporte e pelo grupo desejado.</p></div>
    <div class="filter-row" aria-label="Filtrar por esporte"><button class="filter-chip ${!homeFilters.categoryId ? "is-active" : ""}" type="button" data-filter-category="">Todos</button>${categoryFilters}</div>
    ${groupFilters.length ? `<div class="filter-row filter-row--sub" aria-label="Filtrar por grupo"><span>GRUPO OU LIGA</span><button class="filter-chip ${!homeFilters.group ? "is-active" : ""}" type="button" data-filter-group="">Todos</button>${groupFilters.map(group => `<button class="filter-chip ${homeFilters.group === group ? "is-active" : ""}" type="button" data-filter-group="${esc(group)}">${esc(group)}</button>`).join("")}</div>` : ""}
    <label class="team-filter">TIME<select id="home-team-filter"><option value="">Todos os times</option>${filterTeams.map(team => `<option value="${esc(team.id)}" ${homeFilters.teamId === team.id ? "selected" : ""}>${esc([categoryFor(team.categoryId)?.title, team.group, team.name].filter(Boolean).join(" / "))}</option>`).join("")}</select></label>
    <div class="product-grid home-product-grid" aria-live="polite">${visibleProducts.map(product => productCard(product, true)).join("") || `<p class="empty-state">Nenhuma camiseta publicada para este filtro.</p>`}</div></section>
    <section class="catalog-section"><div class="section-heading"><div><p class="eyebrow"><span></span>NAVEGUE POR ESPORTE</p><h2>ENCONTRE SEU<br>TIME</h2></div><p>Entre em um esporte para escolher o grupo, o time e seus modelos.</p></div>
    <div class="category-grid">${visibleCategories().map(categoryCard).join("") || `<p class="empty-state">As categorias serao publicadas pelo painel administrativo.</p>`}</div></section>`;
}

function teamCards(categoryId, query = "", group = "") {
  const normalized = query.trim().toLocaleLowerCase("pt-BR");
  const visibleIds = new Set(visibleCategories().map(category => category.id));
  const source = categoryId ? teamsFor(categoryId) : ordered(data.teams.filter(team => !team.hidden && visibleIds.has(team.categoryId)));
  const teams = source.filter(team => (!group || team.group === group) && (!normalized || team.name.toLocaleLowerCase("pt-BR").includes(normalized)));
  return teams.map(team => `<button class="team-card" type="button" data-team="${esc(team.id)}"><span class="team-card__monogram">${esc(initials(team.name))}</span><span><strong>${esc(team.name)}</strong><small>${esc(team.group ? `${team.group} / ` : "")}${productsFor(team.id).length} modelo(s)</small></span><span aria-hidden="true">-&gt;</span></button>`).join("") || `<p class="empty-state">Nenhum time encontrado neste esporte.</p>`;
}

function renderSearch() {
  return `<section class="inner-page"><button type="button" class="back-button" data-home>&lt;- Voltar ao inicio</button>
    <div class="page-heading"><div><p class="eyebrow"><span></span>BUSCA</p><h1>ENCONTRE SEU TIME</h1></div><p>Pesquise entre todos os times publicados no catalogo.</p></div>
    <label class="search-box"><span aria-hidden="true">BUSCAR</span><input id="team-search" type="search" placeholder="Digite o nome do time" value="${esc(view.query)}" autocomplete="off" autofocus></label>
    <div class="team-grid">${teamCards(null, view.query)}</div></section>`;
}

function renderTeams() {
  const category = categoryFor(view.categoryId);
  if (!category || category.hidden) return renderHome();
  const groups = groupsFor(category.id);
  return `<section class="inner-page"><button type="button" class="back-button" data-home>&lt;- Voltar para colecoes</button>
    <div class="page-heading"><div><p class="eyebrow"><span></span>${esc(category.accent || "COLECAO")}</p><h1>${esc(category.title)}</h1></div><p>${esc(category.subtitle || "Escolha seu time para ver os modelos.")}</p></div>
    ${groups.length ? `<div class="filter-row" aria-label="Filtrar times por grupo"><button class="filter-chip ${!view.group ? "is-active" : ""}" type="button" data-team-group="">Todos</button>${groups.map(group => `<button class="filter-chip ${view.group === group ? "is-active" : ""}" type="button" data-team-group="${esc(group)}">${esc(group)}</button>`).join("")}</div>` : ""}
    <label class="search-box"><span aria-hidden="true">BUSCAR</span><input id="team-search" type="search" placeholder="Buscar um time" value="${esc(view.query)}" autocomplete="off"></label>
    <div class="team-grid">${teamCards(category.id, view.query, view.group)}</div></section>`;
}

function renderProducts() {
  const team = teamFor(view.teamId);
  if (!team || team.hidden) return renderHome();
  const category = categoryFor(team.categoryId);
  const items = productsFor(team.id);
  return `<section class="inner-page"><button type="button" class="back-button" data-category="${esc(team.categoryId)}">&lt;- Voltar para ${esc(category?.title || "times")}</button>
    <div class="page-heading"><div><p class="eyebrow"><span></span>${esc(category?.title || "COLECAO")}</p><h1>${esc(team.name)}</h1></div><p>Escolha um modelo para abrir fotos, arquivos e o atendimento pelo WhatsApp.</p></div>
    <div class="product-grid">${items.map(product => productCard(product)).join("") || `<div class="album-pending"><span>10</span><h2>Modelos em preparacao</h2><p>Os modelos deste time aparecerao aqui quando forem publicados pelo painel.</p></div>`}</div></section>`;
}

function render() {
  document.title = `${data.settings.storeName || "Camisa 10"} - Catalogo`;
  $("#brand-name").textContent = (data.settings.storeName || "Camisa 10").toUpperCase();
  $("#footer-name").textContent = (data.settings.storeName || "Camisa 10").toUpperCase();
  $("#content").innerHTML = view.name === "teams" ? renderTeams() : view.name === "products" ? renderProducts() : view.name === "search" ? renderSearch() : renderHome();
  const input = $("#team-search");
  $("#home-team-filter")?.addEventListener("change", event => {
    homeFilters.teamId = event.target.value;
    const items = filteredProducts();
    $(".home-product-grid").innerHTML = items.map(product => productCard(product, true)).join("") || `<p class="empty-state">Nenhuma camiseta publicada para este filtro.</p>`;
  });
  if (input) input.addEventListener("input", event => { view.query = event.target.value; $(".team-grid").innerHTML = teamCards(view.name === "search" ? null : view.categoryId, view.query, view.group); });
}

function showDetails(productId) {
  const product = data.products.find(item => item.id === productId);
  if (!product) return;
  const team = teamFor(product.teamKey);
  const dialog = $("#details");
  const photos = (product.images || []).map(media).filter(Boolean);
  const mainImage = photos[0] || "";
  const template = data.settings.whatsappMessage || "Ola! Tenho interesse em {modelo}.";
  const link = `${location.origin}${location.pathname}#${product.id}`;
  const message = template.replaceAll("{time}", team?.name || "").replaceAll("{modelo}", product.name).replaceAll("{referencia}", product.reference || "").replaceAll("{link}", link);
  const whatsapp = String(data.settings.whatsapp || "").replace(/\D/g, "");
  galleryState = { productId, photoIndex: 0, opener: document.activeElement, pointerStart: null };
  dialog.setAttribute("aria-label", `Detalhes de ${product.name}`);
  dialog.innerHTML = `<button class="dialog-close" type="button" aria-label="Fechar detalhes" data-close>&times;</button>
    <div class="dialog-image"><div class="dialog-image-frame" data-gallery-swipe>${mainImage ? `<img id="dialog-main-image" src="${esc(mainImage)}" alt="${esc(product.name)}, foto 1 de ${photos.length}" decoding="async" fetchpriority="high">` : ""}
      ${photos.length > 1 ? `<button class="dialog-arrow dialog-arrow--prev" type="button" aria-label="Ver foto anterior" data-gallery-prev><span aria-hidden="true">&#8249;</span></button><button class="dialog-arrow dialog-arrow--next" type="button" aria-label="Ver próxima foto" data-gallery-next><span aria-hidden="true">&#8250;</span></button>` : ""}
      ${photos.length ? `<span class="dialog-counter" aria-live="polite">1 / ${photos.length}</span>` : ""}</div>
      ${photos.length > 1 ? `<div class="dialog-thumbs" aria-label="Fotos de ${esc(product.name)}">${photos.map((url, index) => `<button type="button" class="${index === 0 ? "is-active" : ""}" data-photo-index="${index}" aria-label="Ver foto ${index + 1} de ${photos.length}" ${index === 0 ? `aria-current="true"` : ""}><img src="${esc(url)}" alt="" loading="lazy" decoding="async"></button>`).join("")}</div>` : ""}</div>
    <div class="dialog-copy"><p class="eyebrow"><span></span>${esc(team?.name || "CAMISA 10")}</p><h2>${esc(product.name)}</h2><p class="dialog-helper">${esc(product.reference || "Consulte disponibilidade e detalhes no atendimento.")}</p>
    ${(product.video?.url || product.pdf?.url) ? `<div class="dialog-media">${product.video?.url ? `<video controls src="${esc(product.video.url)}"></video>` : ""}<div class="dialog-media__actions">${product.pdf?.url ? `<a class="media-link" target="_blank" href="${esc(product.pdf.url)}">Abrir PDF</a>` : ""}</div></div>` : ""}
    ${whatsapp ? `<a class="whatsapp-button" target="_blank" rel="noopener" href="https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}"><span>QUERO ESTE MODELO</span><span>WHATSAPP -&gt;</span></a>` : `<p class="dialog-helper">O WhatsApp sera configurado pelo painel administrativo.</p>`}
    <small>As informacoes e disponibilidade sao confirmadas no atendimento.</small></div>`;
  dialog.showModal();
  preloadAdjacentPhotos();
}

function currentGalleryPhotos() {
  const product = data.products.find(item => item.id === galleryState.productId);
  return (product?.images || []).map(media).filter(Boolean);
}

function preloadAdjacentPhotos() {
  const photos = currentGalleryPhotos();
  if (photos.length < 2) return;
  [-1, 1].forEach(offset => {
    const image = new Image();
    image.src = photos[(galleryState.photoIndex + offset + photos.length) % photos.length];
  });
}

function setDialogPhoto(index, direction = 0) {
  const photos = currentGalleryPhotos();
  const image = $("#dialog-main-image");
  if (!image || !photos.length) return;
  const nextIndex = (index + photos.length) % photos.length;
  if (nextIndex === galleryState.photoIndex && image.src === photos[nextIndex]) return;
  galleryState.photoIndex = nextIndex;
  image.src = photos[nextIndex];
  image.alt = `${data.products.find(item => item.id === galleryState.productId)?.name || "Camiseta"}, foto ${nextIndex + 1} de ${photos.length}`;
  image.classList.remove("slide-next", "slide-prev");
  void image.offsetWidth;
  image.classList.add(direction < 0 ? "slide-prev" : "slide-next");
  const counter = $(".dialog-counter");
  if (counter) counter.textContent = `${nextIndex + 1} / ${photos.length}`;
  document.querySelectorAll(".dialog-thumbs [data-photo-index]").forEach(button => {
    const active = Number(button.dataset.photoIndex) === nextIndex;
    button.classList.toggle("is-active", active);
    active ? button.setAttribute("aria-current", "true") : button.removeAttribute("aria-current");
    if (active) button.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  });
  preloadAdjacentPhotos();
}

function closeDetails() {
  const dialog = $("#details");
  if (dialog.open) dialog.close();
}

document.addEventListener("click", event => {
  const target = event.target.closest("[data-home],[data-explore],[data-search],[data-category],[data-team],[data-product],[data-close],[data-gallery-prev],[data-gallery-next],[data-photo-index],[data-filter-category],[data-filter-group],[data-team-group]");
  if (!target) return;
  if (target.hasAttribute("data-home")) setView("home");
  else if (target.hasAttribute("data-search")) setView("search");
  else if (target.hasAttribute("data-explore")) document.querySelector("#all-products")?.scrollIntoView({ behavior: "smooth" });
  else if (target.hasAttribute("data-filter-category")) { homeFilters = { categoryId: target.dataset.filterCategory, group: "", teamId: "" }; render(); document.querySelector("#all-products")?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  else if (target.hasAttribute("data-filter-group")) { homeFilters.group = target.dataset.filterGroup; homeFilters.teamId = ""; render(); document.querySelector("#all-products")?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  else if (target.hasAttribute("data-team-group")) { view.group = target.dataset.teamGroup; render(); }
  else if (target.dataset.category) setView("teams", { categoryId: target.dataset.category });
  else if (target.dataset.team) setView("products", { teamId: target.dataset.team });
  else if (target.dataset.product) showDetails(target.dataset.product);
  else if (target.hasAttribute("data-close")) closeDetails();
  else if (target.hasAttribute("data-gallery-prev")) setDialogPhoto(galleryState.photoIndex - 1, -1);
  else if (target.hasAttribute("data-gallery-next")) setDialogPhoto(galleryState.photoIndex + 1, 1);
  else if (target.hasAttribute("data-photo-index")) setDialogPhoto(Number(target.dataset.photoIndex), Number(target.dataset.photoIndex) < galleryState.photoIndex ? -1 : 1);
});

document.addEventListener("keydown", event => {
  if (!$("#details").open) return;
  if (event.key === "ArrowLeft") { event.preventDefault(); setDialogPhoto(galleryState.photoIndex - 1, -1); }
  else if (event.key === "ArrowRight") { event.preventDefault(); setDialogPhoto(galleryState.photoIndex + 1, 1); }
});

$("#details").addEventListener("pointerdown", event => {
  if (!event.target.closest("[data-gallery-swipe]") || event.pointerType === "mouse") return;
  galleryState.pointerStart = { x: event.clientX, y: event.clientY };
});

$("#details").addEventListener("pointerup", event => {
  const start = galleryState.pointerStart;
  galleryState.pointerStart = null;
  if (!start || event.pointerType === "mouse") return;
  const deltaX = event.clientX - start.x;
  const deltaY = event.clientY - start.y;
  if (Math.abs(deltaX) > 48 && Math.abs(deltaX) > Math.abs(deltaY)) {
    setDialogPhoto(galleryState.photoIndex + (deltaX < 0 ? 1 : -1), deltaX < 0 ? 1 : -1);
  }
});

$("#details").addEventListener("click", event => {
  if (event.target === $("#details")) closeDetails();
});

$("#details").addEventListener("close", () => {
  const opener = galleryState.opener;
  galleryState = { productId: null, photoIndex: 0, opener: null, pointerStart: null };
  if (opener?.isConnected) opener.focus({ preventScroll: true });
});

async function load() {
  const response = await fetch("/api/catalog");
  if (!response.ok) throw new Error();
  data = await response.json();
  render();
  const requestedProduct = location.hash.slice(1);
  if (requestedProduct && data.products.some(product => product.id === requestedProduct)) showDetails(requestedProduct);
}

load().catch(() => { $("#content").innerHTML = `<section class="inner-page"><div class="album-pending"><span>10</span><h2>Catalogo em preparacao</h2><p>O catalogo ainda esta sendo configurado. Tente novamente em alguns instantes.</p></div></section>`; });
