import { pool } from "../lib/db.js";
import { databaseUrl } from "../lib/db.js";
import { newId } from "../lib/ids.js";

async function run() {
  if (!databaseUrl) throw new Error("A database URL is required for db:seed");

  // Minimal seed so the cart UI can be tested immediately.
  const products = [
    {
      slug: "produto-demo-tela",
      name: "Produto Demo (Tela)",
      brand: "TECH 7",
      section: "demo",
      priceCents: 19990,
      imageUrl: "/logo.png"
    },
    {
      slug: "produto-demo-bateria",
      name: "Produto Demo (Bateria)",
      brand: "TECH 7",
      section: "demo",
      priceCents: 8990,
      imageUrl: "/logo.png"
    }
  ];

  for (const p of products) {
    const id = newId("prod");
    await pool.query(
      `
      insert into products (id, slug, name, brand, section, price_cents, currency, image_url, active)
      values ($1, $2, $3, $4, $5, $6, 'BRL', $7, true)
    `,
      [id, p.slug, p.name, p.brand, p.section, p.priceCents, p.imageUrl]
    );
  }

  await pool.end();
  // eslint-disable-next-line no-console
  console.log("seed complete");
}

run().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("seed failed", e);
  process.exit(1);
});
