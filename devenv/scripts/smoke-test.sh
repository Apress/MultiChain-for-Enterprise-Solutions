#!/bin/bash
# End-to-end smoke test: login as manager, issue an award, log in as
# that employee, check balance, redeem a gift card. Requires the dev
# environment to already be running (scripts/start-dev-environment.sh).
set -e

API="http://localhost:4000"

echo "==> Logging in as manager"
MGR_TOKEN=$(curl -s -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"oktaToken":"demo-manager-token"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['sessionToken'])")

echo "==> Issuing a manager discretionary award"
curl -s -X POST "$API/awards/manager" \
  -H "Authorization: Bearer $MGR_TOKEN" -H "Content-Type: application/json" \
  -d '{"employeeId":"emp-ps-9a12f6c3","reasonCode":"great-work","points":250}' | python3 -m json.tool

echo "==> Logging in as employee"
EMP_TOKEN=$(curl -s -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"oktaToken":"demo-employee-token"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['sessionToken'])")

echo "==> Checking balance"
curl -s "$API/redemptions/balance" -H "Authorization: Bearer $EMP_TOKEN" | python3 -m json.tool

echo "==> Redeeming a gift card"
curl -s -X POST "$API/redemptions/giftcard" \
  -H "Authorization: Bearer $EMP_TOKEN" -H "Content-Type: application/json" \
  -d '{"sku":"gc-amzn-25","quantity":1}' | python3 -m json.tool
