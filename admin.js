const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
let state = { settings: {}, categories: [], teams: [], products: [] };
let currentSection = "overview";
let carouselFilters = { categoryId: "", group: "" };

const esc = value => String(value ?? "").replace(/[&<>\"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
const ordered = list => [...list].sort((a, b) => (a.order || 0) - (b.order || 0));
const makeId = prefix => `${prefix}-${crypto.randomUUID()}`;
const teamFor = id => state.teams.find(team => team.id === id);
const categoryFor = id => state.categories.find(category => category.id === id);
const initials = name => String(name || "10").split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase();
const mediaUrl = file => typeof file === "string" ? file : (file?.url || "");
const groupsForCategory = categoryId => [...new Set(state.teams.filter(team => team.categoryId === categoryId && team.group).map(team => team.group))].sort((a, b) => a.localeCompare(b, "pt-BR"));
const productImageForTeam = teamId => state.products.find(product => product.teamKey === teamId && product.images?.length)?.images?.[0] || null;
const presentationFor = team => team.showcaseImage || productImageForTeam(team.id);

function authHeaders(json = true) {
  const headers = {};
  if ($("#password").value) headers["x-admin-password"] = $("#password").value;
  if (json) headers["content-type"] = "application/json";
  return headers;
}

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: "same-origin", ...options, headers: { ...authHeaders(options.body instanceof FormData ? false : true), ...(options.headers || {}) } });
  let payload = {};
  try { payload = await response.json(); } catch {}
  if (!response.ok) throw new Error(payload.error || "Nao foi possivel concluir esta acao.");
  return payload;
}

function toast(message, error = false) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.toggle("is-error", error);
  element.classList.add("is-visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("is-visible"), 3200);
}

function showSection(name) {
  currentSection = name;
  $$('[data-panel]').forEach(panel => panel.classList.toggle("is-active", panel.dataset.panel === name));
  $$('[data-section]').forEach(button => button.classList.toggle("is-active", button.dataset.section === name));
  const labels = { overview: "Visao geral", products: "Produtos", teams: "Esportes e equipes", settings: "Configuracoes" };
  $("#topbar-title").textContent = labels[name] || labels.overview;
  $("#sidebar").classList.remove("is-open");
}

function fillSelects() {
  const teamCategoryValue = $("#team-form select[name=categoryId]").value;
  const settingsCategoryValue = $("#settings-form select[name=initialCategoryId]").value;
  const categoryOptions = ordered(state.categories).map(category => `<option value="${esc(category.id)}">${esc(category.title)}</option>`).join("");
  const teamOptions = ordered(state.teams).map(team => {
    const label = [categoryFor(team.categoryId)?.title, team.group, team.name].filter(Boolean).join(" / ");
    return `<option value="${esc(team.id)}">${esc(label)}</option>`;
  }).join("");
  $("#team-form select").innerHTML = categoryOptions;
  if (teamCategoryValue && state.categories.some(category => category.id === teamCategoryValue)) $("#team-form select[name=categoryId]").value = teamCategoryValue;
  $("#product-form select").innerHTML = teamOptions;
  const filterValue = $("#product-team-filter").value;
  $("#product-team-filter").innerHTML = `<option value="">Todos os times</option>${teamOptions}`;
  $("#product-team-filter").value = filterValue;
  $("#settings-form select[name=initialCategoryId]").innerHTML = `<option value="">Primeiro esporte visivel</option>${categoryOptions}`;
  $("#settings-form select[name=initialCategoryId]").value = settingsCategoryValue || state.settings.initialCategoryId || "";
}

function renderMetrics() {
  const files = state.products.reduce((total, product) => total + (product.images?.length || 0) + (product.video ? 1 : 0) + (product.pdf ? 1 : 0), 0)
    + state.teams.reduce((total, team) => total + (team.showcaseImage ? 1 : 0) + (team.logoImage ? 1 : 0), 0);
  const metrics = [
    ["CAMISAS PUBLICADAS", state.products.length, "Modelos no catalogo"],
    ["ESPORTES", state.categories.length, "Modalidades organizadas"],
    ["TIMES", state.teams.length, `${state.teams.filter(team => team.hidden).length} oculto(s)`],
    ["ARQUIVOS", files, "Fotos, videos e PDFs"]
  ];
  $("#metric-grid").innerHTML = metrics.map((item, index) => `<article class="metric-card ${index === 0 ? "metric-card--gold" : ""}"><small>${item[0]}</small><strong>${item[1]}</strong><span>${item[2]}</span></article>`).join("");
}

