(function () {
  const defaults = { extraLongSleeve: 20, extraPersonalization: 30, extra2GG: 15, extra3GG: 20, extra4GG: 25 };
  const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const extra = (settings, key) => {
    const value = settings?.[key] ?? defaults[key];
    return Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : defaults[key];
  };
  const base = (product, settings) => typeof product.price === 'number' && Number.isFinite(product.price) && product.price >= 0
    ? Math.round((product.price + (product.priceLongSleeve ? extra(settings, 'extraLongSleeve') : 0)) * 100) / 100 : null;
  const total = (product, settings, size = '', personalized = false) => {
    const value = base(product, settings);
    return value === null ? null : Math.round((value + (['2GG', '3GG', '4GG'].includes(size) ? extra(settings, 'extra' + size) : 0) + (personalized ? extra(settings, 'extraPersonalization') : 0)) * 100) / 100;
  };
  globalThis.CatalogPricing = { defaults, money, extra, base, total };
})();
