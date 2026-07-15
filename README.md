<p align="center">
  <img src="web/public/Signet.png" alt="Signet" width="180" />
</p>

<h1 align="center">Signet — <em>Value, sealed.</em></h1>

<p align="center">
  <strong>Pre-funded USDT vouchers, accepted offline over a local P2P mesh, settled on-chain when connectivity returns.</strong>
</p>

<p align="center">
  <a href="#live-on-sepolia-">Live on Sepolia</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#security-model">Security model</a> ·
  <a href="./ARCHITECTURE.md"><strong>Architecture deep-dive →</strong></a>
</p>

<p align="center">
  <img alt="chain" src="https://img.shields.io/badge/network-Sepolia-6f42c1" />
  <img alt="contracts" src="https://img.shields.io/badge/contracts-verified-2ea44f" />
  <img alt="tests" src="https://img.shields.io/badge/tests-15%2F15-2ea44f" />
  <img alt="license" src="https://img.shields.io/badge/license-MIT-blue" />
  <img alt="node" src="https://img.shields.io/badge/node-%E2%89%A520.6-339933" />
</p>

Signet lets people transact in stablecoins **without internet, without a bank, and without a server** — then anchors every payment to Ethereum the moment a connection reappears. Cryptography secures the money; an on-device AI makes it usable in any language.

> 📐 **Want the full picture?** The complete system design — flows, sequence diagrams, threat model and the double-spend proof — lives in **[`ARCHITECTURE.md`](./ARCHITECTURE.md)**.

---


## The problem

Self-custodial stablecoin payments assume you are online. Billions of moments of commerce are not: a market stall when the tower is down, a bus with no signal, a village with intermittent data. Cash still wins there — and cash cannot be programmable money.

## The idea

A buyer **pre-funds** a vault on-chain while they have connectivity. Offline, they hand a merchant a **cryptographically signed voucher** bound to that merchant and that exact bill. The merchant verifies it locally and accepts **immediately** — no network needed. A local **Pears/Hyperswarm mesh** replicates "seen" vouchers so a duplicate is caught early. When connectivity returns, the merchant **redeems on-chain**, where the vault's `spent` mapping is the **final double-spend arbiter**.

> Signet does not claim offline blockchain finality. It provides **bounded-risk offline acceptance** backed by locked USDT and **deferred on-chain settlement**.

---

## Architecture at a glance

```
  🎙️ QVAC              🖋️ Voucher core          📡 Pears mesh            ⛓️ VoucherVault
  speech/text  ─────▶  create · sign · verify ─▶ transport + "seen"  ─▶  deposit · redeem
  → invoice            (EIP-191, offline)        replication (offline)    spent[] = finality
  (on-device AI)                                 early double-spend        (Ethereum)
                                                 warning
```

| Layer | File | Role |
|-------|------|------|
| **Accessibility** | `qvac/invoice.js`, `qvac/qvac-adapter.js` | Turns natural, local-language speech ("one coffee, one USDT") into a structured invoice, fully on-device. Pluggable engine — the real QVAC SDK drops in with one call. |
| **Voucher core** | `shared/voucher.js` | Create, sign (EIP-191) and verify single-use vouchers bound to `(merchant, invoiceHash)`. Fully offline. |
| **Mesh** | `peer/mesh.js` | Serverless device-to-device transport over Pears/Hyperswarm + replication of the local `seen` set for **offline** double-spend warning. |
| **Settlement** | `contracts/VoucherVault.sol` | Buyers lock USDT; merchants redeem signed vouchers. `spent[voucherId]` is the **final** arbiter — first redeem wins, every later one reverts. |
| **Bridge + UI** | `bridge/server.js`, `web/` | A Node bridge runs the real mesh peers, crypto and settlement, then streams live events over WebSocket to a Vite/React interface. The UI is a window onto the real system — nothing is faked. |

> This is the **overview**. For the full flow, sequence diagrams, message protocol, threat model and the double-spend proof, read **[`ARCHITECTURE.md`](./ARCHITECTURE.md)**.

---


## Live on Sepolia ✅