function renderProducts() {
  const query = $("#product-search").value.trim().toLocaleLowerCase("pt-BR");
  const filter = $("#product-team-filter").value;
  const products = ordered(state.products).filter(product => {
    const team = teamFor(product.teamKey);
    return (!filter || product.teamKey === filter) && (!query || `${product.name} ${product.reference || ""} ${team?.name || ""}`.toLocaleLowerCase("pt-BR").includes(query));
  });
  const filtersActive = Boolean(query || filter);
  $("#clear-product-filters").hidden = !filtersActive;
  $("#product-filter-status").textContent = filtersActive
    ? `Exibindo ${products.length} de ${state.products.length} camiseta(s). Ha filtros ativos.`
    : `Exibindo todas as ${state.products.length} camiseta(s).`;
  $("#product-list").innerHTML = products.map(product => {
    const team = teamFor(product.teamKey);
    const image = product.images?.[0]?.url || "";
    return `<article class="product-row">${image ? `<img class="product-row__image" src="${esc(image)}" alt="">` : `<span class="product-row__image product-placeholder">10</span>`}<div><small>${esc(team?.name || "Sem time")}</small><h3>${esc(product.name)}</h3><p>${esc(product.reference || "Sem referencia")}</p></div><div><p>${product.featured ? `Destaque #${product.featuredOrder || 1}` : "Catalogo geral"} | ${product.images?.length || 0} foto(s)${product.video ? " | video" : ""}${product.pdf ? " | PDF" : ""}</p></div><div class="row-actions"><button class="mini-button" type="button" data-edit-product="${esc(product.id)}">EDITAR</button><button class="mini-button mini-button--danger" type="button" data-delete-product="${esc(product.id)}">EXCLUIR</button></div></article>`;
  }).join("") || `<div class="empty-state">Nenhuma camiseta encontrada.</div>`;
}

function renderCategories() {
  $("#category-list").innerHTML = ordered(state.categories).map((category, index, list) => `<article class="category-row"><span class="category-number">${esc(category.number || String(index + 1).padStart(2, "0"))}</span><div><small>${esc(category.accent || "Esporte")}</small><h3>${esc(category.title)}</h3><p>${esc(category.subtitle || "Sem descricao")}</p></div><div><p>${state.teams.filter(team => team.categoryId === category.id).length} time(s) ${category.hidden ? "| Oculto" : "| Visivel"}</p></div><div class="row-actions"><button class="mini-button" type="button" data-move-category="${esc(category.id)}" data-direction="up" ${index === 0 ? "disabled" : ""}>SUBIR</button><button class="mini-button" type="button" data-move-category="${esc(category.id)}" data-direction="down" ${index === list.length - 1 ? "disabled" : ""}>DESCER</button><button class="mini-button" type="button" data-toggle-category="${esc(category.id)}">${category.hidden ? "MOSTRAR" : "OCULTAR"}</button><button class="mini-button" type="button" data-edit-category="${esc(category.id)}">EDITAR</button></div></article>`).join("") || `<div class="empty-state">Nenhum esporte cadastrado.</div>`;
}

function renderTeams() {
  $("#team-list").innerHTML = ordered(state.teams).map(team => {
    const scope = ordered(state.teams.filter(item => item.categoryId === team.categoryId && (item.group || "") === (team.group || "")));
    const index = scope.findIndex(item => item.id === team.id);
    const context = [categoryFor(team.categoryId)?.title || "Sem esporte", team.group].filter(Boolean).join(" / ");
    const presentation = presentationFor(team);
    const visual = mediaUrl(presentation)
      ? `<img class="team-monogram team-monogram--image" src="${esc(mediaUrl(presentation))}" alt="">`
      : `<span class="team-monogram" style="--team-color:${esc(team.primaryColor || "#d1a656")}">${esc(initials(team.name))}</span>`;
    return `<article class="team-row">${visual}<div><small>${esc(context)}</small><h3>${esc(team.name)}</h3><p>${state.products.filter(product => product.teamKey === team.id).length} modelo(s)${team.featured ? " | Destaque" : ""}</p></div><div><p>${team.hidden ? "Oculto no catalogo" : "Visivel no catalogo"}</p></div><div class="row-actions"><button class="mini-button" type="button" data-move-team="${esc(team.id)}" data-direction="up" ${index === 0 ? "disabled" : ""}>SUBIR</button><button class="mini-button" type="button" data-move-team="${esc(team.id)}" data-direction="down" ${index === scope.length - 1 ? "disabled" : ""}>DESCER</button><button class="mini-button" type="button" data-toggle-team="${esc(team.id)}">${team.hidden ? "MOSTRAR" : "OCULTAR"}</button><button class="mini-button" type="button" data-edit-team="${esc(team.id)}">EDITAR</button></div></article>`;
  }).join("") || `<div class="empty-state">Nenhum time cadastrado.</div>`;
}

