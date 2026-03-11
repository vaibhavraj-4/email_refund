const express = require("express");
const axios = require("axios");
const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(bodyParser.json());

const storeHash = "jlmaubflvk";
const clientId = "dtb2sgkh1zpcxzdgu0ly7a16so2mp3u";
const accessToken = "gft8y3fgyxnat4i4zj852f7lpdtnyvj";

const v3Headers = {
  "X-Auth-Client": clientId,
  "X-Auth-Token": accessToken,
  Accept: "application/json",
  "Content-Type": "application/json",
};

const v2Headers = {
  "X-Auth-Token": accessToken,
  Accept: "application/json",
};

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "netrapalsorout15@gmail.com",
    pass: "cqif kofs wdde emug",
  },
});

const sentEmails = {}; // { orderId: { created, updated, delivered, delayed, cancelled} }

// ---------- SEND EMAIL ----------
async function sendOrderEmail(
  order,
  type,
  itemsHTML,
  relatedHTML,
  billingAddressHTML,
  shippingAddressHTML,
  progressImage,
  labelOrdered,
  labelShipped,
  labelOut,
  labelDelivered,
  reviewOrderLink,
  ordersLink,
  accountLink,
  buyAgainLink,
  orderDate,
  orderTime,
  arrivingDate,
  refundReason = ""
) {
  let templateFile = "";
  let subject = "";

  if (type === "created") {
  templateFile = path.join(__dirname, "emailTemplates", "orderCreated.html");
  subject = `Order Confirmation #${order.id}`;
} else if (type === "updated") {
  templateFile = path.join(__dirname, "emailTemplates", "orderUpdated.html");
  subject = `Order Updated #${order.id}`;
} else if (type === "delivered") {
  templateFile = path.join(__dirname, "emailTemplates", "orderDelivered.html");
  subject = `Order Delivered #${order.id}`;
} else if (type === "delayed") {
  templateFile = path.join(__dirname, "emailTemplates", "orderDelayed.html");
  subject = `Delay Notice for Order #${order.id}`;
} else if (type === "cancelled") {
  templateFile = path.join(__dirname, "emailTemplates", "orderCancelled.html");
  subject = `Order Cancelled #${order.id}`;
} else if (type === "refunded") {
  templateFile = path.join(__dirname, "emailTemplates", "orderRefunded.html");
  subject = `Refund Processed for Order #${order.id}`;
} else {
  templateFile = path.join(__dirname, "emailTemplates", "orderUpdated.html");
  subject = `Order Notification #${order.id}`;
}
  if (!fs.existsSync(templateFile)) {
    console.warn(`Template missing: ${templateFile} — email will not be sent.`);
    return;
  }

  let template = fs.readFileSync(templateFile, "utf8");

  template = template
    .replace(/{{orderId}}/g, order.id)
    .replace(/{{customerName}}/g, (order.billing_address && order.billing_address.first_name) || "")
    .replace(/{{orderTotal}}/g, order.total_inc_tax || "")
    .replace(/{{items}}/g, itemsHTML || "")
    .replace(/{{recentHistory}}/g, relatedHTML || "")
    .replace(/{{billingAddress}}/g, billingAddressHTML || "")
    .replace(/{{shippingAddress}}/g, shippingAddressHTML || "")
    .replace(/{{paymentMethod}}/g, order.payment_method || "N/A")
    .replace(/{{shippingMethod}}/g, order.shipping_method || "N/A")
    .replace(/{{orderComments}}/g, order.customer_message || "No comments")
    .replace(/{{reviewOrderLink}}/g, reviewOrderLink || "")
    .replace(/{{ordersLink}}/g, ordersLink || "")
    .replace(/{{accountLink}}/g, accountLink || "")
    .replace(/{{buyAgainLink}}/g, buyAgainLink || "")
    .replace(/{{progressBar}}/g, progressImage || "")
    .replace(/{{labelOrdered}}/g, labelOrdered || "")
    .replace(/{{labelShipped}}/g, labelShipped || "")
    .replace(/{{labelOut}}/g, labelOut || "")
    .replace(/{{labelDelivered}}/g, labelDelivered || "")
    .replace(/{{orderDate}}/g, orderDate || "")
    .replace(/{{orderTime}}/g, orderTime || "")
    .replace(/{{arrivingDate}}/g, arrivingDate || "")
    .replace(/{{refundReason}}/g, refundReason || "");

  const toEmail = (order.billing_address && order.billing_address.email) || order.email;
  if (!toEmail) {
    console.warn("No customer email for order", order.id);
    return;
  }

  await transporter.sendMail({
    from: `"Venue" <netrapalsorout15@gmail.com>`,
    to: toEmail,
    subject,
    html: template,
  });

  console.log(`EMAIL SENT → ${type} for order ${order.id}`);
}

