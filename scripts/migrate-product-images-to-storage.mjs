import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../server/lib/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const localPrefix = "/_assets/uploads/products/";
const bucket = process.env.SUPABASE_PRODUCT_IMAGES_BUCKET || "product-images";
const dryRun = process.argv.includes("--dry-run");
const report = {
  dryRun,
  bucket,
  migrated: [],
  missing: [],
  ignored: [],
  updatedProducts: 0,
  updatedProductImages: 0
};

const imageTypes = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".gif", "image/gif"]
]);

function normalizeSupabaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function deriveSupabaseUrlFromDatabase() {
  const raw = String(process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.SUPABASE_DB_URL || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    const hostMatch = parsed.hostname.match(/(?:db\.|pooler\.)?([a-z0-9]{20})\.supabase\.co$/i);
    if (hostMatch?.[1]) return `https://${hostMatch[1]}.supabase.co`;
    const userMatch = decodeURIComponent(parsed.username || "").match(/postgres\.([a-z0-9]{20})/i);
    if (userMatch?.[1]) return `https://${userMatch[1]}.supabase.co`;
  } catch {
    return "";
  }
  return "";
}

function getStorageConfig() {
  const url = normalizeSupabaseUrl(process.env.SUPABASE_URL || deriveSupabaseUrlFromDatabase());
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !serviceKey) {
    throw new Error("Supabase Storage nao configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  }
  return { url, serviceKey };
}

function isLocalUploadUrl(value) {
  return String(value || "").startsWith(localPrefix);
}

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return { ...value };
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function localPathFromUrl(url) {
  const relative = String(url || "").replace(/^\/+/, "");
  const resolved = path.resolve(rootDir, relative);
  const uploadRoot = path.resolve(rootDir, "_assets", "uploads", "products");
  if (!resolved.startsWith(uploadRoot)) return "";
  return resolved;
}

function encodeStoragePath(value) {
  return String(value || "")
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function publicStorageUrl(storageUrl, objectPath) {
  return `${storageUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodeStoragePath(objectPath)}`;
}

async function uploadFile(storage, localFile, productId) {
  const ext = path.extname(localFile).toLowerCase();
  const contentType = imageTypes.get(ext);
  if (!contentType) throw new Error(`Tipo de imagem nao suportado: ${localFile}`);
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext === ".jpeg" ? ".jpg" : ext}`;
  const objectPath = `products/${productId}/${filename}`;
  if (dryRun) return publicStorageUrl(storage.url, objectPath);

  const response = await fetch(`${storage.url}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeStoragePath(objectPath)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${storage.serviceKey}`,
      apikey: storage.serviceKey,
      "Content-Type": contentType,
      "Cache-Control": "31536000, immutable",
      "x-upsert": "false"
    },
    body: await fs.promises.readFile(localFile)
  });
  if (!response.ok) {
    let details = "";
    try {
      const payload = await response.json();
      details = payload?.message || payload?.error || "";
    } catch {
      details = await response.text().catch(() => "");
    }
    throw new Error(`Falha Storage ${response.status}: ${details || localFile}`);
  }
  return publicStorageUrl(storage.url, objectPath);
}

async function main() {
  const uploadRoot = path.resolve(rootDir, "_assets", "uploads", "products");
  if (!fs.existsSync(uploadRoot)) {
    report.ignored.push("0 imagens locais para migrar: _assets/uploads/products nao existe");
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const storage = getStorageConfig();
  const { rows: products } = await pool.query(`
    select id, image_url, primary_image_url, metadata
    from products
    where image_url like '/_assets/uploads/products/%'
       or primary_image_url like '/_assets/uploads/products/%'
       or metadata::text like '%/_assets/uploads/products/%'
       or exists (
         select 1 from product_images
         where product_images.product_id = products.id
           and product_images.url like '/_assets/uploads/products/%'
       )
    order by id
  `);

  for (const product of products) {
    const { rows: imageRows } = await pool.query(
      "select id, url from product_images where product_id = $1 order by position asc, created_at asc",
      [product.id]
    );
    const metadata = parseMetadata(product.metadata);
    const urls = unique([
      product.image_url,
      product.primary_image_url,
      ...(Array.isArray(metadata.images) ? metadata.images : []),
      ...imageRows.map((row) => row.url)
    ]);
    const localUrls = urls.filter(isLocalUploadUrl);
    if (!localUrls.length) continue;

    const replacements = new Map();
    for (const url of localUrls) {
      const localFile = localPathFromUrl(url);
      if (!localFile || !fs.existsSync(localFile)) {
        report.missing.push({ productId: product.id, url, localFile });
        continue;
      }
      const nextUrl = await uploadFile(storage, localFile, product.id);
      replacements.set(url, nextUrl);
      report.migrated.push({ productId: product.id, from: url, to: nextUrl });
    }
    if (!replacements.size) continue;

    const replaceUrl = (value) => replacements.get(value) || value;
    const nextMetadata = {
      ...metadata,
      images: Array.isArray(metadata.images) ? metadata.images.map(replaceUrl) : metadata.images
    };

    if (!dryRun) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query(
          "update products set image_url = $1, primary_image_url = $2, metadata = $3::jsonb, updated_at = now() where id = $4",
          [replaceUrl(product.image_url), replaceUrl(product.primary_image_url), JSON.stringify(nextMetadata), product.id]
        );
        for (const row of imageRows) {
          const nextUrl = replaceUrl(row.url);
          if (nextUrl !== row.url) {
            await client.query("update product_images set url = $1, updated_at = now() where id = $2", [nextUrl, row.id]);
            report.updatedProductImages += 1;
          }
        }
        await client.query("commit");
        report.updatedProducts += 1;
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    } else {
      report.updatedProducts += 1;
      report.updatedProductImages += imageRows.filter((row) => replaceUrl(row.url) !== row.url).length;
    }
  }

  const outDir = path.join(rootDir, "_validation", "storage-migration");
  await fs.promises.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, `product-image-storage-migration-${Date.now()}.json`);
  await fs.promises.writeFile(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, reportFile: outFile }, null, 2));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error.message, report }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
