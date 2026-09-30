const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

let data = { settings: {}, categories: [], teams: [] };
let productsById = new Map();
let discoveryProducts = new Map();
let featuredProducts = [];
let homeCatalog = { items: [], hasMore: false, loading: false, categoryId: "", group: "", teamId: "" };
let discovery = { categoryId: "", group: "", teamId: "", items: [], loading: false, request: 0, pointerStart: null };
let view = { name: "home", categoryId: "", teamId: "", group: "", query: "", items: [], loading: false };
let searchTimer = 0;
let homeRequest = 0;
let searchRequest = 0;
let autoplayTimer = 0;
let galleryState = { productId: null, photoIndex: 0, opener: null, pointerStart: null };

const esc = value => String(value ?? "").replace(/[&<>\"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
const ordered = list => [...list].sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || (a.order || 0) - (b.order || 0));
const media = file => typeof file === "string" ? file : (file?.url || "");
const categoryFor = id => data.categories.find(category => category.id === id);
const teamFor = id => data.teams.find(team => team.id === id);
const visibleCategories = () => ordered(data.categories.filter(category => !category.hidden));
const initials = name => String(name || "10").split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase();
const teamsFor = (categoryId, group = "") => ordered(data.teams.filter(team => !team.hidden && (!categoryId || team.categoryId === categoryId) && (!group || team.group === group)));
const groupsFor = categoryId => [...new Set(data.teams.filter(team => !team.hidden && team.categoryId === categoryId && team.group).map(team => team.group))].sort((a, b) => a.localeCompare(b, "pt-BR"));
const productForTeam = teamId => [...productsById.values()].find(product => product.teamKey === teamId);
const presentationFor = team => team?.showcaseImage || team?.fallbackImage || productForTeam(team?.id)?.images?.[0] || null;
const pageSize = () => Math.min(48, Math.max(8, Number(data.settings.catalogPageSize) || 24));

function mergeProducts(items = []) {
  items.forEach(product => productsById.set(product.id, product));
  return items;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  let payload = {};
  try { payload = await response.json(); } catch {}
  if (!response.ok) throw new Error(payload.error || "Nao foi possivel carregar o catalogo.");
  return payload;
}

async function fetchProducts(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== "" && value !== null && value !== undefined) query.set(key, value);
  });
  const payload = await fetchJson("/api/catalog/products?" + query.toString(), { cache: "no-store" });
  payload.items = mergeProducts(payload.items || []);
  return payload;
}

function productCard(product, showContext = false) {
  const image = media(product.images?.[0]);
  const team = teamFor(product.teamKey);
  const category = categoryFor(team?.categoryId);
  const context = showContext ? [category?.title, team?.group, team?.name].filter(Boolean).join(" / ") : product.reference || "MODELO DISPONIVEL";
  return '<button class="product-card" type="button" data-product="' + esc(product.id) + '">' +
    '<span class="product-card__image">' + (image ? '<img src="' + esc(image) + '" alt="' + esc(product.name) + '" loading="lazy" decoding="async">' : "") + '</span>' +
    '<span class="product-card__copy"><small>' + esc(context) + '</small><strong>' + esc(product.name) + '</strong><span>Ver fotos e solicitar</span></span></button>';
}

function categoryCard(category) {
  const count = teamsFor(category.id).length;
  return '<button class="category-card" type="button" data-category="' + esc(category.id) + '">' +
    '<span class="category-card__top"><span>' + esc(category.accent || "ESPORTE") + '</span><b>' + esc(String(category.number || "").padStart(2, "0")) + '</b></span>' +
    '<span class="category-card__ball" aria-hidden="true">10</span><span class="category-card__copy"><strong>' + esc(category.title) + '</strong><small>' + esc(category.subtitle || count + " equipes disponiveis") + '</small></span><span class="category-card__arrow" aria-hidden="true">-&gt;</span></button>';
}

function teamCard(team) {
  const image = media(presentationFor(team));
  return '<button class="team-card" type="button" data-team="' + esc(team.id) + '">' +
    (image ? '<img class="team-card__image" src="' + esc(image) + '" alt="" loading="lazy">' : '<span class="team-card__monogram">' + esc(initials(team.name)) + '</span>') +
    '<span><strong>' + esc(team.name) + '</strong><small>' + esc([categoryFor(team.categoryId)?.title, team.group].filter(Boolean).join(" / ")) + '</small></span><span aria-hidden="true">-&gt;</span></button>';
}

function productGrid(items, emptyMessage) {
  if (!items.length) return '<div class="album-pending"><span>10</span><h2>Nenhum modelo publicado</h2><p>' + esc(emptyMessage) + '</p></div>';
  return items.map(product => productCard(product, true)).join("");
}

