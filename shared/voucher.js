// shared/voucher.js
// Signet — voucher core: create · sign · verify (fully offline)
//
// A voucher is a pre-funded, single-use claim on USDT locked in the VoucherVault.
// The buyer SIGNS a voucher binding it to (merchantAddress + invoiceHash), so a
// stolen or copied voucher cannot be redeemed by anyone else or against another bill.
//
// Security note: cryptography secures the money. The on-chain `spent` mapping is the
// FINAL double-spend arbiter. The local Pears mesh only provides early offline warning.

import { ethers } from 'ethers';

/**
 * Create an unsigned voucher.
 * @param {string} vaultAddress  deployed VoucherVault address
 * @param {string} denom         amount as a decimal string, e.g. "1.00"
 * @param {number} nonce         unique per-buyer counter
 * @param {number} expiry        unix seconds
 */
export function createVoucher(vaultAddress, denom, nonce, expiry) {
  const voucherId = ethers.keccak256(
    ethers.toUtf8Bytes(`${vaultAddress}:${denom}:${nonce}:${expiry}`)
  );
  return { voucherId, vaultAddress, denom, nonce, expiry };
}

/**
 * Build the exact digest the buyer signs. Binds the voucher to a specific
 * merchant and a specific invoice so it cannot be reused elsewhere.
 */
export function paymentDigest(voucher, merchantAddress, invoiceHash) {
  return ethers.solidityPackedKeccak256(
    ['bytes32', 'address', 'bytes32', 'string'],
    [voucher.voucherId, merchantAddress, invoiceHash, voucher.denom]
  );
}

/**
 * Buyer signs a voucher for a given merchant + invoice. Works fully offline.
 * @returns {Promise<string>} signature (0x...)
 */
export async function signVoucher(voucher, merchantAddress, invoiceHash, buyerWallet) {
  const digest = paymentDigest(voucher, merchantAddress, invoiceHash);
  // sign raw digest bytes (EIP-191 personal_sign over the 32-byte hash)
  return buyerWallet.signMessage(ethers.getBytes(digest));
}

/**
 * Merchant verifies a signed voucher OFFLINE. Returns the recovered buyer address
 * if valid & unexpired, otherwise null.
 */
export function verifyVoucher(voucher, signature, merchantAddress, invoiceHash, expectedBuyer = null) {
  try {
    if (voucher.expiry && Math.floor(Date.now() / 1000) > voucher.expiry) return null;
    const digest = paymentDigest(voucher, merchantAddress, invoiceHash);
    const recovered = ethers.verifyMessage(ethers.getBytes(digest), signature);
    if (expectedBuyer && recovered.toLowerCase() !== expectedBuyer.toLowerCase()) return null;
    return recovered;
  } catch {
    return null;
  }
}

/** Hash an invoice object into a deterministic bytes32 for binding. */
export function hashInvoice(invoice) {
  return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(invoice)));
}