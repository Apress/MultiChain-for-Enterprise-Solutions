# Production Notes

This document expands on Chapter 7, Sections 7.8 through 7.10 of the
manuscript. It is deliberately kept separate from the runnable dev
environment: nothing here should be treated as a deployment script to
run as-is, it is a design reference for the team that builds the
production topology on top of Chapter 5's seven-node network.

## 1. MultiChain Community Edition vs. Enterprise Edition, in this codebase

Table 6.3 in Chapter 6 and Table 5.5 in Chapter 5 already establish
the general capability differences. This section states exactly what
changes in the code and configuration in this folder if the target
is MultiChain Enterprise 2.3.3 instead of Community Edition.

| Area | Community Edition (this repo) | Enterprise Edition (production) |
|---|---|---|
| Docker base image | Built from the public `multichain-x.y.z.tar.gz` download in `docker/*/Dockerfile` | Built `FROM` a licensed image such as `meridian/multichain-enterprise:2.3.3` (Chapter 5, Listing 5.1); requires `MULTICHAIN_LICENSE_KEY` |
| Chain creation flags | `multichain-util create` with the open flags shown in `entrypoint.sh` | Same command, but with `-anyone-can-connect=false` etc. enforced from a signed license, and enterprise-only flags such as encrypted-stream defaults available |
| Node-to-node auth | Network-level trust (Docker bridge network only) | Enterprise supports mutual TLS between nodes; production `multichain.conf` sets `handshake-local` and certificate paths |
| Field-level encryption | Not used; this repo relies entirely on the exclusion/pseudonymization pattern from Chapter 6, Section 6.7 | Available; would change `award-events`/`redemption-events` payload handling in `nodejs-api/src/multichain/client.js` to encrypt selected JSON fields before publish |
| Off-chain storage tie-in | Manual: `reason_ref` hash pointers resolved by the application database (not implemented in this dev repo, stubbed as plain fields) | Platform-managed off-chain storage APIs tied to on-chain hashes |
| Support and SLA | Community forums only | Vendor SLA, referenced against Table 4.6's 4-hour RTO |

No application code in `nodejs-api/` or `streamlit-ui/` changes when
moving to Enterprise Edition, by design: `src/multichain/client.js` is
the single seam between business logic and the chain (see its file
comment). Only the Dockerfile, `multichain.conf`, and the chain
creation flags change.

## 2. From three dev containers to Chapter 5's seven-node topology

The dev environment in this repo runs one MultiChain node per region
purely to demonstrate the three-region concept cheaply on a laptop.
Production uses Chapter 5's full node inventory (Table 5.2): three
nodes in the US (two validators, one gateway), two in the UK
(validator/admin, observer), two in India (validator, gateway/ops).

Concretely, production changes from this dev repo in the following
ways:

- **Orchestration.** `docker-compose.yml` is replaced by a Kubernetes
  manifest set (or equivalent) per region, with a `StatefulSet` per
  node so each keeps a stable network identity and its own persistent
  volume, matching the "one container, one identity" assumption
  `entrypoint.sh` already makes.
- **Admin quorum.** The single seed-node bootstrap in
  `bootstrap-streams.sh` is replaced by the two-admin-node,
  2-of-2 quorum process from Chapter 5, Listing 5.3. Production
  permission grants are issued from a change-controlled pipeline, not
  a container entrypoint.
- **Mining diversity.** Chapter 5 fixes a 30 percent diversity cap
  across four mining nodes. The dev environment does not configure
  mining diversity at all, since a three-node, non-adversarial dev
  chain has no diversity risk worth modeling.
- **Gateway isolation.** In production, `rewards-api` talks only to
  its region's API gateway node (`US-NODE-03`, `IN-NODE-02`), never to
  a validating or admin node's RPC port directly. The dev
  `docker-compose.yml` connects the API straight to `multichain-us`
  for simplicity; this is a deliberate simplification flagged here,
  not a pattern to carry into production.

## 3. High availability and zero data loss

Three layers of the stack need HA and data-loss requirements stated
explicitly, since "zero data loss" means something different at each.

**Chain layer.** MultiChain's own replication already gives every
node a full copy of confirmed history (Chapter 5, Section 5.4). Zero
data loss at this layer means: (a) every region keeps at least two
independent nodes per Table 5.2's minimum, (b) `mc-data` volumes are
backed by replicated block storage (e.g. cloud-provider multi-AZ
persistent disks) rather than a single host disk, and (c) a
region's EmpID-to-identity lookup table, which is deliberately never
replicated onto the chain, is backed up independently on an
encrypted, cross-facility schedule, per Chapter 5's disaster recovery
discussion.

**API layer.** `rewards-api` in this repo is a single stateless
container with an in-memory budget map (`awardService.js`) that is
explicitly marked dev-only. Production replaces that in-memory map
with the off-chain operational database from Chapter 6 (a managed,
multi-AZ relational database with synchronous replication), and runs
at least two API replicas per region behind a load balancer, so a
single pod or VM failure never loses an in-flight budget check.

