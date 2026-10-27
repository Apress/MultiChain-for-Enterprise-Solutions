// Client for the Workday HRIS integration (Table 4.8). Points at the
// region-specific WireMock instance configured via WORKDAY_MOCK_URL,
// so switching REGION in docker-compose.yml is enough to exercise
// US, UK, or India fixture data without changing any application code.

const axios = require('axios');

const baseURL = process.env.WORKDAY_MOCK_URL;

async function getQualifyingLifecycleEvents() {
  const { data } = await axios.get(`${baseURL}/workday/v1/lifecycle-events`);
  return data.events;
}

async function getEmployeeStatus(employeeId) {
  const { data } = await axios.get(`${baseURL}/workday/v1/employees/${employeeId}/status`);
  return data.status;
}

module.exports = { getQualifyingLifecycleEvents, getEmployeeStatus };