function teamVisual(team, index, activeIndex, length, visualOffset) {
  const image = media(presentationFor(team));
  let distance = Math.abs(index - activeIndex);
  distance = Math.min(distance, length - distance);
  const className = index === activeIndex ? "is-active" : (distance === 1 ? "is-near" : "is-far");
  const colors = '--offset:' + Number(visualOffset || 0) + ';--team-primary:' + esc(team.primaryColor || "#d1a656") + ';--team-secondary:' + esc(team.secondaryColor || "#101210");
  return '<button class="team-carousel__item ' + className + '" type="button" style="' + colors + '" data-discovery-team="' + esc(team.id) + '" data-discovery-index="' + index + '" aria-label="Selecionar ' + esc(team.name) + '">' +
    '<span class="team-carousel__art">' + (image ? '<img src="' + esc(image) + '" alt="" loading="lazy" decoding="async">' : '<span class="team-carousel__fallback">' + esc(initials(team.name)) + '</span>') +
    '</span><strong>' + esc(team.name) + '</strong></button>';
}

function carouselDots(teams, activeIndex) {
  if (data.settings.carouselShowDots === false) return "";
  const start = Math.max(0, Math.min(teams.length - 7, activeIndex - 3));
  return '<div class="team-carousel__dots" aria-label="Posicao no carrossel">' +
    teams.slice(start, start + 7).map((team, localIndex) => {
      const index = start + localIndex;
      return '<button class="' + (index === activeIndex ? "is-active" : "") + '" type="button" data-discovery-index="' + index + '" aria-label="Selecionar ' + esc(team.name) + '"></button>';
    }).join("") + '<span>' + (activeIndex + 1) + ' / ' + teams.length + '</span></div>';
}

function renderDiscovery() {
  const categories = visibleCategories();
  const categoryId = discovery.categoryId || categories[0]?.id || "";
  const groups = groupsFor(categoryId);
  const teams = teamsFor(categoryId, discovery.group);
  const activeIndex = Math.max(0, teams.findIndex(team => team.id === discovery.teamId));
  const activeTeam = teams[activeIndex] || null;
  const categoryButtons = categories.map(category => '<button class="filter-chip ' + (category.id === categoryId ? "is-active" : "") + '" type="button" data-discovery-category="' + esc(category.id) + '">' + esc(category.title) + '</button>').join("");
  const groupButtons = groups.map(group => '<button class="league-tab ' + (group === discovery.group ? "is-active" : "") + '" type="button" data-discovery-group="' + esc(group) + '">' + esc(group) + '</button>').join("");

  if (!teams.length) {
    return '<section class="catalog-section team-discovery"><div class="section-heading"><div><p class="eyebrow"><span></span>NAVEGACAO VISUAL</p><h2>ENCONTRE SUA<br>EQUIPE</h2></div><p>Escolha um esporte e uma liga.</p></div><div class="filter-row">' + categoryButtons + '</div><div class="album-pending"><span>10</span><h2>Equipes em preparacao</h2><p>Nenhuma equipe visivel foi cadastrada nesta liga.</p></div></section>';
  }

  const offsets = Array.from({ length: Math.min(5, teams.length) }, (_, index) => index - Math.floor(Math.min(5, teams.length) / 2));
  const used = new Set();
  const visibleItems = offsets.map(offset => {
    const index = (activeIndex + offset + teams.length) % teams.length;
    if (used.has(index)) return "";
    used.add(index);
    return teamVisual(teams[index], index, activeIndex, teams.length, offset);
  }).join("");
  const logo = media(activeTeam?.logoImage);
  const selectedProducts = discovery.loading
    ? '<div class="catalog-loading" role="status"><span></span><p>Carregando camisas de ' + esc(activeTeam?.name || "equipe") + '...</p></div>'
    : productGrid(discovery.items, "Os modelos desta equipe aparecerao aqui quando forem publicados.");

  return '<section class="catalog-section team-discovery" id="team-discovery"><div class="section-heading"><div><p class="eyebrow"><span></span>NAVEGACAO VISUAL</p><h2>ESCOLHA O ESPORTE.<br>ENCONTRE SUA EQUIPE.</h2></div><p>Selecione o esporte, a liga e passe as equipes para ver seus modelos.</p></div>' +
    '<div class="filter-row discovery-sports" aria-label="Escolher esporte">' + categoryButtons + '</div>' +
    '<div class="discovery-leagues"><h3>ESCOLHA A LIGA</h3><div class="league-tabs">' + (groupButtons || '<span class="league-tab is-active">Todas as equipes</span>') + '</div></div>' +
    '<div class="team-carousel" tabindex="0" data-team-carousel style="--active-primary:' + esc(activeTeam?.primaryColor || "#d1a656") + ';--active-secondary:' + esc(activeTeam?.secondaryColor || "#101210") + '">' +
    (logo ? '<img class="team-carousel__logo" src="' + esc(logo) + '" alt="">' : "") +
    '<button class="team-carousel__arrow team-carousel__arrow--prev" type="button" data-discovery-prev aria-label="Equipe anterior"><span>&#8249;</span></button>' +
    '<div class="team-carousel__stage">' + visibleItems + '</div>' +
    '<button class="team-carousel__arrow team-carousel__arrow--next" type="button" data-discovery-next aria-label="Proxima equipe"><span>&#8250;</span></button>' +
    carouselDots(teams, activeIndex) + '</div>' +
    '<div class="team-carousel__selection"><div><p class="eyebrow"><span></span>EQUIPE SELECIONADA</p><h3>' + esc(activeTeam?.name || "") + '</h3><p>' + (discovery.loading ? "Consultando modelos..." : discovery.items.length + " modelo(s) carregado(s)") + '</p></div><button class="primary-button" type="button" data-discovery-products><span>VER CAMISAS</span><span>-&gt;</span></button></div>' +
    '<div class="selected-team-products" id="selected-team-products"><div class="section-heading section-heading--compact"><div><p class="eyebrow"><span></span>CATALOGO DA EQUIPE</p><h2>CAMISAS DO ' + esc(activeTeam?.name || "").toUpperCase() + '</h2></div></div><div class="product-grid">' + selectedProducts + '</div><div class="load-more-row"><button type="button" class="secondary-catalog-button" data-team="' + esc(activeTeam.id) + '">VER TODOS OS MODELOS DA EQUIPE</button></div></div></section>';
}