function fillCarouselFilters() {
  const categories = ordered(state.categories).filter(category => !category.hidden);
  if (!carouselFilters.categoryId || !categories.some(category => category.id === carouselFilters.categoryId)) {
    carouselFilters.categoryId = state.settings.initialCategoryId && categories.some(category => category.id === state.settings.initialCategoryId)
      ? state.settings.initialCategoryId
      : (categories[0]?.id || "");
  }
  $("#carousel-category-filter").innerHTML = categories.map(category => `<option value="${esc(category.id)}">${esc(category.title)}</option>`).join("");
  $("#carousel-category-filter").value = carouselFilters.categoryId;
  const groups = groupsForCategory(carouselFilters.categoryId);
  if (!groups.includes(carouselFilters.group)) carouselFilters.group = state.settings.initialGroup && groups.includes(state.settings.initialGroup) ? state.settings.initialGroup : (groups[0] || "");
  $("#carousel-group-filter").innerHTML = groups.length
    ? groups.map(group => `<option value="${esc(group)}">${esc(group)}</option>`).join("")
    : `<option value="">Sem liga definida</option>`;
  $("#carousel-group-filter").value = carouselFilters.group;
}

function renderCarouselManager() {
  fillCarouselFilters();
  const teams = ordered(state.teams.filter(team => team.categoryId === carouselFilters.categoryId && (!carouselFilters.group || team.group === carouselFilters.group)));
  $("#carousel-team-preview").innerHTML = teams.map((team, index) => {
    const presentation = presentationFor(team);
    const art = mediaUrl(presentation)
      ? `<img src="${esc(mediaUrl(presentation))}" alt="">`
      : `<span style="--team-color:${esc(team.primaryColor || "#d1a656")}">${esc(initials(team.name))}</span>`;
    return `<article class="carousel-preview-card ${team.hidden ? "is-hidden" : ""}">${art}<small>#${index + 1} ${team.featured ? "| DESTAQUE" : ""}</small><strong>${esc(team.name)}</strong><button class="mini-button" type="button" data-edit-team="${esc(team.id)}">CONFIGURAR</button></article>`;
  }).join("") || `<div class="empty-state">Nenhuma equipe cadastrada nesta liga.</div>`;
}

function renderTeamMediaPreview(team = null) {
  const container = $("#team-media-preview");
  const items = [
    ["Imagem de apresentacao", team?.showcaseImage, "showcaseImage"],
    ["Logo ou escudo", team?.logoImage, "logoImage"]
  ].filter(([, file]) => mediaUrl(file));
  container.innerHTML = items.length
    ? items.map(([label, file, field]) => `<figure><img src="${esc(mediaUrl(file))}" alt=""><figcaption><span>${label}</span><button class="mini-button mini-button--danger" type="button" data-remove-team-media="${field}">REMOVER</button></figcaption></figure>`).join("")
    : `<p class="section-helper">Nenhuma imagem exclusiva. A primeira foto de produto sera usada como alternativa.</p>`;
}

const teamPreviewUrls = new Map();
function updateTeamMediaPreview() {
  const form = $("#team-form");
  const preview = { ...(teamFor(form.dataset.editId) || {}) };
  for (const field of ["showcaseImage", "logoImage"]) {
    if (teamPreviewUrls.has(field)) URL.revokeObjectURL(teamPreviewUrls.get(field));
    teamPreviewUrls.delete(field);
    const file = form.elements[field].files?.[0];
    const removed = form.dataset[field === "showcaseImage" ? "removeShowcaseImage" : "removeLogoImage"] === "true";
    if (file) {
      const url = URL.createObjectURL(file);
      teamPreviewUrls.set(field, url);
      preview[field] = { url };
    } else if (removed) preview[field] = null;
  }
  renderTeamMediaPreview(preview);
}