**UI layer.** `rewards-ui` is stateless by design (session state lives
in the browser's Streamlit session, not on disk), so HA here is purely
a matter of running multiple replicas behind a load balancer with
sticky sessions, or moving to a stateless-session pattern if a future
UI (see Section 5 below) needs to scale past a handful of instances.

**Recovery targets.** Production inherits Chapter 4's Table 4.6
non-functional requirements directly: 99.5 percent business-hours
availability, 4-hour RTO, 15-minute RPO. The chain layer already meets
RPO=0 for confirmed transactions by virtue of synchronous
multi-node replication; the RPO figure in Table 4.6 is driven by the
off-chain database and the EmpID lookup table, not by the chain.

## 4. Security hardening checklist for production

None of the following are implemented in this dev repo; they are
listed here as the concrete gap between "runs on a laptop" and
"passes a production security review."

- Replace the fixed `demo-*-token` Okta shortcuts in `app.py` with a
  real OIDC authorization code redirect to Meridian's Okta tenant.
- Replace `JWT_SIGNING_SECRET`, a plaintext dev value, with a secret
  pulled from a managed secrets store (e.g. cloud KMS-backed secrets
  manager) and rotated on a schedule.
- Terminate TLS in front of `rewards-api` and `rewards-ui`; the dev
  containers serve plain HTTP on the Docker bridge network only.
- Restrict MultiChain RPC ports (9741-9745 in this repo) to
  the application layer's private subnet; never expose an RPC port
  to a public load balancer, consistent with Chapter 5's note on
  Listing 5.1.
- Move the WireMock-based external integrations to real Workday,
  Okta, and GiftFlex endpoints with mutual TLS or OAuth2
  client-credential flows, and remove WireMock from the production
  image set entirely (it is a test double, not a production
  dependency).
- Run a static and dependency vulnerability scan
  (`npm audit`, `pip-audit`, container image scanning) in CI before
  each deployment.

## 5. Designing for an agentic AI interface

Section 7.10 of the manuscript introduces the intent to eventually
replace or supplement the Streamlit UI with a conversational, agentic
AI interface (for example, an employee asking "how many points do I
have" or "redeem a $25 gift card for me" in natural language). The
codebase in this repo is already shaped to make that swap additive
rather than disruptive, for one reason: `streamlit-ui/app.py` never
talks to MultiChain directly, it only calls `rewards-api`'s REST
endpoints. An agentic UI is therefore a second, independent client of
the exact same API surface (`/auth/login`, `/awards/*`,
`/redemptions/*`, `/corrections/*`), not a replacement for anything
in `nodejs-api/`.

The concrete integration shape anticipated for a future chapter:

- The agent calls the same `/auth/login` endpoint to establish a role,
  exactly as `app.py` does, so role enforcement in
  `src/middleware/auth.js` needs no change.
- Each REST endpoint in `nodejs-api/src/routes/` is described as a
  tool the agent can call (a "function" or "tool" definition in
  whatever agent framework is chosen), with the same request and
  response shapes already defined here.
- The dual-approval rule in `correctionService.js` and the budget
  check in `awardService.js` remain enforced in the API layer, not in
  the agent, so a compromised or hallucinating agent still cannot
  bypass FR-3, FR-4, or FR-9: those guarantees come from who holds a
  chain-write-capable address, not from which client happened to call
  the API.
- A new `agent-gateway` service would sit alongside `rewards-api` and
  `rewards-ui` in `docker-compose.yml`, translating natural-language
  intents into calls against the existing REST surface, and would be
  added without modifying `nodejs-api/` at all.

## 6. Designing for multi-DLT settlement (Corda, Ethereum)

Section 7.10 also anticipates that redemption or settlement in a
future chapter may need to reach a party operating on a different
ledger, for example a coalition partner on Corda or a public-chain
settlement rail on Ethereum for a specific reward category. This repo
does not implement that integration; it deliberately keeps the seam
where it would attach.

`src/multichain/client.js`'s file comment already states the design
intent: it is the only module that knows how to talk to MultiChain.
The equivalent pattern for a second ledger is a sibling module, for
example `src/corda/client.js` or `src/ethereum/client.js`, exposing
the same narrow verb set (`publish`-equivalent, balance/read
equivalents) behind its own interface. `redemptionService.js` would
then depend on a small settlement-adapter interface rather than on
`multichain/client.js` directly, so which ledger actually settles a
given redemption becomes a routing decision (for example, by reward
category or by partner) rather than a rewrite of the service.

This is the same principle Chapter 5 and Chapter 6 already apply
inside the single-chain design: MultiChain is a trust and transaction
layer, not the system of record, and the reward engine's business
logic should not need to know or care which specific ledger executed
a given settlement, only that it did.
