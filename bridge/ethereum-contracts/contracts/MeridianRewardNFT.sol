// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * MeridianRewardNFT
 *
 * Reference contract for Chapter 10, Section 10.5's worked example.
 *
 * This contract deliberately does as little as possible: it exists to
 * demonstrate the mint path a custodial bridge calls into, not to be a
 * production-grade collectible contract. Real deployments should add
 * proper metadata standards, royalty handling, and pausability before
 * going anywhere near mainnet.
 *
 * Only the Meridian treasury address (the contract owner) can mint,
 * matching the custodial trust model Section 10.5 names explicitly:
 * the employee never holds mint authority, and never pays gas.
 */
contract MeridianRewardNFT is ERC721, Ownable {
    mapping(uint256 => string) private _tokenURIs;

    constructor(address treasuryAddress)
        ERC721("Meridian Rewards Collectible", "MRWD")
        Ownable(treasuryAddress)
    {}

    /**
     * Mints a token to `to` with a specific `tokenId`, derived
     * off-chain by the bridge service from the originating
     * bridge_transaction's transaction_ref (see ethereumBridge.js),
     * never from any employee-identifying value.
     */
    function mintTo(
        address to,
        uint256 tokenId,
        string memory tokenUri
    ) public onlyOwner returns (uint256) {
        _safeMint(to, tokenId);
        _tokenURIs[tokenId] = tokenUri;
        return tokenId;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _tokenURIs[tokenId];
    }
}