function fillSettings() {
  $("#settings-form").querySelectorAll("input,textarea,select").forEach(field => {
    if (!field.name) return;
    if (field.type === "checkbox") field.checked = state.settings[field.name] ?? (field.name === "carouselShowDots");
    else field.value = state.settings[field.name] ?? field.value ?? "";
  });
  const name = (state.settings.storeName || "Camisa 10").toUpperCase();
  $("#admin-store-name").textContent = name;
}

function renderAll() {
  fillSelects();
  fillSettings();
  renderMetrics();
  renderProducts();
  renderCategories();
  renderTeams();
  renderCarouselManager();
}

async function refresh() {
  const response = await fetch("/api/admin/state", { cache: "no-store", headers: authHeaders(false) });
  if (!response.ok) throw new Error("O banco do catalogo nao esta conectado.");
  state = await response.json();
  renderAll();
}

function openProduct(product = null) {
  const form = $("#product-form");
  form.reset();
  form.dataset.editId = product?.id || "";
  form.querySelector("h2").textContent = product ? "EDITAR CAMISETA" : "NOVA CAMISETA";
  form.elements.images.required = false;
  resetProductPhotos(product?.images || []);
  if (product) {
    form.elements.teamKey.value = product.teamKey;
    form.elements.name.value = product.name;
    form.elements.reference.value = product.reference || "";
    form.elements.order.value = product.order || 1;
    form.elements.featured.checked = Boolean(product.featured);
    form.elements.featuredOrder.value = product.featuredOrder || 1;
  }
  $("#product-dialog").showModal();
}

function openCategory(category = null) {
  const form = $("#category-form");
  form.reset();
  form.dataset.editId = category?.id || "";
  form.querySelector("h2").textContent = category ? "EDITAR ESPORTE" : "NOVO ESPORTE";
  if (category) ["title", "subtitle", "accent"].forEach(name => { form.elements[name].value = category[name] || ""; });
  $("#category-dialog").showModal();
}

function openTeam(team = null) {
  const form = $("#team-form");
  form.reset();
  form.dataset.editId = team?.id || "";
  form.querySelector("h2").textContent = team ? "EDITAR EQUIPE" : "NOVA EQUIPE";
  form.dataset.removeShowcaseImage = "";
  form.dataset.removeLogoImage = "";
  form.elements.primaryColor.value = team?.primaryColor || "#d1a656";
  form.elements.secondaryColor.value = team?.secondaryColor || "#101210";
  form.elements.featured.checked = Boolean(team?.featured);
  form.elements.hidden.checked = Boolean(team?.hidden);
  if (team) { form.elements.categoryId.value = team.categoryId; form.elements.group.value = team.group || ""; form.elements.name.value = team.name; form.elements.order.value = team.order || 1; }
  renderTeamMediaPreview(team);
  $("#team-dialog").showModal();
}

async function upload(file) {
  const body = new FormData();
  body.append("file", file);
  return api("/api/admin/upload", { method: "POST", body });
}

async function saveRecord(collection, value) {
  await api(`/api/admin/${collection}`, { method: "PUT", body: JSON.stringify(value) });
}

async function moveRecord(collection, id, direction) {
  const selected = state[collection].find(item => item.id === id);
  const list = ordered(collection === "teams" ? state.teams.filter(team => team.categoryId === selected?.categoryId && (team.group || "") === (selected?.group || "")) : state[collection]);
  const index = list.findIndex(item => item.id === id);
  const otherIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || otherIndex < 0 || otherIndex >= list.length) return;
  const current = list[index];
  const other = list[otherIndex];
  const currentOrder = current.order || index + 1;
  current.order = other.order || otherIndex + 1;
  other.order = currentOrder;
  await Promise.all([saveRecord(collection, current), saveRecord(collection, other)]);
  await refresh();
  toast("Ordem atualizada.");
}

$("#connect").addEventListener("click", async () => {
  const password = $("#password").value;
  if (!password) { $("#status").textContent = "Digite a senha administrativa."; return; }
  try {
    await api("/api/admin/session", { method: "POST" });
    $("#password").value = "";
    await refresh();
    $("#login-screen").hidden = true;
    $("#admin-app").hidden = false;
    showSection("overview");
  } catch (error) { $("#status").textContent = error.message; }
});

