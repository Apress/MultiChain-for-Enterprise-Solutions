# Meridian Rewards - Development Environment and Demo Code

Companion code for Chapter 7, *Implementation and Development Workflow*,
of **MultiChain for Enterprise Solutions**.

This folder is a complete, runnable development environment for the
Meridian Rewards platform designed in Chapters 4 through 6:

- Three MultiChain **Community Edition** nodes in Docker, one per
  Meridian region (US, UK, India), reflecting the topology roles
  from Chapter 5 at development scale.
- A **Node.js** business logic and REST API layer that enforces the
  functional requirements from Chapter 4 (Table 4.5) against the
  streams defined in Chapter 6 (Table 6.2).
- A **Streamlit** self-service and administration UI, where signing in
  establishes the caller's role (employee, manager, administrator,
  auditor) for the rest of the session.
- **WireMock** mock servers standing in for Workday, Okta, and
  GiftFlex, with separate, region-specific fixture sets for US, UK,
  and India.

See `docs/setup-guide.md` for full setup instructions and
`docs/production-notes.md` for how this environment differs from a
production deployment (MultiChain Enterprise Edition, high
availability, security hardening).

## Quick start

```bash
./scripts/start-dev-environment.sh
./scripts/smoke-test.sh
```

Then open the UI at http://localhost:8501 and sign in as any of the
four demo roles.

Once the testing is complete to stop running docker images
```bash
./scripts/stop-dev-environment.sh
```
## Repository layout

```
docker-compose.yml          Orchestrates all services
docker/                     One folder per MultiChain regional node
nodejs-api/                 Business logic + REST API (Express)
streamlit-ui/               Role-based UI (Streamlit)
wiremock-us/                Workday/Okta/GiftFlex mocks, US fixtures
wiremock-uk/                Workday/Okta/GiftFlex mocks, UK fixtures
wiremock-india/             Workday/Okta/GiftFlex mocks, India fixtures
scripts/                    Bring-up, teardown, and smoke-test scripts
docs/                       Setup guide and production notes
diagrams/                   Editable draw.io sources for the chapter figures
```

## Requirements

- Docker Engine 24+ and Docker Compose v2 (a recent release)
- Node.js 26+ (only needed if running the API outside Docker)
- Python 3.14+ (only needed if running the UI outside Docker)
- Ports 4000, 8081-8083, 8501, 9740-9745 free on the host
- On Windows, install Docker Desktop with the WSL2 backend enabled, plus an Ubuntu distribution (`wsl --install -d Ubuntu`). Run all commands and scripts from the Ubuntu terminal.