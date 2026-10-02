UPDATE catalog_categories SET value=json_set(value,'$.hidden',json('true')) WHERE id='esportes-gaelicos';
UPDATE catalog_categories SET value=json_set(value,'$.number','05','$.order',5) WHERE id='basquete';