function renderHome() {
  const categories = visibleCategories();
  const categoryFilters = categories.map(category => '<button class="filter-chip ' + (homeCatalog.categoryId === category.id ? "is-active" : "") + '" type="button" data-browse-category="' + esc(category.id) + '">' + esc(category.title) + '</button>').join("");
  const groups = homeCatalog.categoryId ? groupsFor(homeCatalog.categoryId) : [];
  const groupFilters = groups.map(group => '<button class="filter-chip ' + (homeCatalog.group === group ? "is-active" : "") + '" type="button" data-browse-group="' + esc(group) + '">' + esc(group) + '</button>').join("");
  const filterTeams = teamsFor(homeCatalog.categoryId, homeCatalog.group);
  const teamOptions = filterTeams.map(team => '<option value="' + esc(team.id) + '" ' + (homeCatalog.teamId === team.id ? "selected" : "") + '>' + esc(team.name) + '</option>').join("");
  const browseContent = homeCatalog.loading && !homeCatalog.items.length
    ? '<div class="catalog-loading"><span></span><p>Carregando camisetas...</p></div>'
    : productGrid(homeCatalog.items, "Nenhuma camiseta foi encontrada para este filtro.");

  return '<section class="hero hero--copy-only"><div class="hero-copy"><p class="eyebrow"><span></span>CATALOGO CAMISA 10</p><h1>' + esc(data.settings.catalogTitle || "Seu time. Sua camisa.") + '</h1><p>' + esc(data.settings.introText || "Veja os modelos em destaque ou encontre sua equipe.") + '</p><button class="primary-button" type="button" data-explore><span>EXPLORAR EQUIPES</span><span>-&gt;</span></button><p class="hero-note">Atendimento e pedidos pelo WhatsApp.</p></div></section>' +
    (featuredProducts.length ? '<section class="catalog-section showcase-section"><div class="section-heading"><div><p class="eyebrow"><span></span>ESCOLHIDAS PELA LOJA</p><h2>DESTAQUES</h2></div><p>Os modelos marcados pelo painel aparecem primeiro.</p></div><div class="product-grid">' + featuredProducts.map(product => productCard(product, true)).join("") + '</div></section>' : "") +
    renderDiscovery() +
    '<section id="all-products" class="catalog-section"><div class="section-heading"><div><p class="eyebrow"><span></span>CATALOGO COMPLETO</p><h2>TODAS AS<br>CAMISETAS</h2></div><p>Veja os primeiros modelos ou filtre pelo esporte, liga e equipe.</p></div><div class="filter-row"><button class="filter-chip ' + (!homeCatalog.categoryId ? "is-active" : "") + '" type="button" data-browse-category="">Todos</button>' + categoryFilters + '</div>' +
    (groups.length ? '<div class="filter-row filter-row--sub"><span>LIGA OU COLECAO</span><button class="filter-chip ' + (!homeCatalog.group ? "is-active" : "") + '" type="button" data-browse-group="">Todas</button>' + groupFilters + '</div>' : "") +
    '<label class="team-filter">EQUIPE<select id="home-team-filter"><option value="">Todas as equipes</option>' + teamOptions + '</select></label><div class="product-grid home-product-grid">' + browseContent + '</div>' +
    (homeCatalog.hasMore ? '<div class="load-more-row"><button class="secondary-catalog-button" type="button" data-load-more ' + (homeCatalog.loading ? "disabled" : "") + '>' + (homeCatalog.loading ? "CARREGANDO..." : "CARREGAR MAIS CAMISAS") + '</button></div>' : "") + '</section>' +
    '<section class="catalog-section"><div class="section-heading"><div><p class="eyebrow"><span></span>TODOS OS ESPORTES</p><h2>EXPLORE AS<br>COLECOES</h2></div><p>Abra um esporte para pesquisar todas as suas equipes.</p></div><div class="category-grid">' + categories.map(categoryCard).join("") + '</div></section>';
}