$("#password").addEventListener("keydown", event => { if (event.key === "Enter") $("#connect").click(); });
$("#logout").addEventListener("click", async () => {
  try { await api("/api/admin/session", { method: "DELETE" }); } catch {}
  $("#password").value = "";
  $("#admin-app").hidden = true;
  $("#login-screen").hidden = false;
  $("#status").textContent = "";
});
$("#menu-button").addEventListener("click", () => $("#sidebar").classList.toggle("is-open"));
$("#product-search").addEventListener("input", renderProducts);
$("#product-team-filter").addEventListener("change", () => {
  if (!$("#product-team-filter").value) $("#product-search").value = "";
  renderProducts();
});
$("#clear-product-filters").addEventListener("click", () => {
  $("#product-search").value = "";
  $("#product-team-filter").value = "";
  renderProducts();
  $("#product-search").focus();
});
$("#carousel-category-filter").addEventListener("change", event => {
  carouselFilters = { categoryId: event.target.value, group: "" };
  renderCarouselManager();
});
$("#carousel-group-filter").addEventListener("change", event => {
  carouselFilters.group = event.target.value;
  renderCarouselManager();
});
$("#team-form").addEventListener("change", event => {
  if (!["showcaseImage", "logoImage"].includes(event.target.name) || !event.target.files?.[0]) return;
  updateTeamMediaPreview();
});

document.addEventListener("click", async event => {
  const section = event.target.closest("[data-section]");
  if (section) { showSection(section.dataset.section); return; }
  const opener = event.target.closest("[data-open]");
  if (opener) { opener.dataset.open === "product-dialog" ? openProduct() : opener.dataset.open === "category-dialog" ? openCategory() : openTeam(); return; }
  const closer = event.target.closest("[data-close-dialog]");
  if (closer) { $(`#${closer.dataset.closeDialog}`).close(); return; }
  const editProduct = event.target.closest("[data-edit-product]");
  if (editProduct) { openProduct(state.products.find(item => item.id === editProduct.dataset.editProduct)); return; }
  const editCategory = event.target.closest("[data-edit-category]");
  if (editCategory) { openCategory(categoryFor(editCategory.dataset.editCategory)); return; }
  const editTeam = event.target.closest("[data-edit-team]");
  if (editTeam) { openTeam(teamFor(editTeam.dataset.editTeam)); return; }
  const removeTeamMedia = event.target.closest("[data-remove-team-media]");
  if (removeTeamMedia) {
    const form = $("#team-form");
    const field = removeTeamMedia.dataset.removeTeamMedia;
    form.dataset[field === "showcaseImage" ? "removeShowcaseImage" : "removeLogoImage"] = "true";
    form.elements[field].value = "";
    updateTeamMediaPreview();
    return;
  }
  const moveCategory = event.target.closest("[data-move-category]");
  if (moveCategory) { await moveRecord("categories", moveCategory.dataset.moveCategory, moveCategory.dataset.direction); return; }
  const moveTeam = event.target.closest("[data-move-team]");
  if (moveTeam) { await moveRecord("teams", moveTeam.dataset.moveTeam, moveTeam.dataset.direction); return; }
  const toggleCategory = event.target.closest("[data-toggle-category]");
  if (toggleCategory) { const category = categoryFor(toggleCategory.dataset.toggleCategory); await saveRecord("categories", { ...category, hidden: !category.hidden }); await refresh(); toast("Visibilidade da categoria atualizada."); return; }
  const toggleTeam = event.target.closest("[data-toggle-team]");
  if (toggleTeam) { const team = teamFor(toggleTeam.dataset.toggleTeam); await saveRecord("teams", { ...team, hidden: !team.hidden }); await refresh(); toast("Visibilidade do time atualizada."); return; }
  const removeProduct = event.target.closest("[data-delete-product]");
  if (removeProduct && confirm("Excluir esta camiseta e seus arquivos?")) { await api(`/api/admin/products/${encodeURIComponent(removeProduct.dataset.deleteProduct)}`, { method: "DELETE" }); await refresh(); toast("Camiseta excluida."); }
});

$("#settings-form").addEventListener("submit", async event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.target));
  values.carouselAutoplay = event.target.elements.carouselAutoplay.checked;
  values.carouselShowDots = event.target.elements.carouselShowDots.checked;
  values.carouselInterval = Math.min(15, Math.max(3, Number(values.carouselInterval) || 6));
  values.catalogPageSize = Math.min(48, Math.max(8, Number(values.catalogPageSize) || 24));
  try { await saveRecord("settings", values); await refresh(); toast("Configuracoes salvas."); } catch (error) { toast(error.message, true); }
});

