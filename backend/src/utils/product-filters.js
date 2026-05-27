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

export function mockProductMatchesSection(product, requestedSection) {
  const values = resolveSectionFilterValues(requestedSection);
  if (!values.length) return true;
  return values.includes(normalizeFilterValue(product?.section || product?.category));
}