function renderSearch() {
  const normalized = view.query.trim().toLocaleLowerCase("pt-BR");
  const teams = data.teams.filter(team => !team.hidden && (!normalized || (team.name + " " + (team.group || "") + " " + (categoryFor(team.categoryId)?.title || "")).toLocaleLowerCase("pt-BR").includes(normalized)));
  const productContent = view.loading
    ? '<div class="catalog-loading"><span></span><p>Pesquisando...</p></div>'
    : productGrid(view.items, normalized ? "Nenhuma camiseta encontrada." : "Digite pelo menos dois caracteres para procurar camisetas.");
  return '<section class="inner-page"><button type="button" class="back-button" data-home>&lt;- Voltar ao inicio</button><div class="page-heading"><div><p class="eyebrow"><span></span>BUSCA</p><h1>ENCONTRE SUA EQUIPE OU CAMISA</h1></div><p>Pesquise por esporte, liga, equipe, modelo ou referencia.</p></div><label class="search-box"><span>BUSCAR</span><input id="team-search" type="search" placeholder="Digite para pesquisar" value="' + esc(view.query) + '" autocomplete="off" autofocus></label><div class="search-results"><section><h2>EQUIPES</h2><div class="team-grid">' + (teams.map(teamCard).join("") || '<p class="empty-state">Nenhuma equipe encontrada.</p>') + '</div></section><section><h2>CAMISETAS</h2><div class="product-grid">' + productContent + '</div></section></div></section>';
}

function renderTeams() {
  const category = categoryFor(view.categoryId);
  if (!category || category.hidden) return renderHome();
  const groups = groupsFor(category.id);
  const teams = teamsFor(category.id, view.group || "");
  return '<section class="inner-page"><button type="button" class="back-button" data-home>&lt;- Voltar ao inicio</button><div class="page-heading"><div><p class="eyebrow"><span></span>' + esc(category.accent || "ESPORTE") + '</p><h1>' + esc(category.title) + '</h1></div><p>' + esc(category.subtitle || "Escolha sua equipe para ver os modelos.") + '</p></div>' +
    (groups.length ? '<div class="filter-row"><button class="filter-chip ' + (!view.group ? "is-active" : "") + '" type="button" data-team-group="">Todas</button>' + groups.map(group => '<button class="filter-chip ' + (view.group === group ? "is-active" : "") + '" type="button" data-team-group="' + esc(group) + '">' + esc(group) + '</button>').join("") + '</div>' : "") +
    '<div class="team-grid">' + (teams.map(teamCard).join("") || '<p class="empty-state">Nenhuma equipe encontrada neste esporte.</p>') + '</div></section>';
}

function renderProducts() {
  const team = teamFor(view.teamId);
  if (!team || team.hidden) return renderHome();
  const category = categoryFor(team.categoryId);
  const content = view.loading ? '<div class="catalog-loading"><span></span><p>Carregando modelos...</p></div>' : productGrid(view.items, "Os modelos desta equipe aparecerao aqui quando forem publicados.");
  return '<section class="inner-page"><button type="button" class="back-button" data-category="' + esc(team.categoryId) + '">&lt;- Voltar para ' + esc(category?.title || "equipes") + '</button><div class="page-heading"><div><p class="eyebrow"><span></span>' + esc([category?.title, team.group].filter(Boolean).join(" / ")) + '</p><h1>' + esc(team.name) + '</h1></div><p>Escolha um modelo para abrir todas as fotos e solicitar pelo WhatsApp.</p></div><div class="product-grid">' + content + '</div>' + (view.hasMore ? '<div class="load-more-row"><button type="button" class="secondary-catalog-button" data-team-more ' + (view.loading ? 'disabled' : '') + '>CARREGAR MAIS MODELOS</button></div>' : '') + '</section>';
}

