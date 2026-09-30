(function () {
  const DB_NAME = "camisa10-admin";
  const DB_VERSION = 1;
  const SETTINGS_KEY = "camisa10-settings";
  const CATEGORIES_KEY = "camisa10-categories";

  const defaultSettings = {
    storeName: "Camisa 10",
    whatsapp: "5518981296009",
    email: "",
    instagram: "",
    catalogTitle: "Seu time. Sua camisa.",
    introText: "Escolha uma categoria, encontre seu clube e veja todos os modelos disponíveis para pedir.",
    whatsappMessage: "Olá! Tenho interesse nesta camisa.\n\nTime: {time}\nModelo: {modelo}\nReferência: {referencia}\nFoto: {link}",
    logo: "",
  };

  const defaultCategories = [
    { id: "brasileirao", number: "01", title: "Brasil", subtitle: "Brasileirão", accent: "Nacional", order: 1 },
    { id: "saudita-mls", number: "02", title: "Liga Saudita & MLS", subtitle: "Oriente Médio e Estados Unidos", accent: "Mundo", order: 2 },
    { id: "inglaterra-espanha", number: "03", title: "Inglaterra & Espanha", subtitle: "Premier League e La Liga", accent: "Europa", order: 3 },
    { id: "italia-alemanha-portugal", number: "04", title: "Itália, Alemanha & Portugal", subtitle: "Serie A, Bundesliga e Primeira Liga", accent: "Europa", order: 4 },
    { id: "franca-e-outras", number: "05", title: "França & Outras Ligas", subtitle: "Ligue 1, Argentina, Holanda e Escócia", accent: "Mundo", order: 5 },
    { id: "outras-ligas", number: "06", title: "Outras Ligas", subtitle: "Europa e América", accent: "Mundo", order: 6 },
    { id: "selecoes", number: "07", title: "Seleções", subtitle: "Europa, Américas, África e Ásia", accent: "Mundo", order: 7 },
    { id: "basquete", number: "08", title: "Basquete", subtitle: "Regatas e camisas NBA", accent: "NBA", order: 8 },
    { id: "retros", number: "09", title: "Retrôs", subtitle: "Clássicos de clubes e seleções", accent: "Arquivo", order: 9 },
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getSettings() {
    try {
      return { ...defaultSettings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
    } catch {
      return clone(defaultSettings);
    }
  }

  function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...defaultSettings, ...settings }));
  }

  function getCategories() {
    try {
      const saved = JSON.parse(localStorage.getItem(CATEGORIES_KEY) || "null");
      return (Array.isArray(saved) && saved.length ? saved : clone(defaultCategories)).sort((a, b) => a.order - b.order);
    } catch {
      return clone(defaultCategories);
    }
  }

  function saveCategories(categories) {
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories.map((item, index) => ({ ...item, order: index + 1 }))));
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("products")) db.createObjectStore("products", { keyPath: "id" });
        if (!db.objectStoreNames.contains("teams")) db.createObjectStore("teams", { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getAll(storeName) {
    const db = await openDb();
    const result = await new Promise((resolve, reject) => {
      const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return result;
  }

  async function put(storeName, value) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const request = db.transaction(storeName, "readwrite").objectStore(storeName).put(value);
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
    });
    db.close();
  }

  async function remove(storeName, id) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const request = db.transaction(storeName, "readwrite").objectStore(storeName).delete(id);
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
    });
    db.close();
  }

  function slugify(value) {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  window.CatalogStore = {
    defaultSettings,
    defaultCategories,
    getSettings,
    saveSettings,
    getCategories,
    saveCategories,
    getAll,
    put,
    remove,
    slugify,
  };
})();
