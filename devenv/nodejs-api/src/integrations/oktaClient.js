// Client for the Okta identity provider (Zone B). The dev environment
// mocks Okta's token introspection endpoint so the Streamlit login
// screen (Section 7.6) can establish a role without a live tenant.

const axios = require('axios');

const baseURL = process.env.OKTA_MOCK_URL;

async function introspectToken(oktaToken) {
  const { data } = await axios.post(`${baseURL}/okta/v1/introspect`, { token: oktaToken });
  // Expected shape: { active, userId, groups: ["employee"|"manager"|"admin"|"auditor"], region }
  return data;
}

module.exports = { introspectToken };