function render() {
  const focused = document.activeElement;
  const searchFocus = focused?.id === "team-search" ? { start: focused.selectionStart, end: focused.selectionEnd } : null;
  document.title = (data.settings.storeName || "Camisa 10") + " - Catalogo";
  $("#brand-name").textContent = (data.settings.storeName || "Camisa 10").toUpperCase();
  $("#footer-name").textContent = (data.settings.storeName || "Camisa 10").toUpperCase();
  $("#content").innerHTML = view.name === "search" ? renderSearch() : view.name === "teams" ? renderTeams() : view.name === "products" ? renderProducts() : renderHome();
  if (searchFocus && $("#team-search")) {
    $("#team-search").focus({ preventScroll: true });
    $("#team-search").setSelectionRange(searchFocus.start, searchFocus.end);
  }
  const headerSearch = $("#header-search-input");
  if (headerSearch && document.activeElement !== headerSearch) headerSearch.value = view.name === "search" ? view.query : "";
  scheduleAutoplay();
}

function setView(name, extra = {}) {
  view = { name, categoryId: "", teamId: "", group: "", query: "", items: [], loading: false, ...extra };
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function loadHomeCatalog(append = false) {
  if (append && homeCatalog.loading) return;
  const request = ++homeRequest;
  const offset = append ? homeCatalog.items.length : 0;
  homeCatalog.loading = true;
  if (!append) homeCatalog.items = [];
  render();
  try {
    const page = await fetchProducts({ categoryId: homeCatalog.categoryId, group: homeCatalog.group, teamId: homeCatalog.teamId, limit: pageSize(), offset });
    if (request !== homeRequest) return;
    homeCatalog.items = append ? [...homeCatalog.items, ...page.items] : page.items;
    homeCatalog.hasMore = page.hasMore;
  } catch {
    if (request !== homeRequest) return;
    homeCatalog.hasMore = false;
  } finally {
    if (request !== homeRequest) return;
    homeCatalog.loading = false;
    render();
  }
}

async function loadDiscoveryTeam(teamId, scroll = false) {
  const request = ++discovery.request;
  discovery.teamId = teamId;
  discovery.loading = true;
  discovery.items = [];
  render();
  if (discoveryProducts.has(teamId)) {
    discovery.items = discoveryProducts.get(teamId);
    discovery.loading = false;
    render();
    if (scroll) $("#selected-team-products")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  try {
    const page = await fetchProducts({ teamId, limit: 48, offset: 0 });
    if (request !== discovery.request) return;
    discovery.items = page.items;
    discoveryProducts.set(teamId, page.items);
  } catch {
    if (request !== discovery.request) return;
    discovery.items = [];
  } finally {
    if (request === discovery.request) {
      discovery.loading = false;
      render();
      if (scroll) $("#selected-team-products")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
}

async function changeDiscoveryScope(categoryId, group = "") {
  discovery.request++;
  discovery.categoryId = categoryId;
  const groups = groupsFor(categoryId);
  discovery.group = group && groups.includes(group) ? group : (groups[0] || "");
  const first = teamsFor(discovery.categoryId, discovery.group)[0];
  discovery.teamId = first?.id || "";
  discovery.items = [];
  if (first) await loadDiscoveryTeam(first.id);
  else render();
}

async function openTeamProducts(teamId, append = false) {
  if (append && view.loading) return;
  if (!append) view = { name: "products", categoryId: "", teamId, group: "", query: "", items: [], loading: false };
  const targetView = view;
  targetView.loading = true;
  render();
  if (!append) window.scrollTo({ top: 0, behavior: "smooth" });
  try {
    const page = await fetchProducts({ teamId, limit: 48, offset: append ? targetView.items.length : 0 });
    if (view !== targetView) return;
    targetView.items = append ? [...targetView.items, ...page.items] : page.items;
    targetView.hasMore = page.hasMore;
  } catch { if (view !== targetView) return; }
  targetView.loading = false;
  render();
}

async function performSearch(query) {
  if (view.name !== "search" || view.query !== query) return;
  const request = ++searchRequest;
  const targetView = view;
  view.query = query;
  if (query.trim().length < 2) { view.items = []; view.loading = false; render(); return; }
  view.loading = true;
  render();
  try {
    const page = await fetchProducts({ query: query.trim(), limit: 24, offset: 0 });
    if (request !== searchRequest || view !== targetView || view.query !== query) return;
    view.items = page.items;
  }
  catch { if (request !== searchRequest || view !== targetView || view.query !== query) return; view.items = []; }
  view.loading = false;
  if (view.name === "search" && view.query === query) render();
}

function scheduleAutoplay() {
  clearTimeout(autoplayTimer);
  const teams = teamsFor(discovery.categoryId, discovery.group);
  if (view.name !== "home" || !data.settings.carouselAutoplay || teams.length < 2 || $("#details").open) return;
  const delay = Math.min(15, Math.max(3, Number(data.settings.carouselInterval) || 6)) * 1000;
  autoplayTimer = setTimeout(() => {
    const index = Math.max(0, teams.findIndex(team => team.id === discovery.teamId));
    loadDiscoveryTeam(teams[(index + 1) % teams.length].id);
  }, delay);
}

async function showDetails(productId) {
  let product = productsById.get(productId);
  if (!product) {
    try { product = (await fetchProducts({ id: productId, limit: 1 })).items[0]; } catch {}
  }
  if (!product) return;
  const team = teamFor(product.teamKey);
  const photos = (product.images || []).map(media).filter(Boolean);
  const template = data.settings.whatsappMessage || "Ola! Tenho interesse em {modelo}.";
  const link = location.origin + location.pathname + "#" + product.id;
  const message = template.replaceAll("{time}", team?.name || "").replaceAll("{modelo}", product.name).replaceAll("{referencia}", product.reference || "").replaceAll("{link}", link);
  const whatsapp = String(data.settings.whatsapp || "").replace(/\D/g, "");
  galleryState = { productId, photoIndex: 0, opener: document.activeElement, pointerStart: null };
  const dialog = $("#details");
  dialog.setAttribute("aria-label", "Detalhes de " + product.name);
  dialog.innerHTML = '<button class="dialog-close" type="button" aria-label="Fechar detalhes" data-close>&times;</button><div class="dialog-image"><div class="dialog-image-frame" data-gallery-swipe>' +
    (photos[0] ? '<img id="dialog-main-image" src="' + esc(photos[0]) + '" alt="' + esc(product.name) + ', foto 1 de ' + photos.length + '" decoding="async" fetchpriority="high">' : "") +
    (photos.length > 1 ? '<button class="dialog-arrow dialog-arrow--prev" type="button" aria-label="Foto anterior" data-gallery-prev><span>&#8249;</span></button><button class="dialog-arrow dialog-arrow--next" type="button" aria-label="Proxima foto" data-gallery-next><span>&#8250;</span></button>' : "") +
    (photos.length ? '<span class="dialog-counter">1 / ' + photos.length + '</span>' : "") + '</div>' +
    (photos.length > 1 ? '<div class="dialog-thumbs">' + photos.map((url, index) => '<button type="button" class="' + (index === 0 ? "is-active" : "") + '" data-photo-index="' + index + '"><img src="' + esc(url) + '" alt="" loading="lazy"></button>').join("") + '</div>' : "") + '</div>' +
    '<div class="dialog-copy"><p class="eyebrow"><span></span>' + esc(team?.name || "CAMISA 10") + '</p><h2>' + esc(product.name) + '</h2><p class="dialog-helper">' + esc(product.reference || "Consulte disponibilidade e detalhes no atendimento.") + '</p>' +
    ((product.video?.url || product.pdf?.url) ? '<div class="dialog-media">' + (product.video?.url ? '<video controls src="' + esc(product.video.url) + '"></video>' : "") + '<div class="dialog-media__actions">' + (product.pdf?.url ? '<a class="media-link" target="_blank" href="' + esc(product.pdf.url) + '">Abrir PDF</a>' : "") + '</div></div>' : "") +
    (whatsapp ? '<a class="whatsapp-button" target="_blank" rel="noopener" href="https://wa.me/' + whatsapp + '?text=' + encodeURIComponent(message) + '"><span>QUERO ESTE MODELO</span><span>WHATSAPP -&gt;</span></a>' : '<p class="dialog-helper">O WhatsApp sera configurado pelo painel.</p>') + '<small>As informacoes e disponibilidade sao confirmadas no atendimento.</small></div>';
  dialog.showModal();
  clearTimeout(autoplayTimer);
  preloadAdjacentPhotos();
}

function currentGalleryPhotos() {
  return (productsById.get(galleryState.productId)?.images || []).map(media).filter(Boolean);
}

function preloadAdjacentPhotos() {
  const photos = currentGalleryPhotos();
  if (photos.length < 2) return;
  [-1, 1].forEach(offset => { const image = new Image(); image.src = photos[(galleryState.photoIndex + offset + photos.length) % photos.length]; });
}

function setDialogPhoto(index, direction = 0) {
  const photos = currentGalleryPhotos();
  const image = $("#dialog-main-image");
  if (!image || !photos.length) return;
  const next = (index + photos.length) % photos.length;
  galleryState.photoIndex = next;
  image.src = photos[next];
  image.alt = (productsById.get(galleryState.productId)?.name || "Camiseta") + ", foto " + (next + 1) + " de " + photos.length;
  image.classList.remove("slide-next", "slide-prev");
  void image.offsetWidth;
  image.classList.add(direction < 0 ? "slide-prev" : "slide-next");
  const counter = $(".dialog-counter");
  if (counter) counter.textContent = (next + 1) + " / " + photos.length;
  $$(".dialog-thumbs [data-photo-index]").forEach(button => {
    const active = Number(button.dataset.photoIndex) === next;
    button.classList.toggle("is-active", active);
    if (active) button.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  });
  preloadAdjacentPhotos();
}

function closeDetails() {
  if ($("#details").open) $("#details").close();
}

document.addEventListener("click", async event => {
  if (event.target.closest("[data-team-more]")) { await openTeamProducts(view.teamId, true); return; }
  const target = event.target.closest("[data-home],[data-explore],[data-category],[data-team],[data-product],[data-close],[data-gallery-prev],[data-gallery-next],[data-photo-index],[data-browse-category],[data-browse-group],[data-team-group],[data-discovery-category],[data-discovery-group],[data-discovery-team],[data-discovery-index],[data-discovery-prev],[data-discovery-next],[data-discovery-products],[data-load-more]");
  if (!target) return;
  if (target.hasAttribute("data-home")) setView("home");
  else if (target.hasAttribute("data-explore")) $("#team-discovery")?.scrollIntoView({ behavior: "smooth" });
  else if (target.hasAttribute("data-browse-category")) {
    homeCatalog.categoryId = target.dataset.browseCategory;
    homeCatalog.group = "";
    homeCatalog.teamId = "";
    await loadHomeCatalog();
    $("#all-products")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (target.hasAttribute("data-browse-group")) {
    homeCatalog.group = target.dataset.browseGroup;
    homeCatalog.teamId = "";
    await loadHomeCatalog();
  } else if (target.hasAttribute("data-team-group")) {
    view.group = target.dataset.teamGroup;
    render();
  } else if (target.hasAttribute("data-discovery-category")) await changeDiscoveryScope(target.dataset.discoveryCategory);
  else if (target.hasAttribute("data-discovery-group")) await changeDiscoveryScope(discovery.categoryId, target.dataset.discoveryGroup);
  else if (target.hasAttribute("data-discovery-team")) await loadDiscoveryTeam(target.dataset.discoveryTeam);
  else if (target.hasAttribute("data-discovery-index")) {
    const teams = teamsFor(discovery.categoryId, discovery.group);
    if (teams[Number(target.dataset.discoveryIndex)]) await loadDiscoveryTeam(teams[Number(target.dataset.discoveryIndex)].id);
  } else if (target.hasAttribute("data-discovery-prev") || target.hasAttribute("data-discovery-next")) {
    const teams = teamsFor(discovery.categoryId, discovery.group);
    const index = Math.max(0, teams.findIndex(team => team.id === discovery.teamId));
    const direction = target.hasAttribute("data-discovery-prev") ? -1 : 1;
    if (teams.length) await loadDiscoveryTeam(teams[(index + direction + teams.length) % teams.length].id);
  } else if (target.hasAttribute("data-discovery-products")) $("#selected-team-products")?.scrollIntoView({ behavior: "smooth", block: "start" });
  else if (target.hasAttribute("data-load-more")) await loadHomeCatalog(true);
  else if (target.dataset.category) setView("teams", { categoryId: target.dataset.category });
  else if (target.dataset.team) await openTeamProducts(target.dataset.team);
  else if (target.dataset.product) await showDetails(target.dataset.product);
  else if (target.hasAttribute("data-close")) closeDetails();
  else if (target.hasAttribute("data-gallery-prev")) setDialogPhoto(galleryState.photoIndex - 1, -1);
  else if (target.hasAttribute("data-gallery-next")) setDialogPhoto(galleryState.photoIndex + 1, 1);
  else if (target.hasAttribute("data-photo-index")) setDialogPhoto(Number(target.dataset.photoIndex), Number(target.dataset.photoIndex) < galleryState.photoIndex ? -1 : 1);
});

document.addEventListener("change", async event => {
  if (event.target.id !== "home-team-filter") return;
  homeCatalog.teamId = event.target.value;
  await loadHomeCatalog();
});

document.addEventListener("input", event => {
  if (!["header-search-input", "team-search"].includes(event.target.id)) return;
  clearTimeout(searchTimer);
  const query = event.target.value;
  if (view.name !== "search") view = { name: "search", categoryId: "", teamId: "", group: "", query, items: [], loading: false };
  else view.query = query;
  render();
  const activeInput = $("#team-search") || $("#header-search-input");
  activeInput?.focus();
  activeInput?.setSelectionRange(query.length, query.length);
  searchTimer = setTimeout(() => performSearch(query), 280);
});

document.addEventListener("keydown", event => {
  if ($("#details").open) {
    if (event.key === "ArrowLeft") { event.preventDefault(); setDialogPhoto(galleryState.photoIndex - 1, -1); }
    if (event.key === "ArrowRight") { event.preventDefault(); setDialogPhoto(galleryState.photoIndex + 1, 1); }
    return;
  }
  if (view.name === "home" && event.target.closest("[data-team-carousel]") && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
    event.preventDefault();
    const teams = teamsFor(discovery.categoryId, discovery.group);
    const index = Math.max(0, teams.findIndex(team => team.id === discovery.teamId));
    if (teams.length) loadDiscoveryTeam(teams[(index + (event.key === "ArrowLeft" ? -1 : 1) + teams.length) % teams.length].id);
  }
});

document.addEventListener("pointerdown", event => {
  if (event.pointerType === "mouse") return;
  if (event.target.closest("[data-team-carousel]")) discovery.pointerStart = { x: event.clientX, y: event.clientY };
  if (event.target.closest("[data-gallery-swipe]")) galleryState.pointerStart = { x: event.clientX, y: event.clientY };
});

document.addEventListener("pointerup", event => {
  if (event.pointerType === "mouse") return;
  const carouselStart = discovery.pointerStart;
  discovery.pointerStart = null;
  if (carouselStart) {
    const dx = event.clientX - carouselStart.x;
    const dy = event.clientY - carouselStart.y;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) {
      const teams = teamsFor(discovery.categoryId, discovery.group);
      const index = Math.max(0, teams.findIndex(team => team.id === discovery.teamId));
      if (teams.length) loadDiscoveryTeam(teams[(index + (dx < 0 ? 1 : -1) + teams.length) % teams.length].id);
    }
  }
  const galleryStart = galleryState.pointerStart;
  galleryState.pointerStart = null;
  if (galleryStart) {
    const dx = event.clientX - galleryStart.x;
    const dy = event.clientY - galleryStart.y;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) setDialogPhoto(galleryState.photoIndex + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
  }
});

$("#details").addEventListener("click", event => { if (event.target === $("#details")) closeDetails(); });
$("#details").addEventListener("close", () => {
  const opener = galleryState.opener;
  galleryState = { productId: null, photoIndex: 0, opener: null, pointerStart: null };
  if (opener?.isConnected) opener.focus({ preventScroll: true });
  scheduleAutoplay();
});

async function load() {
  const bootstrap = await fetchJson("/api/catalog/bootstrap", { cache: "no-store" });
  data = { settings: bootstrap.settings || {}, categories: bootstrap.categories || [], teams: bootstrap.teams || [] };
  const categories = visibleCategories();
  discovery.categoryId = data.settings.initialCategoryId && categories.some(category => category.id === data.settings.initialCategoryId) ? data.settings.initialCategoryId : (categories[0]?.id || "");
  const groups = groupsFor(discovery.categoryId);
  discovery.group = data.settings.initialGroup && groups.includes(data.settings.initialGroup) ? data.settings.initialGroup : (groups[0] || "");
  discovery.teamId = teamsFor(discovery.categoryId, discovery.group)[0]?.id || "";
  const jobs = [
    fetchProducts({ featured: 1, limit: 8, offset: 0 }).then(page => { featuredProducts = page.items; }),
    fetchProducts({ limit: pageSize(), offset: 0 }).then(page => { homeCatalog.items = page.items; homeCatalog.hasMore = page.hasMore; })
  ];
  if (discovery.teamId) jobs.push(fetchProducts({ teamId: discovery.teamId, limit: 48, offset: 0 }).then(page => {
    discovery.items = page.items;
    discoveryProducts.set(discovery.teamId, page.items);
  }));
  await Promise.all(jobs);
  render();
  const requestedProduct = location.hash.slice(1);
  if (requestedProduct) await showDetails(requestedProduct);
}

load().catch(error => {
  $("#content").innerHTML = '<section class="inner-page"><div class="album-pending"><span>10</span><h2>Catalogo temporariamente indisponivel</h2><p>' + esc(error.message || "Tente novamente em alguns instantes.") + '</p></div></section>';
});
