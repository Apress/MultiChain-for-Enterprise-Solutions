// Deploys MeridianRewardNFT to whichever network Hardhat is pointed at.
//
// Usage:
//   npx hardhat run scripts/deploy.js --network localhost
//
// The deployer account becomes the contract owner, i.e. the treasury
// address referenced throughout Section 10.5 and ethereumBridge.js.
// In production this address is backed by the HSM-issued signing key
// described in Chapter 8's key management section, never a plaintext
// private key in an environment file.

const hre = require('hardhat');

async function main() {
  const [treasury] = await hre.ethers.getSigners();

  console.log('Deploying MeridianRewardNFT with treasury address:', treasury.address);

  const MeridianRewardNFT = await hre.ethers.getContractFactory('MeridianRewardNFT');
  const contract = await MeridianRewardNFT.deploy(treasury.address);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log('MeridianRewardNFT deployed to:', address);
  console.log('');
  console.log('Set this in bridge-service/.env as ETHEREUM_NFT_CONTRACT_ADDRESS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