$("#category-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.target;
  const existing = categoryFor(form.dataset.editId);
  const values = Object.fromEntries(new FormData(form));
  const category = existing ? { ...existing, ...values } : { ...values, id: makeId("category"), number: String(state.categories.length + 1).padStart(2, "0"), order: state.categories.length + 1, hidden: false };
  try { await saveRecord("categories", category); await refresh(); $("#category-dialog").close(); toast(existing ? "Esporte atualizado." : "Esporte criado."); } catch (error) { toast(error.message, true); }
});

$("#team-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.target;
  const existing = teamFor(form.dataset.editId);
  const values = new FormData(form);
  const showcaseFile = values.get("showcaseImage");
  const logoFile = values.get("logoImage");
  const submit = form.querySelector("button[type=submit]");
  submit.disabled = true;
  submit.textContent = "SALVANDO...";
  try {
    const showcaseImage = showcaseFile?.size
      ? await upload(showcaseFile)
      : (form.dataset.removeShowcaseImage === "true" ? null : (existing?.showcaseImage || null));
    const logoImage = logoFile?.size
      ? await upload(logoFile)
      : (form.dataset.removeLogoImage === "true" ? null : (existing?.logoImage || null));
    const team = {
      ...(existing || {}),
      id: existing?.id || makeId("team"),
      categoryId: values.get("categoryId"),
      group: String(values.get("group") || "").trim(),
      name: String(values.get("name") || "").trim(),
      order: Number(values.get("order")) || 1,
      primaryColor: values.get("primaryColor") || "#d1a656",
      secondaryColor: values.get("secondaryColor") || "#101210",
      featured: values.get("featured") === "on",
      hidden: values.get("hidden") === "on",
      showcaseImage,
      logoImage,
      updatedAt: Date.now()
    };
    await saveRecord("teams", team);
    await refresh();
    $("#team-dialog").close();
    toast(existing ? "Equipe atualizada." : "Equipe criada.");
  } catch (error) { toast(error.message, true); }
  finally { submit.disabled = false; submit.textContent = "SALVAR EQUIPE"; }
});

let productPhotos = [];
let productSaving = false;
const photoInput = $("#product-form input[name=images]");
photoInput.required = false;
photoInput.closest("label").querySelector("span").textContent = "JPG, PNG ou WEBP. Novas fotos entram ao final. Organize abaixo antes de publicar.";
const photoEditor = document.createElement("section");
photoEditor.className = "product-photo-editor full-field";
photoEditor.setAttribute("aria-label", "Organizar fotos da camiseta");
photoInput.closest("label").after(photoEditor);

function resetProductPhotos(images = []) {
  productPhotos.forEach(item => { if (item.file) URL.revokeObjectURL(item.preview); });
  productPhotos = images.map(record => ({ id: crypto.randomUUID(), record, preview: mediaUrl(record) }));
  renderProductPhotos();
}

function renderProductPhotos(focusId = "", action = "") {
  photoEditor.innerHTML = '<p class="photo-order-help">A primeira foto e a capa. Use as setas para ordenar ou escolha uma foto como capa. As mudancas so entram no catalogo ao publicar.</p><div class="product-photo-grid">' +
    productPhotos.map((item, index) => '<article class="product-photo-item"><span class="photo-position">' + (index === 0 ? "1 · CAPA" : String(index + 1)) + '</span><img src="' + esc(item.preview) + '" alt="Foto ' + (index + 1) + '" decoding="async"><span class="photo-filename">' + esc(item.file?.name || item.record?.name || "Foto cadastrada") + '</span><div class="photo-actions">' +
      '<button type="button" data-photo-action="previous" data-photo-id="' + item.id + '" aria-label="Mover foto ' + (index + 1) + ' para antes" ' + (index === 0 ? "disabled" : "") + '>&larr;</button>' +
      '<button type="button" data-photo-action="next" data-photo-id="' + item.id + '" aria-label="Mover foto ' + (index + 1) + ' para depois" ' + (index === productPhotos.length - 1 ? "disabled" : "") + '>&rarr;</button>' +
      '<button type="button" data-photo-action="cover" data-photo-id="' + item.id + '" ' + (index === 0 ? "disabled" : "") + '>Usar como capa</button>' +
      '<button type="button" data-photo-action="remove" data-photo-id="' + item.id + '">Remover</button></div></article>').join("") +
    '</div><p class="photo-count" role="status">' + (productPhotos.length ? productPhotos.length + " foto(s) na ordem de publicacao." : "Selecione as fotos para visualizar e organizar.") + '</p>';
  if (focusId) {
    const button = photoEditor.querySelector('[data-photo-id="' + focusId + '"][data-photo-action="' + action + '"]');
    (button && !button.disabled ? button : photoEditor.querySelector('[data-photo-id="' + focusId + '"]:not(:disabled)'))?.focus({ preventScroll: true });
  }
}

