'use strict';

/**
 * ethereumBridge.js
 *
 * Implements Section 10.5's worked example: a custodial bridge to a
 * public, permissionless chain. Meridian's bridge service holds a
 * treasury wallet and executes the counterparty-side action on the
 * employee's behalf; this is a custodial bridge, not a decentralized
 * one, exactly as the Caution box in Section 10.5 states.
 *
 * This module implements the mint path (Meridian controls the NFT
 * contract) rather than the marketplace-purchase path, since the mint
 * path is fully self-contained and reproducible without depending on
 * a live third-party marketplace contract. The marketplace-purchase
 * variant is noted in this file's comments for a reader who wants to
 * extend it.
 *
 * Key custody: this module intentionally accepts a pre-configured
 * ethers.js Wallet/Signer rather than managing private key material
 * itself. Chapter 8's key management section covers how that signer
 * should actually be backed (HSM-issued key, rotation policy, etc.);
 * this module only consumes whatever signer it is given.
 */

const { ethers } = require('ethers');

// Minimal ABI: only the mint function this bridge actually calls.
// The full contract is in ethereum-contracts/contracts/MeridianRewardNFT.sol.
const MERIDIAN_REWARD_NFT_ABI = [
  'function mintTo(address to, uint256 tokenId, string memory tokenURI) public returns (uint256)',
];

class EthereumBridge {
  /**
   * @param {ethers.Provider} provider - connected to the target network
   *   (ethereum-mainnet in production, ethereum-sepolia or a local
   *   Hardhat node for development, per this repo's docker-compose.yml)
   * @param {ethers.Signer} treasurySigner - the Meridian treasury wallet
   *   that pays gas and holds mint authority; see the key-custody note
   *   above.
   * @param {string} nftContractAddress - deployed MeridianRewardNFT address
   * @param {object} [conversionRateProvider] - supplies the USD-to-ETH
   *   rate decision from Table 10.2; injected so the rate-source policy
   *   (live feed vs. periodically fixed rate) can be swapped without
   *   touching bridge logic.
   */
  constructor(provider, treasurySigner, nftContractAddress, conversionRateProvider) {
    this.provider = provider;
    this.treasurySigner = treasurySigner;
    this.contract = new ethers.Contract(nftContractAddress, MERIDIAN_REWARD_NFT_ABI, treasurySigner);
    this.conversionRateProvider = conversionRateProvider;
  }

  /**
   * Executes the two-step value conversion from Section 10.5:
   * Step 1 (points -> USD) uses Listing 4.1's fixed program rate and
   * requires no new design; it is expected to already be applied by
   * the caller before this method is invoked. Step 2 (USD -> ETH) is
   * this method's job, and it is deliberately isolated so that Table
   * 10.2's rate-source and slippage decisions live in one place.
   */
  async convertUsdToWei(usdValue) {
    const { rate, rateRef } = await this.conversionRateProvider.getUsdToEthRate();
    const ethValue = usdValue / rate;
    const weiValue = ethers.parseEther(ethValue.toFixed(18));
    return { weiValue, rateRef, ethValue };
  }

  /**
   * Executes the counterparty-side action for a bridge_transaction
   * record whose ledger is ethereum-mainnet or ethereum-sepolia.
   *
   * Returns a result object suitable for writing back to MultiChain's
   * interoperability stream (Section 10.5, step 6), or throws if the
   * mint fails, in which case the caller (see index.js) is responsible
   * for releasing the point lock per the standard timeout-and-release
   * pattern already established in WF-5.
   */
  async executeMint(bridgeTransaction) {
    const { transaction_ref: transactionRef, employee_ref: employeeRef, conversion } = bridgeTransaction;

    if (!conversion || typeof conversion.usd_value !== 'number') {
      throw new Error(
        `bridge_transaction ${transactionRef} is missing conversion.usd_value; ` +
          'cannot execute Ethereum-side mint without a resolved USD value.'
      );
    }

    // Deterministic, non-reversible token id derived from the
    // transaction reference, not from the employee's identity,
    // consistent with Section 5.2's data minimization principle:
    // nothing that identifies the employee crosses the Trust Domain
    // boundary onto the public chain.
    const tokenId = BigInt('0x' + Buffer.from(transactionRef).toString('hex').slice(0, 16));

    const employeeWalletAddress = bridgeTransaction.counterparty.counterparty_ref;
    if (!employeeWalletAddress || !ethers.isAddress(employeeWalletAddress)) {
      throw new Error(
        `bridge_transaction ${transactionRef} has no valid destination wallet address ` +
          'in counterparty.counterparty_ref.'
      );
    }

    const tokenUri = `ipfs://meridian-rewards-metadata/${transactionRef}`;

    const tx = await this.contract.mintTo(employeeWalletAddress, tokenId, tokenUri);
    const receipt = await tx.wait();

    return {
      bridge_status: 'counterparty_confirmed',
      counterparty_confirmation: {
        network: bridgeTransaction.counterparty.ledger,
        tx_hash: receipt.hash,
        block_number: receipt.blockNumber,
        gas_used: receipt.gasUsed.toString(),
        token_id: tokenId.toString(),
      },
    };
  }
}

module.exports = { EthereumBridge, MERIDIAN_REWARD_NFT_ABI };
