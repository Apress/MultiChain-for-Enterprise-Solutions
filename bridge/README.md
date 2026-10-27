# Chapter 10 Companion Code: Interoperability Across DLT Systems and Bridge Design

Reference implementation accompanying Chapter 10 of *MultiChain Mastery:
Practical Architecture and Deployment for Enterprise DLT Systems*. This
code implements the bridge logic behind Section 10.5 (public-chain
custodial bridge to Ethereum) and Section 10.6 (consortium-governed
settlement with Corda), plus the Table 10.1 Trust Domain policy that
routes every bridge transaction to the correct handler.

See `docs/ARCHITECTURE.md` for a full mapping of code to chapter
sections, and for an explicit account of what is simulated in this
repository versus what changes in a real production deployment.

## What's here

```
chapter10-bridge/
  bridge-service/          Node.js bridge orchestrator
    src/
      index.js               Main polling/routing loop (Section 10.4)
      multichainClient.js     MultiChain JSON-RPC client (matches Ch. 6.11's multichain-cli)
      trustDomainPolicy.js    Table 10.1 taxonomy, enforced as code
      ethereumBridge.js       Section 10.5 custodial bridge (Ethereum)
      cordaBridge.js          Section 10.6 attested settlement (Corda)
      conversionRateProvider.js  Table 10.2's rate-source decision
    test/                   Automated tests (10/10 passing; see below)
  ethereum-contracts/       Solidity contract + Hardhat local network
    contracts/MeridianRewardNFT.sol
  corda-flow-simulator/    REST facade simulating a CorDapp webserver plugin
  docker-compose.yml        Full local environment, one command
  docs/ARCHITECTURE.md      Code-to-chapter mapping and production notes
```

## Quick start (no Docker required)

This proves the bridge logic works without needing a live MultiChain
node, a live Ethereum network, or a live consortium.

```bash
cd bridge-service
npm install
npm test
```

You should see 10 passing tests, covering:
- correct routing of a valid public-chain (Ethereum) transaction
- correct routing of a valid consortium (Corda) transaction
- **rejection of a misclassified transaction** (the exact mistake
  Section 10.2's Caution box warns against: declaring a consortium
  ledger as wholly Meridian-governed)
- rejection of an unregistered counterparty ledger
- correct failure handling and write-back when a counterparty action fails
- deduplication of an already-processed transaction reference

## Running the Corda worked example live

The Corda side is fully runnable locally, using the included REST
simulator rather than a real consortium network (see
`docs/ARCHITECTURE.md` for why, and what changes in production):

```bash
# terminal 1
cd corda-flow-simulator
node server.js

# terminal 2
cd bridge-service
node -e "
const { CordaBridge } = require('./src/cordaBridge');
const bridge = new CordaBridge({
  facadeHost: 'localhost', facadePort: 9200,
  participantBankId: 'meridian-retail-banking-01',
});
bridge.executeSettlement({
  transaction_ref: 'mr-bridge-demo-0001',
  employee_ref: 'emp-ps-demo0001',
  counterparty: { ledger: 'meridian-bank-consortium-corda', counterparty_ref: 'consortium-member-ref-001' },
  conversion: { usd_value: 750 },
}).then(r => console.log(JSON.stringify(r, null, 2)));
"
```

## Running the Ethereum worked example locally

```bash
cd ethereum-contracts
npm install
npx hardhat node                              # terminal 1, local chain
npx hardhat run scripts/deploy.js --network localhost   # terminal 2
# copy the deployed address into bridge-service/.env as
# ETHEREUM_NFT_CONTRACT_ADDRESS
```

## Running everything together

```bash
docker compose up -d multichain-node ethereum-node corda-flow-simulator
# initialize MultiChain streams per Chapter 6.11's Listing 6.4,
# deploy the NFT contract per the step above,
# then:
docker compose up bridge-service
```

## What is real code and what is a simulator

- **MultiChain client, Trust Domain policy, orchestration loop,
  Ethereum bridge, Solidity contract:** real, runnable code. The
  Solidity contract has been compiled against actual solc 0.8.26 and
  its ABI verified. The orchestration and policy logic is covered by
  a real, passing automated test suite.
- **Corda side:** the bridge client (`cordaBridge.js`) is real
  production-shape code. `corda-flow-simulator/server.js` is
  explicitly a simulator standing in for a real CorDapp webserver
  plugin, because neither this book's readers nor its build
  environment have access to a live multi-bank consortium test
  network. This is stated plainly in the code, in `docs/ARCHITECTURE.md`,
  and in Chapter 10 itself, not left implicit.

## License

MIT. Provided as companion educational material for the book; adapt
freely for your own MultiChain deployments.
