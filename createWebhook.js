const axios = require("axios");

const storeHash = "jlmaubflvk";
const clientId = "dtb2sgkh1zpcxzdgu0ly7a16so2mp3u";
const accessToken = "gft8y3fgyxnat4i4zj852f7lpdtnyvj";

const destinationUrl = "https://e164-2405-201-4018-90a7-c840-b9d4-294c-1802.ngrok-free.app/order-events";

const api = axios.create({
  baseURL: `https://api.bigcommerce.com/stores/${storeHash}/v3`,
  headers: {
    "X-Auth-Client": clientId,
    "X-Auth-Token": accessToken,
    "Content-Type": "application/json",
    "Accept": "application/json"
  }
});

async function getAllWebhooks() {
  const res = await api.get("/hooks");
  return res.data.data || [];
}

async function deleteWebhook(id) {
  await api.delete(`/hooks/${id}`);
  console.log(`Deleted webhook ID: ${id}`);
}

async function cleanupWebhooks(scope) {
  const hooks = await getAllWebhooks();

  const matches = hooks.filter(
    h => h.scope === scope && h.destination === destinationUrl
  );

  for (const hook of matches) {
    await deleteWebhook(hook.id);
  }
}

async function createWebhook(scope) {
  await api.post("/hooks", {
    scope,
    destination: destinationUrl,
    is_active: true
  });

  console.log(`✅ Created webhook for ${scope}`);
}

async function recreateWebhook(scope) {
  console.log(`\n🔁 Processing webhook: ${scope}`);
  await cleanupWebhooks(scope);
  await createWebhook(scope);
}

async function createAllWebhooks() {
  const scopes = [
    "store/order/created",
    "store/order/updated",
    "store/order/statusUpdated",
    "store/order/refund/created"
  ];

  for (const scope of scopes) {
    await recreateWebhook(scope);
  }

  console.log("\n🚀 All webhooks refreshed successfully");
}

createAllWebhooks().catch(err => {
  console.error("❌ Webhook setup failed:", err.response?.data || err.message);
});
