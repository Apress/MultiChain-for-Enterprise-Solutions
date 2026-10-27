// Client for GiftFlex Solutions (Zone C fulfilment vendor). Only the
// data minimized at the Zone A/Zone C boundary in WF-5 (SKU, quantity,
// pseudonymous token) ever crosses this client.

const axios = require('axios');

const baseURL = process.env.GIFTFLEX_MOCK_URL;

async function getSkuPointCost(sku) {
  const { data } = await axios.get(`${baseURL}/giftflex/v1/catalog/${sku}`);
  return data.pointCost;
}

async function requestFulfilment({ sku, quantity, pseudonymousToken }) {
  const { data } = await axios.post(`${baseURL}/giftflex/v1/fulfil`, {
    sku,
    quantity,
    fulfilmentToken: pseudonymousToken
  });
  return data; // { redemptionCode, status }
}

module.exports = { getSkuPointCost, requestFulfilment };
