import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
const delay = ms => new Promise(r => setTimeout(r, ms));
const browser = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=9331",
  "--user-data-dir=" + resolve(".wrangler/browser-check"), "about:blank"
], { windowsHide: true, stdio: "ignore" });
let socket;
try {
  let target;
  for (let i = 0; i < 40; i++) {
    try { target = (await (await fetch("http://127.0.0.1:9331/json")).json()).find(t => t.type === "page"); if (target) break; } catch {}
    await delay(150);
  }
  if (!target) throw Error("Chrome local nao iniciou");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0; const pending = new Map();
  const exceptions = [];
  socket.onmessage = event => {
    const value = JSON.parse(event.data);
    if (value.method === "Runtime.exceptionThrown") exceptions.push(value.params.exceptionDetails.text);
    if (pending.has(value.id)) { const callbacks = pending.get(value.id); pending.delete(value.id); value.error ? callbacks.reject(value.error) : callbacks.resolve(value.result); }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const current = ++id; pending.set(current, { resolve, reject }); socket.send(JSON.stringify({ id: current, method, params }));
  });
  const evaluate = async expression => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send("Page.navigate", { url: "http://127.0.0.1:8790/" });
  for (let i = 0; i < 50; i++) {
    if (await evaluate("Boolean(document.querySelector('[data-discovery-team]'))")) break;
    await delay(100);
  }
  console.log(JSON.stringify(await evaluate(`({
    width:innerWidth, client:document.documentElement.clientWidth, scroll:document.documentElement.scrollWidth,
    overflow:[...document.querySelectorAll("body *")].filter(el => {const r=el.getBoundingClientRect();return r.right>395 && r.width>0}).slice(0,35).map(el => ({tag:el.tagName,cls:el.className,w:Math.round(el.getBoundingClientRect().width),right:Math.round(el.getBoundingClientRect().right)}))
  })`), null, 2));
  await evaluate("document.querySelector('[data-discovery-next]').click()");
  await delay(600);
  console.log("NEXT_TEAM", await evaluate("document.querySelector('.team-carousel__selection h3').textContent"));
  await evaluate("document.querySelector('[data-discovery-category=basquete]').click()");
  await delay(600);
  console.log("BASKETBALL", await evaluate("document.querySelector('.team-carousel__selection h3').textContent"));
  await evaluate("document.querySelector('[data-discovery-category=futebol]').click()");
  await delay(600);
  await evaluate("document.querySelector('.discovery-leagues').scrollIntoView({behavior:'instant'})");
  await delay(200);
  const screenshot = await send("Page.captureScreenshot", { format: "png" });
  await writeFile("catalog-mobile-test.png", Buffer.from(screenshot.data, "base64"));
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await evaluate("document.querySelector('.discovery-leagues').scrollIntoView({behavior:'instant'})");
  await delay(200);
  const desktop = await send("Page.captureScreenshot", { format: "png" });
  await writeFile("catalog-desktop-test.png", Buffer.from(desktop.data, "base64"));
  await send("Page.navigate", { url: "http://127.0.0.1:8790/admin.html" });
  for (let i = 0; i < 150; i++) {
    if (await evaluate("typeof refresh === 'function' && document.readyState !== 'loading'")) break;
    await delay(100);
  }
  await evaluate("document.querySelector('#password').value='test-local';document.querySelector('#connect').click()");
  for (let i = 0; i < 40; i++) {
    if (await evaluate("document.querySelector('#admin-app')?.hidden === false")) break;
    await delay(100);
  }
  if (!await evaluate("document.querySelector('#admin-app')?.hidden === false")) throw Error("Painel local nao abriu: " + await evaluate("document.querySelector('#status')?.textContent") + " " + exceptions.join("; "));
  await send("Page.reload", { ignoreCache: true });
  for (let i = 0; i < 80; i++) {
    if (await evaluate("document.querySelector('#admin-app')?.hidden === false")) break;
    await delay(100);
  }
  if (!await evaluate("document.querySelector('#admin-app')?.hidden === false")) throw Error("Sessao nao foi restaurada depois de atualizar");
  await evaluate("document.querySelector('[data-section=products]').click();document.querySelector('#product-search').value='produto-que-nao-existe-987654';document.querySelector('#product-search').dispatchEvent(new Event('input',{bubbles:true}))");
  const filteredCount = await evaluate("document.querySelectorAll('#product-list .product-row').length");
  if (filteredCount !== 0) throw Error("Busca de produtos nao filtrou a lista");
  await evaluate("document.querySelector('#product-team-filter').value='';document.querySelector('#product-team-filter').dispatchEvent(new Event('change',{bubbles:true}))");
  if (await evaluate("document.querySelector('#product-search').value") !== "") throw Error("Todos os times nao limpou a busca");
  if (await evaluate("document.querySelectorAll('#product-list .product-row').length") !== await evaluate("state.products.length")) throw Error("Todos os times nao exibiu todos os produtos");
  await evaluate("document.querySelector('#product-search').value='produto-que-nao-existe-987654';document.querySelector('#product-search').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#clear-product-filters').click()");
  if (await evaluate("document.querySelector('#product-search').value || document.querySelector('#product-team-filter').value")) throw Error("Limpar filtros nao restaurou a lista");
  console.log("PASS: Todos os times e Limpar filtros exibem todas as camisetas.");
  await evaluate("document.querySelector('[data-section=teams]').click()");
  if (!await evaluate("document.querySelectorAll('#carousel-team-preview [data-edit-team]').length > 0")) throw Error("Previa das equipes ausente");
  await evaluate("document.querySelector('#carousel-team-preview [data-edit-team]').click()");
  if (!await evaluate("document.querySelector('#team-dialog').open && !!document.querySelector('[name=showcaseImage]')")) throw Error("Editor de equipe nao abriu");
  const admin = await send("Page.captureScreenshot", { format: "png" });
  await writeFile("catalog-admin-test.png", Buffer.from(admin.data, "base64"));
  await evaluate("document.querySelector('#team-dialog').close();document.querySelector('[data-section=products]').click();document.querySelector('[data-edit-product]').click()");
  const editedId = await evaluate("document.querySelector('#product-form').dataset.editId");
  await evaluate(`(() => {
    resetProductPhotos([]);
    const bytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII="), c => c.charCodeAt(0));
    const transfer = new DataTransfer();
    for (const name of ["frente.png","costas.png","detalhe.png"]) transfer.items.add(new File([bytes],name,{type:"image/png"}));
    const input = document.querySelector('#product-form input[name=images]');
    input.files = transfer.files; input.dispatchEvent(new Event("change",{bubbles:true}));
    document.querySelectorAll('[data-photo-action=cover]')[2].click();
    document.querySelectorAll('[data-photo-action=remove]')[2].click();
  })()`);
  const order = await evaluate("productPhotos.map(item=>item.file.name).join(',')");
  if (order !== "detalhe.png,frente.png") throw Error("Ordem da previsualizacao incorreta: " + order);
  await evaluate("document.querySelector('#product-form').requestSubmit()");
  for (let i = 0; i < 80; i++) {
    if (await evaluate("!document.querySelector('#product-dialog').open")) break;
    await delay(100);
  }
  if (await evaluate("document.querySelector('#product-dialog').open")) throw Error("Fotos nao foram salvas");
  const savedOrder = await evaluate("state.products.find(p=>p.id===" + JSON.stringify(editedId) + ").images.map(p=>p.name).join(',')");
  if (savedOrder !== order) throw Error("Ordem publicada difere da previa");
  await evaluate("openProduct(state.products.find(p=>p.id===" + JSON.stringify(editedId) + "))");
  if (await evaluate("productPhotos.length") !== 2) throw Error("Fotos existentes ausentes");
  await evaluate("document.querySelectorAll('[data-photo-action=previous]')[1].click();document.querySelector('#product-form').requestSubmit()");
  for (let i = 0; i < 80; i++) {
    if (await evaluate("!document.querySelector('#product-dialog').open")) break;
    await delay(100);
  }
  const reordered = await evaluate("state.products.find(p=>p.id===" + JSON.stringify(editedId) + ").images.map(p=>p.name).join(',')");
  if (reordered !== "frente.png,detalhe.png") throw Error("Reordenacao das fotos existentes falhou");
  await evaluate("openProduct(state.products.find(p=>p.id===" + JSON.stringify(editedId) + "));document.querySelector('[data-photo-action=remove]').click();document.querySelector('#product-dialog').close()");
  const afterCancel = await evaluate("state.products.find(p=>p.id===" + JSON.stringify(editedId) + ").images.length");
  if (afterCancel !== 2) throw Error("Cancelar alterou as fotos salvas");
  await evaluate("document.querySelector('#logout').click()");
  for (let i = 0; i < 30; i++) {
    if (await evaluate("document.querySelector('#login-screen')?.hidden === false")) break;
    await delay(100);
  }
  await send("Page.reload", { ignoreCache: true });
  await delay(500);
  if (!await evaluate("document.querySelector('#login-screen')?.hidden === false")) throw Error("Sair nao encerrou a sessao");
  console.log("PASS: previa, capa, remocao, upload na ordem escolhida, reordenacao de fotos existentes e cancelamento.");
  if (exceptions.length) throw Error("Erros de JavaScript: " + exceptions.join("; "));
  console.log("PASS: navegador local, selecao de equipe/esporte, login e editor administrativo; sem excecoes JavaScript.");
  await send("Browser.close");
} finally {
  socket?.close();
  browser.kill();
}
