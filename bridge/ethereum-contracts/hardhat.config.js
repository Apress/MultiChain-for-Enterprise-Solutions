// Hardhat config for Chapter 10's local development network.
//
// This is the "ethereum-sepolia"-equivalent local stand-in referenced
// throughout bridge-service/src/ethereumBridge.js and trustDomainPolicy.js.
// Running `npx hardhat node` here gives a reader a fully local Ethereum
// network to test the bridge service against, without needing testnet
// ETH, an RPC provider API key, or any external network access at all,
// the same reproducibility standard Section 6.11 set for the MultiChain
// side of this book's companion repository.

require('@nomicfoundation/hardhat-toolbox');

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {},
    localhost: {
      url: 'http://127.0.0.1:8545',
    },
  },
};
