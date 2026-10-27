# Architecture Mapping: Code to Chapter 10 Sections

This document exists so a reader can move between the manuscript and
the code without guessing which file implements which idea. Nothing
here introduces a concept the chapter doesn't already cover; it is a
lookup table, not additional design content.

| Chapter concept | File |
| --- | --- |
| Table 10.1 (Trust Domain taxonomy) | `bridge-service/src/trustDomainPolicy.js` |
| Listing 10.1 (bridge_transaction schema) | Produced upstream by the Chapter 7 application layer; consumed by `bridge-service/src/index.js` |
| Section 10.4, "Where the Bridge Actually Lives" | `bridge-service/src/index.js` (the polling and routing loop) |
| Section 10.5, Ethereum custodial bridge | `bridge-service/src/ethereumBridge.js`, `ethereum-contracts/contracts/MeridianRewardNFT.sol` |
| Table 10.2 (USD-to-ETH conversion decisions) | `bridge-service/src/conversionRateProvider.js` |
| Section 10.6, Corda consortium settlement | `bridge-service/src/cordaBridge.js`, `corda-flow-simulator/server.js` |
| Section 10.7, wholly Meridian-governed contrast case | `meridian-internal-settlement` registry entry in `trustDomainPolicy.js`; deliberately has no bridge handler, since Section 10.7 explains why one isn't needed |

## Why the Corda side is a simulator, and what changes in production

`corda-flow-simulator/server.js` is not Corda. It is a small REST
server that mimics the HTTP contract a real CorDapp webserver plugin
would expose. This split exists for two reasons stated in the chapter
itself:

1. Corda's native RPC client (`CordaRPCClient`) is JVM-only. A Node.js
   service cannot call it directly under any circumstances, in this
   repository or in a real production deployment. The REST boundary is
   not a shortcut this repository takes; it is how real integrations
   are built.
2. Almost no reader of this book has access to a live multi-bank
   consortium test network to develop against, and neither does this
   book's own build environment. The simulator makes Section 10.6's
   worked example runnable by anyone, matching the reproducibility
   standard Section 6.11 already set for the MultiChain side of the
   book.

To move from this simulator to a real production integration:

- Replace `corda-flow-simulator/` with an actual Corda webserver
  plugin (Kotlin or Java), running alongside a real Corda node that
  has joined the consortium.
- That plugin implements the same two endpoints this simulator
  implements: `POST /flows/settlement` to initiate the real CorDapp
  flow via `CordaRPCClient`, and `GET /flows/settlement/:flowId` to
  report real flow status sourced from the node's vault.
- `bridge-service/src/cordaBridge.js` does not need to change at all.
  It was written against the REST contract, not against this
  simulator's internals, which is the entire point of putting the
  JVM boundary behind HTTP in the first place.

## Why the Ethereum side uses a local Hardhat node, not a testnet

Section 10.5's worked example is fully reproducible using
`ethereum-contracts/`'s local Hardhat network, which requires no
testnet ETH, no RPC provider API key, and no external network access.
Swapping in a real testnet or mainnet is a configuration change only:
point `ETHEREUM_RPC_URL` at a real provider, fund the treasury wallet,
and deploy `MeridianRewardNFT.sol` there instead. No code in
`ethereumBridge.js` needs to change.

## Key custody

Nowhere in this repository does `ETHEREUM_TREASURY_PRIVATE_KEY` exist
as anything other than a local development convenience read from
`.env`. Chapter 8's cryptographic key management section covers how a
production treasury signer should actually be backed (HSM-issued key,
multi-signature quorum, rotation policy). This repository's job is to
demonstrate correct bridge logic, not correct key custody; the two are
deliberately kept separate, the same boundary the chapter itself
draws in Section 10.5's closing Note.
