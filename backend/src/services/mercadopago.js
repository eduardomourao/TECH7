import { MercadoPagoConfig, Preference, Payment } from "mercadopago";

const TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
const PUBLIC_KEY = process.env.MERCADOPAGO_PUBLIC_KEY;
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5500";

let client = null;

function getClient() {
  if (!client && TOKEN && TOKEN !== "APP_USR-XXXXXXXX" && TOKEN !== "TEST-XXXXXXXX") {
    client = new MercadoPagoConfig({ accessToken: TOKEN, options: { timeout: 15000 } });
  }
  return client;
}

export function isMercadoPagoConfigured() {
  return getClient() !== null;
}

export function getPublicKey() {
  return PUBLIC_KEY || "";
}

// ---------------------------------------------------------------
// Mock (no SDK configured)
// ---------------------------------------------------------------
export async function createMockCheckout(orderId) {
  return {
    isMock: true,
    orderId,
    paymentUrl: `${FRONTEND_URL}/pedido-confirmado.html?order=${encodeURIComponent(orderId)}`,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  };
}

// ---------------------------------------------------------------
// Real preference via SDK
// ---------------------------------------------------------------
export async function createMercadoPagoPreference(order) {
  const mp = getClient();
  if (!mp) throw new Error("Mercado Pago not configured");

  const items = (order.items || []).map((item) => ({
    id: item.product_id || item.productId || "prod",
    title: String(item.product_name || item.name || "Produto").slice(0, 80),
    description: String(item.product_name || item.name || "").slice(0, 120),
    quantity: Number(item.qty || item.quantity || 1),
    currency_id: "BRL",
    unit_price: Number(item.unit_price || item.unitPrice || item.price || 0),
  }));

  const payer = {};
  if (order.customer?.email) payer.email = order.customer.email;
  if (order.customer?.name) payer.name = order.customer.name;

  const preference = new Preference(mp);
  const result = await preference.create({
    body: {
      external_reference: order.id,
      notification_url: `${BASE_URL}/api/checkout/webhook`,
      items,
      payer: Object.keys(payer).length > 0 ? payer : undefined,
      back_urls: {
        success: `${FRONTEND_URL}/pedido-confirmado.html?order=${encodeURIComponent(order.id)}`,
        failure: `${FRONTEND_URL}/checkout/erro.html?order=${encodeURIComponent(order.id)}`,
        pending: `${FRONTEND_URL}/checkout/pendente.html?order=${encodeURIComponent(order.id)}`,
      },
      auto_return: "approved",
      statement_descriptor: process.env.STORE_NAME || "TECH 7",
    },
  });

  return {
    isMock: false,
    orderId: order.id,
    preferenceId: result.id,
    paymentUrl: result.init_point || result.sandbox_init_point,
  };
}

// ---------------------------------------------------------------
// Payment lookup via SDK
// ---------------------------------------------------------------
export async function getPaymentInfo(paymentId) {
  const mp = getClient();
  if (!mp) throw new Error("Mercado Pago not configured");

  const payment = new Payment(mp);
  const result = await payment.get({ id: paymentId });

  return {
    id: result.id,
    status: mapStatus(result.status),
    rawStatus: result.status,
    externalReference: result.external_reference,
    transactionAmount: result.transaction_amount,
    paymentMethod: result.payment_method_id,
    payerEmail: result.payer?.email,
  };
}

// ---------------------------------------------------------------
// Status mapping
// ---------------------------------------------------------------
export function mapStatus(mpStatus) {
  const map = {
    approved: "paid",
    authorized: "paid",
    completed: "paid",
    in_process: "pending",
    in_mediation: "pending",
    pending: "pending",
    rejected: "failed",
    cancelled: "cancelled",
    refunded: "refunded",
    charged_back: "refunded",
  };
  return map[mpStatus] || "pending";
}