// ---------- RELATED PRODUCTS (9 items, ignore 0 price) ----------
async function getRelatedProducts(productId) {
  try {
    const prodResp = await axios.get(
      `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products/${productId}`,
      { headers: v3Headers }
    );

    const product = prodResp.data.data;
    const categories = product.categories || [];
    if (!categories.length) return [];

    const catResp = await axios.get(
      `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products?categories:in=${categories[0]}&limit=50`,
      { headers: v3Headers }
    );

    const allProducts = (catResp.data.data || []).filter((p) => p.id !== productId);
    // ignore products with price 0
    const filtered = allProducts.filter(
        (p) =>
          (p.price && p.price > 0) ||
          (p.variants && p.variants.length && p.variants[0].price > 0)
      );
      ;

    // prefer sale products if available
    let saleProducts = filtered.filter((p) => p.sale_price && p.sale_price > 0 && p.sale_price < p.price);
    const productsToUse = saleProducts.length ? saleProducts : filtered;

    const selected = productsToUse.slice(0, 9);
    const result = [];

    for (const c of selected) {
      const d = await axios.get(
        `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products/${c.id}?include=primary_image,variants`,
        { headers: v3Headers }
      );
      const pd = d.data.data;

      if (!pd || (!pd.price && (!pd.variants || !pd.variants[0] || !pd.variants[0].price))) continue;
      const basePrice =
        pd.price && pd.price > 0
          ? pd.price
          : pd.variants?.[0]?.price || 0;
      if (!basePrice || basePrice === 0) continue;

      let img = pd.primary_image?.url_standard || pd.primary_image?.url_thumbnail || "https://via.placeholder.com/150";
      if (img.startsWith("/")) img = `https://cdn11.bigcommerce.com/s-${storeHash}${img}`;

      result.push({
        id: c.id,
        img,
        url: pd.custom_url?.url ? `https://venuemarketplace.com${pd.custom_url.url}` : `https://venuemarketplace.com/products/${c.id}`,
        name: pd.name || "",
        price: Math.round(Number(basePrice)),
        sale_price: Math.round(Number(pd.sale_price || 0)),
        discount:
          pd.sale_price && pd.sale_price > 0 && pd.sale_price < basePrice
            ? Math.round(((basePrice - pd.sale_price) / basePrice) * 100)
            : 0,
      });
    }

    return result;
  } catch (err) {
    console.log("RELATED ERROR:", err.response?.data || err.message);
    return [];
  }
}