Both contracts are deployed **and source-verified** on Sepolia. A real voucher was redeemed on-chain, and a second redeem of the same voucher **reverted** — the double-spend guarantee, proven publicly.

| | Address | |
|--|---------|--|
| **VoucherVault** | `0xa194A96F6812C153F71B2448C937BB9454ad1614` | [verified source ↗](https://sepolia.etherscan.io/address/0xa194a96f6812c153f71b2448c937bb9454ad1614#code) |
| **MockUSDT** | `0x509e7C1758ba12C6907f93D4ee6458b6DEB8353C` | [verified source ↗](https://sepolia.etherscan.io/address/0x509e7c1758ba12c6907f93d4ee6458b6deb8353c#code) |
| **Redeem proof** | tx `0x6776cd7d…f5f21` | [view on Etherscan ↗](https://sepolia.etherscan.io/tx/0x6776cd7dd7c2b9fc4358cf4734674663b6c950bcab796092d0f01718e37f5f21) |

_Full deployment record: [`deployments.json`](./deployments.json)._

---

## Quick start

**Requirements:** Node ≥ 20.6, [Foundry](https://book.getfoundry.sh/) (`anvil`, `forge`).

```bash
npm install
npm run build:contracts     # forge build -> out/
npm test                    # 15/15: voucher core + QVAC
```

### See the whole story in one run

```bash
npm run signet              # local anvil: online lock -> offline mesh -> on-chain settle
```

Expected arc:

```
🌐 ONLINE      buyer locks 3 USDT in the VoucherVault
✈️  OFFLINE     QVAC invoice -> signed voucher -> Merchant A ACCEPTS on the mesh
               the SAME voucher at Merchant B -> REJECTED (mesh early-warning)
🌐 RECONNECT   Merchant A redeems on-chain (real tx)
               a second on-chain redeem -> REVERTED "already spent"
```

### Run it against live Sepolia

Create `.env` (never commit it — it's git-ignored):

```bash
RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
PRIVATE_KEY=0x...            # a funded Sepolia test wallet
ETHERSCAN_API_KEY=...        # optional, for contract verification
```

```bash
npm run signet:sepolia      # unified demo on live Sepolia
npm run settle:sepolia      # settlement-only, prints an Etherscan tx link
```

---

## Individual pieces

```bash
npm run demo                # offline mesh only (accept + local double-spend reject)
npm run settle              # on-chain settlement only (local anvil)
npm run test:voucher        # voucher core (5)
npm run test:qvac           # QVAC accessibility (10)
```

---

## Security model

- **Money is secured by cryptography, not by the AI.** QVAC only improves accessibility; it never holds keys or authorizes spend.
- **Vouchers are single-use and bound** to a specific merchant + invoice hash via an EIP-191 signature. A stolen or copied voucher cannot be redeemed elsewhere or against another bill.
- **Offline acceptance is bounded-risk**, backed by USDT locked on-chain. The mesh gives *early* warning of a double-spend.
- **The chain is the final arbiter.** `spent[voucherId]` guarantees exactly one successful redeem; concurrent attempts resolve deterministically on-chain.

## Why "QVAC"

The accessibility layer runs **on-device, zero cloud**, so it works in airplane mode and keeps the "no server" guarantee. `toInvoice()` is engine-agnostic: today a deterministic multilingual parser (EN/TR/ES) backs it; register the real QVAC SDK with `setEngine()` / `useQvac()` and nothing else changes.

---

## Project layout

```
contracts/   VoucherVault.sol · MockUSDT.sol
shared/      voucher.js (+ tests)
qvac/        invoice.js · qvac-adapter.js (+ tests)
peer/        mesh.js  (Pears/Hyperswarm)
app/         signet.js (unified demo) · demo.js (offline only)
scripts/     settle.js (on-chain settlement, any RPC)
bridge/      server.js (live WebSocket bridge to the real system)
web/         Vite/React UI (a live window onto the bridge)
deploy/      nginx.conf · systemd unit for hosting the bridge
```

> A full breakdown of every module, the wire protocol and the settlement math is in **[`ARCHITECTURE.md`](./ARCHITECTURE.md)**.

---

_No bank. No server. No cloud AI. Connectivity can vanish; commerce need not._

