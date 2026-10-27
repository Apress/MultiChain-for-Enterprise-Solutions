# Setup Guide

This guide sets up every component in Chapter 7's development
environment from a clean machine. It expands on Section 7.7 of the
manuscript with copy-pasteable commands.

## 1. Prerequisites

| Tool | Minimum version | Check |
|---|---|---|
| Docker Engine | 24.x | `docker --version` |
| Docker Compose plugin | v2.20+ | `docker compose version` |
| Free disk space | 4 GB | - |
| Free host ports | 4000, 8081-8083, 8501, 9740-9745 | `lsof -i :4000` etc. |

Optional, only if you want to run a component outside Docker for
debugging:

- Node.js 20+ and npm 10+ (`node --version`)
- Python 3.11+ and pip (`python3 --version`)

## 2. Clone/copy the code folder

Place this folder anywhere on your machine, e.g. `~/meridian-rewards-ch07`.
All commands below assume your shell's current directory is the
repository root (the folder containing `docker-compose.yml`).

## 3. Build the images

```bash
docker compose build
```

This builds four custom images: `multichain-us`, `multichain-uk`,
`multichain-india` (each installs MultiChain Community Edition 2.3.3
inside an Ubuntu 22.04 base), `rewards-api` (Node.js 20), and
`rewards-ui` (Python 3.11 with Streamlit). WireMock uses the published
`wiremock/wiremock` image directly and needs no build step.

## 4. Start the MultiChain nodes and mocks

```bash
docker compose up -d multichain-us multichain-uk multichain-india \
  wiremock-us wiremock-uk wiremock-india
```

`multichain-us` is the seed node: its entrypoint script
(`docker/multichain-us/entrypoint.sh`) creates the `meridianrewards`
chain on first start and then runs `bootstrap-streams.sh`, which
creates the five streams from Chapter 6's Table 6.2
(`award-events`, `redemption-events`, `correction-events`,
`offboarding-events`, `audit-index`) and grants the administrator
address write permission on them, mirroring the Rewards Program
Administrator row of Chapter 4's Table 4.3.

`multichain-uk` and `multichain-india` wait for the seed node's
network port to accept connections, then join the same chain as peer
nodes. Confirm all three are healthy:

```bash
docker compose logs -f multichain-us
docker exec -it multichain-uk multichain-cli meridianrewards getinfo
docker exec -it multichain-india multichain-cli meridianrewards getinfo
```

All three should report the same `blocks` count once synchronized.

## 5. Start the API and UI

```bash
docker compose up -d rewards-api rewards-ui
```

Check the API health endpoint:

```bash
curl http://localhost:4000/health
```

## 6. Sign in

Open http://localhost:8501. Choose a role from the dropdown (Employee,
Manager, Administrator, Auditor) and click **Sign in**. This calls
`POST /auth/login` on the API with a fixed demo token
(`demo-employee-token`, etc.), which the API exchanges for role claims
against the WireMock Okta mock, then issues a short-lived session JWT.
Every button click on subsequent screens sends that JWT as a bearer
token.

## 7. Run the smoke test

```bash
./scripts/smoke-test.sh
```

This exercises the full path from Chapter 4's Workflow WF-3 (manager
award) through WF-5 (gift card redemption) purely over HTTP, useful
for CI or for verifying the environment without opening the UI.

## 8. Running the API or UI outside Docker (debugging)

```bash
# API
cd nodejs-api
npm install
MULTICHAIN_HOST=localhost MULTICHAIN_RPC_PORT=9741 \
MULTICHAIN_RPC_USER=meridian-us-rpc MULTICHAIN_RPC_PASSWORD=devpassword-us-only \
MULTICHAIN_CHAIN_NAME=meridianrewards REGION=us-east \
WORKDAY_MOCK_URL=http://localhost:8081 OKTA_MOCK_URL=http://localhost:8081 \
GIFTFLEX_MOCK_URL=http://localhost:8081 JWT_SIGNING_SECRET=dev-only-secret \
npm run dev

# UI, in a second terminal
cd streamlit-ui
pip install -r requirements.txt
REWARDS_API_BASE_URL=http://localhost:4000 streamlit run app.py
```

## 9. Switching the API to a different region's mocks

The `REGION` and `*_MOCK_URL` environment variables in
`docker-compose.yml`'s `rewards-api` service determine which
WireMock instance (and therefore which fixture set) the API talks to.
To exercise the UK fixtures, change:

```yaml
- REGION=uk-london
- MULTICHAIN_HOST=multichain-uk
- MULTICHAIN_RPC_PORT=9742
- MULTICHAIN_RPC_USER=meridian-uk-rpc
- MULTICHAIN_RPC_PASSWORD=devpassword-uk-only
- WORKDAY_MOCK_URL=http://wiremock-uk:8082
- OKTA_MOCK_URL=http://wiremock-uk:8082
- GIFTFLEX_MOCK_URL=http://wiremock-uk:8082
```

and re-run `docker compose up -d --force-recreate rewards-api`. A
production deployment does not hardcode this: each region runs its
own instance of the application layer against its own gateway node,
exactly as Chapter 5, Section 5.3 describes.

## 10. Tearing down

```bash
./scripts/stop-dev-environment.sh        # stop containers, keep data
./scripts/stop-dev-environment.sh -v     # stop and wipe chain state
```