// ---------- BUILD 3x3 HTML (helper) ----------
function buildRelatedHtmlFromPool(relatedPool) {
  const unique = {};

  relatedPool.forEach((r) => {
    if (!r?.id) return;
    if (!r.name) return;

    const price = r.sale_price > 0 ? r.sale_price : r.price;
    if (!price || price <= 0) return;

    unique[r.id] = r;
  });

  const products = Object.values(unique).slice(0, 9);
  if (!products.length) return "";

  const formatPrice = (n) => `$${Number(n).toFixed(2)}`;

  let rows = "";

  for (let i = 0; i < products.length; i += 3) {
    rows += "<tr>";

    products.slice(i, i + 3).forEach((r) => {
      const image =
        r.img?.startsWith("http")
          ? r.img
          : `https://cdn11.bigcommerce.com/s-${storeHash}/product_images/uploaded_images/no-image.png`;

      const priceHTML =
        r.sale_price > 0 && r.sale_price < r.price
          ? `
            <div style="font-size:14px;font-weight:700;color:#000;">
              <span style="color:#e63946;">-${r.discount}%</span>
              ${formatPrice(r.sale_price)}
            </div>
            <div style="font-size:12px;color:#777;text-decoration:line-through;">
              ${formatPrice(r.price)}
            </div>`
          : `
            <div style="font-size:14px;font-weight:700;color:#000;">
              ${formatPrice(r.price)}
            </div>`;

      rows += `
        <td width="33.33%" align="center" style="padding:10px;">
          <a href="${r.url}" style="text-decoration:none;color:#000;">
            <img src="${image}" style="width:120px;height:120px;object-fit:cover;border-radius:8px;">
            ${priceHTML}
            <div style="font-size:13px;font-weight:600;margin-top:6px;max-width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${r.name}
            </div>
          </a>
        </td>
      `;
    });

    rows += "</tr>";
  }

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
      ${rows}
    </table>
  `;
}

function getFrontendLinks(orderId) {
  return {
    reviewOrderLink: `https://venuemarketplace.com/account.php?action=order_status&order_id=${orderId}`,
    ordersLink: `https://venuemarketplace.com/account.php?action=order_status`,
    accountLink: `https://venuemarketplace.com/account.php`,
    buyAgainLink: `https://venuemarketplace.com/search.php?mode=recurring`,
  };
}

const progressImages = {
  ordered: "https://cdn11.bigcommerce.com/s-jlmaubflvk/images/stencil/original/image-manager/ordetedprogressimg.png",
  shipped: "https://cdn11.bigcommerce.com/s-jlmaubflvk/images/stencil/original/image-manager/shippedprogressimg.png",
  out_for_delivery: "https://cdn11.bigcommerce.com/s-jlmaubflvk/images/stencil/original/image-manager/outfordeliveryprogressimg.png",
  delivered: "https://cdn11.bigcommerce.com/s-jlmaubflvk/images/stencil/original/image-manager/deliveredprogressimg.png",
};

