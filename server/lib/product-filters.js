export function normalizeFilterValue(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const SECTION_GROUPS = [
  {
    aliases: ["bateria", "baterias", "bateria-celular", "baterias-celular"],
    values: ["baterias", "baterias-celular"]
  },
  {
    aliases: ["display", "display-e-lcd", "display-lcd", "tela-display-lcd", "telas-display-lcd"],
    values: ["display", "display-e-lcd"]
  },
  {
    aliases: ["touch", "touch-visor", "touch-e-visor", "touchs-visores", "touchs-e-visores"],
    values: ["touchs-e-visores"]
  },
  {
    aliases: ["pecas", "pecas-componentes", "pecas-e-componentes", "componentes"],
    values: ["pecas-e-componentes"]
  },
  {
    aliases: ["tampas", "tampas-carcacas", "tampas-e-carcacas", "carcacas"],
    values: ["tampas-e-carcacas"]
  },
  {
    aliases: ["ferramentas", "maquinas-ferramentas", "maquinas-e-ferramentas"],
    values: ["maquinas-e-ferramentas"]
  },
  {
    aliases: ["demo"],
    values: ["demo"]
  }
];

export function resolveSectionFilterValues(value) {
  const normalized = normalizeFilterValue(value);
  if (!normalized) return [];

  const group = SECTION_GROUPS.find((entry) =>
    entry.aliases.includes(normalized) || entry.values.includes(normalized)
  );

  return group ? [...group.values] : [normalized];
}

export function addSectionWhere(filters, params, value, column = "section") {
  const sections = resolveSectionFilterValues(value);
  if (!sections.length) return sections;
  params.push(sections);
  filters.push(`lower(${column}) = any($${params.length}::text[])`);
  return sections;
}

export function rowMatchesSection(rowSection, requestedSection) {
  const allowed = resolveSectionFilterValues(requestedSection);
  if (!allowed.length) return true;
  return allowed.includes(normalizeFilterValue(rowSection));
}

export function normalizeSort(value) {
  const sort = normalizeFilterValue(value || "recent");
  if (["price-asc", "preco-asc", "menor-preco"].includes(sort)) return "price-asc";
  if (["price-desc", "preco-desc", "maior-preco"].includes(sort)) return "price-desc";
  if (["name-asc", "nome-asc", "az", "a-z"].includes(sort)) return "name-asc";
  if (["name-desc", "nome-desc", "za", "z-a"].includes(sort)) return "name-desc";
  return "recent";
}

export function orderSqlForSort(value) {
  switch (normalizeSort(value)) {
    case "price-asc":
      return "price_cents asc nulls last, updated_at desc nulls last, created_at desc";
    case "price-desc":
      return "price_cents desc nulls last, updated_at desc nulls last, created_at desc";
    case "name-asc":
      return "name asc, updated_at desc nulls last, created_at desc";
    case "name-desc":
      return "name desc, updated_at desc nulls last, created_at desc";
    default:
      return "updated_at desc nulls last, created_at desc";
  }
}