photoInput.addEventListener("change", () => {
  if (productSaving) return;
  for (const file of photoInput.files) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      toast("Foto nao adicionada: " + file.name + ". Use JPG, PNG ou WEBP de ate 10 MB.", true);
      continue;
    }
    productPhotos.push({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) });
  }
  photoInput.value = "";
  renderProductPhotos();
});

photoEditor.addEventListener("click", event => {
  const button = event.target.closest("[data-photo-action]");
  if (!button || productSaving) return;
  const index = productPhotos.findIndex(item => item.id === button.dataset.photoId);
  if (index < 0) return;
  const action = button.dataset.photoAction;
  if (action === "remove") {
    const removed = productPhotos.splice(index, 1)[0];
    if (removed.file) URL.revokeObjectURL(removed.preview);
  } else {
    const destination = action === "cover" ? 0 : index + (action === "previous" ? -1 : 1);
    if (destination < 0 || destination >= productPhotos.length) return;
    productPhotos.splice(destination, 0, productPhotos.splice(index, 1)[0]);
  }
  renderProductPhotos(action === "remove" ? (productPhotos[Math.min(index, productPhotos.length - 1)]?.id || "") : button.dataset.photoId, action);
});

$("#product-dialog").addEventListener("cancel", event => { if (productSaving) event.preventDefault(); });
$("#product-dialog").addEventListener("close", () => { if (!productSaving) resetProductPhotos(); });

$("#product-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (productSaving) return;
  const form = event.target;
  const existing = state.products.find(product => product.id === form.dataset.editId);
  const values = new FormData(form);
  if (!productPhotos.length) { toast("Adicione pelo menos uma foto.", true); return; }
  const orderedPhotos = [...productPhotos];
  const submit = form.querySelector("button[type=submit]");
  submit.disabled = true;
  submit.textContent = "PUBLICANDO...";
  productSaving = true;
  form.inert = true;
  try {
    const newImages = [];
    for (const item of orderedPhotos) {
      if (!item.record) item.record = await upload(item.file);
      newImages.push(item.record);
    }
    const videoFile = values.get("video");
    const pdfFile = values.get("pdf");
    const team = teamFor(values.get("teamKey"));
    const product = {
      ...(existing || {}),
      id: existing?.id || makeId("product"),
      teamKey: team.id,
      teamName: team.name,
      categoryId: team.categoryId,
      name: values.get("name"),
      reference: values.get("reference"),
      order: Number(values.get("order")) || 1,
      featured: values.get("featured") === "on",
      featuredOrder: Number(values.get("featuredOrder")) || 1,
      images: newImages,
      video: videoFile?.size ? await upload(videoFile) : (existing?.video || null),
      pdf: pdfFile?.size ? await upload(pdfFile) : (existing?.pdf || null),
      updatedAt: Date.now()
    };
    await saveRecord("products", product);
    await refresh();
    $("#product-dialog").close();
    toast(existing ? "Camiseta atualizada." : "Camiseta publicada.");
  } catch (error) { toast(error.message, true); }
  finally {
    productSaving = false;
    form.inert = false;
    submit.disabled = false;
    submit.textContent = "PUBLICAR CAMISETA";
    if (!$("#product-dialog").open) resetProductPhotos();
  }
});

async function restoreSession() {
  $("#product-search").value = "";
  $("#product-team-filter").value = "";
  try {
    await api("/api/admin/session", { method: "GET" });
    await refresh();
    $("#login-screen").hidden = true;
    $("#admin-app").hidden = false;
    showSection("overview");
  } catch {
    $("#login-screen").hidden = false;
    $("#admin-app").hidden = true;
  }
}

restoreSession();