// AUTO DELAY DETECTION
const DELAY_DAYS = 4;
const DELAY_CHECK_INTERVAL_SEC = 60 * 60;
async function checkForDelayedOrders() {
  try {
    console.log("⏱ Checking for delayed orders...");

    // Pull recent orders - we'll fetch orders created in the last 30 days to be safe
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const isoSince = since.toISOString();

    // v2 endpoint supports min_date_created query param
    const resp = await axios.get(
  `https://api.bigcommerce.com/stores/${storeHash}/v2/orders?limit=250`,
  { headers: v2Headers }
);

  const orders = resp.data || [];

const filteredOrders = orders.filter(order => {
  const created = new Date(order.date_created);
  return created >= since;
});

for (const order of filteredOrders) {

  // ensure tracking object
  sentEmails[order.id] = sentEmails[order.id] || {
    created: false,
    updated: false,
    delivered: false,
    delayed: false,
    return: false,
  };

  // skip if already delivered
  if (order.status_id === 10) continue;

  // skip if delayed email already sent
  if (sentEmails[order.id].delayed) continue;

  const created = new Date(order.date_created);
  const eta = new Date(created);
  eta.setDate(eta.getDate() + DELAY_DAYS);

  const now = new Date();

  if (now > eta) {

    let itemsHTML = "";
    let relatedPool = [];

    let itemsResp;
    try {
      itemsResp = await axios.get(
        `https://api.bigcommerce.com/stores/${storeHash}/v2/orders/${order.id}/products`,
        { headers: v2Headers }
      );
    } catch (e) {
      console.warn("Failed to fetch order items for delay check:", e.response?.data || e.message);
      continue;
    }

    const items = itemsResp.data || [];

    for (const it of items) {
      try {
        const pdResp = await axios.get(
          `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products/${it.product_id}?include=primary_image`,
          { headers: v3Headers }
        );

        const pd = pdResp.data.data;

        let img = pd.primary_image?.url_standard || pd.primary_image?.url_thumbnail || "https://via.placeholder.com/110";
        if (img.startsWith("/")) img = `https://cdn11.bigcommerce.com/s-${storeHash}${img}`;

        const productUrl = pd.custom_url?.url
          ? `https://venuemarketplace.com${pd.custom_url.url}`
          : `https://venuemarketplace.com/products/${it.product_id}`;

        itemsHTML += `
          <table width="100%" style="border-bottom:1px solid #eee; margin-bottom:15px;">
            <tr>
              <td width="105">
                <img src="${img}" style="width:95px; height:95px; object-fit:cover; border-radius:6px;">
              </td>
              <td style="padding-left:15px;">
                <a href="${productUrl}" style="font-size:15px; font-weight:600; color:#000;">
                  ${it.name}
                </a>
                <div style="font-size:13px; color:#777;">
                  Quantity: ${it.quantity}
                </div>
              </td>
              <td width="90" align="right" style="font-size:16px; font-weight:700;">
                $${(it.price_inc_tax * it.quantity).toFixed(2)}
              </td>
            </tr>
          </table>
        `;

        const rel = await getRelatedProducts(it.product_id);
        relatedPool.push(...rel);

      } catch (e) {
        console.warn("Failed to fetch product for delay email:", e.response?.data || e.message);
      }
    }

    let relatedHTML = buildRelatedHtmlFromPool(relatedPool, items);

    const b = order.billing_address || {};
    const billingAddressHTML =
      `${b.first_name || ""} ${b.last_name || ""}, ${b.street_1 || ""}${b.street_2 ? ", " + b.street_2 : ""}, ${b.city || ""}, ${b.state || ""} - ${b.zip || ""}, ${b.country || ""}, Phone: ${b.phone || "N/A"}`;

    let shippingAddressHTML = "N/A";

    try {
      const shipResp = await axios.get(
        `https://api.bigcommerce.com/stores/${storeHash}/v2/orders/${order.id}/shipping_addresses`,
        { headers: v2Headers }
      );

      if (shipResp.data && shipResp.data.length) {
        const s = shipResp.data[0];
        shippingAddressHTML =
          `${s.first_name || ""} ${s.last_name || ""}, ${s.street_1 || ""}${s.street_2 ? ", " + s.street_2 : ""}, ${s.city || ""}, ${s.state || ""} - ${s.zip || ""}, ${s.country || ""}, Phone: ${s.phone || "N/A"}`;
      }
    } catch (e) {}

    const frontendLinks = getFrontendLinks(order.id);

    await sendOrderEmail(
      order,
      "delayed",
      itemsHTML,
      relatedHTML,
      billingAddressHTML,
      shippingAddressHTML,
      "",
      "",
      "",
      "",
      "",
      frontendLinks.reviewOrderLink,
      frontendLinks.ordersLink,
      frontendLinks.accountLink,
      frontendLinks.buyAgainLink,
      created.toLocaleDateString(),
      created.toLocaleTimeString(),
      eta.toLocaleDateString()
    );

    sentEmails[order.id].delayed = true;
  }
}
  } catch (err) {
    console.log("Delay check error:", err.response?.data || err.message);
  }
}

// run initial check and schedule
checkForDelayedOrders().catch((e) => console.warn("Initial delay check failed:", e.message));
setInterval(checkForDelayedOrders, DELAY_CHECK_INTERVAL_SEC * 1000);

