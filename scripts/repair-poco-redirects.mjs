import fs from "node:fs";

const rules = [
  {
    source: "/pecas-e-componentes/outros",
    destination: "/pecas-e-componentes/xiaomi-redmi",
    permanent: false
  },
  {
    source: "/pecas-e-componentes/outros/lente-da-camera-poco-x3",
    destination: "/pecas-e-componentes/xiaomi-redmi/lente-da-camera-poco-x3",
    permanent: true
  },
  {
    source: "/pecas-e-componentes/outros/lente-da-camera-poco-m3",
    destination: "/pecas-e-componentes/xiaomi-redmi/lente-da-camera-poco-m3",
    permanent: true
  }
];

function repair(file, decorate) {
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  const unrelated = (payload.redirects || []).filter((rule) => {
    const source = String(rule?.source || "");
    const destination = String(rule?.destination || "");
    if (source === destination && source.includes("/lente-da-camera-poco-")) return false;
    return !rules.some((wanted) => wanted.source === source);
  });
  payload.redirects = [...rules.map(decorate), ...unrelated];
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
  return payload.redirects.length;
}

const result = {
  customRedirects: repair("_custom/redirects.json", (rule) => ({
    ...rule,
    type: "category",
    method: "GET",
    strategy: "vercel-redirect",
    proof: "outros-menu-reclassify-poco"
  })),
  vercelRedirects: repair("vercel.json", (rule) => rule)
};

console.log(JSON.stringify(result, null, 2));