// ---------- MAIN WEBHOOK HANDLER ----------
app.post("/order-events", async (req, res) => {
  try {
    const scope = req.body.scope;
    const orderId = req.body.data?.id;
    if (!orderId) return res.status(400).send("Missing order id");

   const now = new Date().toLocaleString();
console.log(`\n[${now}] EVENT: ${scope} | ORDER: ${orderId}`);

     const {
      reviewOrderLink,
      ordersLink,
      accountLink,
      buyAgainLink,
     } = getFrontendLinks(orderId);

    // ensure tracking object
    sentEmails[orderId] = sentEmails[orderId] || {
      created: false,
      updated: false,
      delivered: false,
      delayed: false,
      cancelled: false,
    };

    // fetch order
    const orderResp = await axios.get(`https://api.bigcommerce.com/stores/${storeHash}/v2/orders/${orderId}`, { headers: v2Headers });
    const order = orderResp.data;
    const statusId = order.status_id;

    // date/time
    const rawDate = new Date(order.date_created);
    const orderDate = rawDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const orderTime = rawDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    const eta = new Date(rawDate);
    eta.setDate(eta.getDate() + DELAY_DAYS);
    const arrivingDate = eta.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

    let progressImage = progressImages.ordered;
    if (statusId === 2) progressImage = progressImages.shipped;
    if (statusId === 7) progressImage = progressImages.out_for_delivery;
    if (statusId === 10) progressImage = progressImages.delivered;

    const labelOrdered = (statusId === 1 || statusId === 11) ? "active" : "";
    const labelShipped = statusId === 2 ? "active" : "";
    const labelOut = statusId === 7 ? "active" : "";
    const labelDelivered = statusId === 10 ? "active" : "";

    // items + related pool
    const itemsResp = await axios.get(`https://api.bigcommerce.com/stores/${storeHash}/v2/orders/${orderId}/products`, { headers: v2Headers });
    const items = itemsResp.data || [];
    let itemsHTML = "";
    let relatedPool = [];

    for (const it of items) {
      try {
        const pdResp = await axios.get(
          `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products/${it.product_id}?include=primary_image`,
          { headers: v3Headers }
        );
        const pd = pdResp.data.data;

        let imageUrl = pd.primary_image?.url_standard || pd.primary_image?.url_thumbnail || "https://via.placeholder.com/110";
        if (imageUrl.startsWith("/")) imageUrl = `https://cdn11.bigcommerce.com/s-${storeHash}${imageUrl}`;

        const productUrl = pd.custom_url?.url ? `https://venuemarketplace.com${pd.custom_url.url}` : `https://venuemarketplace.com/products/${it.product_id}`;

        itemsHTML += `
          <table width="100%" style="border-bottom:1px solid #eee; margin-bottom:15px;">
            <tr>
              <td width="105">
                <img src="${imageUrl}" style="width:95px; height:95px; object-fit:cover; border-radius:6px;">
              </td>
              <td style="padding-left:15px;">
                <a href="${productUrl}" style="font-size:15px; font-weight:600; color:#000;">
                  ${it.name}
                </a>
                <div style="font-size:13px; color:#777;">
                  Quantity: ${it.quantity}
                </div>
              </td>
              <td width="90" align="right" style="font-size:16px; font-weight:700;">
                $${(it.price_inc_tax * it.quantity).toFixed(2)}
              </td>
            </tr>
          </table>
        `;

        const rel = await getRelatedProducts(it.product_id);
        relatedPool.push(...rel);
      } catch (e) {
        console.warn("Failed item product fetch in webhook:", e.response?.data || e.message);
      }
    }

    // build related HTML
    const relatedHTML = buildRelatedHtmlFromPool(relatedPool, items);

    // billing / shipping html
    const b = order.billing_address || {};
    const billingAddressHTML = `${b.first_name || ""} ${b.last_name || ""}, ${b.street_1 || ""}${b.street_2 ? ", " + b.street_2 : ""}, ${b.city || ""}, ${b.state || ""} - ${b.zip || ""}, ${b.country || ""}, Phone: ${b.phone || "N/A"}`;

    let shippingAddressHTML = "N/A";
    try {
      const shipResp = await axios.get(`https://api.bigcommerce.com/stores/${storeHash}/v2/orders/${orderId}/shipping_addresses`, { headers: v2Headers });
      if (shipResp.data && shipResp.data.length) {
        const s = shipResp.data[0];
        shippingAddressHTML = `${s.first_name || ""} ${s.last_name || ""}, ${s.street_1 || ""}${s.street_2 ? ", " + s.street_2 : ""}, ${s.city || ""}, ${s.state || ""} - ${s.zip || ""}, ${s.country || ""}, Phone: ${s.phone || "N/A"}`;
      }
    } catch (e) {}

    // ============= SEND E-MAILS based on scope =============
    if (scope === "store/order/created" && !sentEmails[orderId].created) {
      await sendOrderEmail(order, "created", itemsHTML, relatedHTML, billingAddressHTML, shippingAddressHTML, progressImage, labelOrdered, labelShipped, labelOut, labelDelivered, reviewOrderLink, ordersLink, accountLink, buyAgainLink, orderDate, orderTime, arrivingDate);
      sentEmails[orderId].created = true;
      return res.send("created");
    }

    if (scope === "store/order/updated" && !sentEmails[orderId].updated) {
      await sendOrderEmail(order, "updated", itemsHTML, relatedHTML, billingAddressHTML, shippingAddressHTML, progressImage, labelOrdered, labelShipped, labelOut, labelDelivered, reviewOrderLink, ordersLink, accountLink, buyAgainLink, orderDate, orderTime, arrivingDate);
      sentEmails[orderId].updated = true;
      return res.send("updated");
    }

    // ================= ORDER CANCELLED =================
        if (
            scope === "store/order/statusUpdated" &&
            statusId === 5 &&
            !sentEmails[orderId].cancelled
          ) {
            await sendOrderEmail(
              order,
              "cancelled",
              itemsHTML,
              relatedHTML,
              billingAddressHTML,
              shippingAddressHTML,
              progressImage,
              labelOrdered,
              labelShipped,
              labelOut,
              labelDelivered,
              reviewOrderLink,
              ordersLink,
              accountLink,
              buyAgainLink,
              orderDate,
              orderTime,
              arrivingDate
            );

            sentEmails[orderId].cancelled = true;
            return res.send("cancelled");
          }

    if (scope === "store/order/statusUpdated" && statusId === 10 && !sentEmails[orderId].delivered) {
      await sendOrderEmail(order, "delivered", itemsHTML, relatedHTML, billingAddressHTML, shippingAddressHTML, progressImage, labelOrdered, labelShipped, labelOut, labelDelivered, reviewOrderLink, ordersLink, accountLink, buyAgainLink, orderDate, orderTime, arrivingDate);
      sentEmails[orderId].delivered = true;
      return res.send("delivered");
    }

// ================= REFUND EMAIL =================
if (scope === "store/order/refund/created") {

  console.log(`REFUND EVENT RECEIVED → ORDER ${orderId}`);

  const refundResp = await axios.get(
    `https://api.bigcommerce.com/stores/${storeHash}/v3/orders/${orderId}/payment_actions/refunds`,
    { headers: v3Headers }
  );

  const refunds = refundResp.data.data || [];
  const refund = refunds[0] || {};

  const refundReason = refund.reason || "No reason provided";

  console.log("Refund Reason:", refundReason);

  await sendOrderEmail(
    order,
    "refunded",
    itemsHTML,
    relatedHTML,
    billingAddressHTML,
    shippingAddressHTML,
    progressImage,
    labelOrdered,
    labelShipped,
    labelOut,
    labelDelivered,
    reviewOrderLink,
    ordersLink,
    accountLink,
    buyAgainLink,
    orderDate,
    orderTime,
    arrivingDate,
    refundReason
  );

  return res.send("refund email sent");
}
    res.send("ignored");
  } catch (err) {
    console.log("SERVER ERROR:", err.response?.data || err.message);
    return res.status(500).send("server error");
  }
});

// ---------- START SERVER ----------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook server running on port ${PORT}`);
  console.log(`⏱ Delay detection enabled (orders older than ${DELAY_DAYS} days will be considered delayed)`);
});