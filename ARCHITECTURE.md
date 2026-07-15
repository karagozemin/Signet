<p align="center">
  <img src="web/public/Signet.png" alt="Signet" width="200" />
</p>

<h1 align="center">Signet — Architecture</h1>

<p align="center"><em>How value gets sealed offline and settled on-chain.</em></p>

<p align="center">
  <a href="./README.md">← Back to README</a>
</p>

---

## Table of contents

1. [Design goals](#1-design-goals)
2. [The mental model](#2-the-mental-model)
3. [System topology](#3-system-topology)
4. [Component reference](#4-component-reference)
5. [The end-to-end flow](#5-the-end-to-end-flow)
6. [Data structures](#6-data-structures)
7. [The mesh protocol](#7-the-mesh-protocol)
8. [On-chain settlement](#8-on-chain-settlement)
9. [The bridge & UI](#9-the-bridge--ui)
10. [Threat model](#10-threat-model)
11. [What Signet does *not* claim](#11-what-signet-does-not-claim)
12. [Extending the system](#12-extending-the-system)

---

## 1. Design goals

Signet is built around four hard constraints. Every design decision traces back to one of them.

| # | Goal | Consequence |
|---|------|-------------|
| G1 | **Works with zero connectivity** | Payment acceptance must complete with no internet, no server, no RPC. |
| G2 | **No trusted third party** | Self-custodial funds; no bank, no payment processor, no coordinator. |
| G3 | **Deterministic finality** | Exactly one party can ever redeem a given voucher — enforced on-chain. |
| G4 | **Usable by anyone** | Natural, local-language input; the money layer never depends on the UX layer. |

The central tension is **G1 vs. G3**: you cannot have blockchain finality while offline. Signet resolves this honestly — it does **not** fake offline finality. Instead it splits payment into two phases:

- **Acceptance** (offline, instant, *bounded-risk*) — cryptographically verifiable, backed by pre-locked USDT.
- **Settlement** (online, deferred, *final*) — the chain's `spent` mapping is the single source of truth.

---

## 2. The mental model

Think of a voucher like a **signed, single-use cheque drawn against locked collateral**.

- The buyer has already **locked USDT** in a vault on-chain (done while online).
- Offline, the buyer writes a cheque (**a voucher**) made out to **one specific merchant** for **one specific bill**, and **signs** it.
- The merchant can verify the signature and the binding **locally, instantly** — the collateral already exists on-chain, so acceptance is safe within a bounded risk.
- Later, the merchant **cashes the cheque** on-chain. The vault pays out exactly once; any duplicate bounces.

The Pears mesh is the "word on the street" — merchants gossip which cheques they've already seen, so a buyer trying to spend the same cheque twice in the same market gets caught **before** anyone even goes online.

---

## 3. System topology

```
                          ┌───────────────────────── OFFLINE ─────────────────────────┐
                          │                                                            │
   ┌──────────┐           │   ┌──────────┐        📡  Pears / Hyperswarm mesh          │
   │  Buyer    │          │   │  Buyer    │◀──────────────┐        (serverless P2P)     │
   │  device   │          │   │  wallet   │               │                            │
   │           │          │   │  + QVAC   │──voucher──▶ ┌──┴───────┐   ┌──────────┐     │
   └────┬─────┘           │   └──────────┘             │ Merchant │   │ Merchant │     │
        │                 │                            │    A     │◀─▶│    B     │     │
        │ (1) lock USDT   │                            └────┬─────┘   └──────────┘     │
        │  while online   │                                 │  "seen" set replicates   │
        │                 └─────────────────────────────────┼──────────────────────────┘
        ▼                                                    │
   ┌───────────────────────── ETHEREUM ──────────────────────┼──────────────┐
   │                                                          ▼              │
   │   ┌──────────────┐  deposit()   ┌─────────────────────────────────┐    │
   │   │   MockUSDT    │◀────────────▶│          VoucherVault            │    │
   │   │   (ERC-20)    │  transfer()  │  balance[buyer]                  │    │
   │   └──────────────┘              │  spent[voucherId]  ← FINALITY    │    │
   │                                 └─────────────────────────────────┘    │
   │                                        ▲  (3) redeem() when back online │
   └────────────────────────────────────────┼──────────────────────────────┘
                                             │
                                        Merchant A settles
```

Three planes, cleanly separated:

- **On-chain plane** — the vault and the ERC-20. Slow, global, authoritative.
- **Offline mesh plane** — Pears/Hyperswarm transport + gossip. Fast, local, advisory.
- **Device plane** — QVAC (accessibility) + voucher crypto (security), running entirely on-device.

---

## 4. Component reference

| Component | Path | Responsibility | Depends on |
|-----------|------|----------------|------------|
| **QVAC accessibility** | `qvac/invoice.js`, `qvac/qvac-adapter.js` | Speech/text → structured invoice. On-device, pluggable engine. | nothing (pure) |
| **Voucher core** | `shared/voucher.js` | Create / sign / verify vouchers; hash invoices. EIP-191. | `ethers` |
| **Mesh** | `peer/mesh.js` | P2P transport of vouchers + replication of the `seen` set. | `hyperswarm`, `b4a` |
| **Vault contract** | `contracts/VoucherVault.sol` | Hold collateral, pay out on valid signature, enforce single redeem. | `MockUSDT` |
| **Mock token** | `contracts/MockUSDT.sol` | ERC-20 stand-in for USDT on testnets. | — |
| **Unified demo** | `app/signet.js` | End-to-end story in one CLI run. | all of the above |
| **Bridge** | `bridge/server.js` | Runs the real system; streams live events to the UI over WS/REST. | all of the above |
| **Web UI** | `web/` | Vite/React "live window" onto the bridge. | bridge |
| **Deploy** | `deploy/` | Nginx + systemd for hosting the bridge. | — |

**Key architectural rule:** the **security layer never depends on the accessibility layer**. QVAC produces an invoice; the invoice is *hashed* and bound into the signature. Swap QVAC for anything — the money path is unchanged.

---

## 5. The end-to-end flow

The canonical lifecycle, matching `app/signet.js` and `bridge/server.js`:

```mermaid
sequenceDiagram
    autonumber
    participant B as Buyer (device)
    participant Q as QVAC
    participant M as Mesh (Pears)
    participant A as Merchant A
    participant X as Merchant B
    participant V as VoucherVault (chain)

    Note over B,V: 🌐 ONLINE — pre-funding
    B->>V: deposit(3 USDT)  (approve + transferFrom)
    V-->>B: balance[buyer] += 3

    Note over B,X: ✈️ OFFLINE — commerce continues
    Q->>B: toInvoice("one coffee, one USDT")
    B->>B: createVoucher() + signVoucher(merchantA, invoiceHash)
    B->>M: VOUCHER (to = A)
    M->>A: deliver voucher
    A->>A: verifyVoucher() ✓  (sig valid, funds pre-locked)
    A->>M: SEEN(voucherId)   (replicate spend)
    M->>X: SEEN(voucherId)

    B->>M: VOUCHER (same id, to = B)   ← double-spend attempt
    M->>X: deliver voucher
    X->>X: isSeen(voucherId) → true → REJECT

    Note over A,V: 🌐 RECONNECT — settlement
    A->>V: redeem(voucherId, buyer, amount, invoiceHash, denom, merchant, sig)
    V->>V: require(!spent[id]); verify sig; spent[id]=true
    V-->>A: transfer(amount) + Redeemed event
    A->>V: redeem(SAME id) again
    V-->>A: revert "already spent"   ← final arbiter
```

The three acts map directly to the demo output:

| Act | Trigger | What proves it |
|-----|---------|----------------|
| 🌐 **Online** | `deposit()` | `balance[buyer]` increases on-chain |
| ✈️ **Offline** | mesh `VOUCHER` + `SEEN` | A accepts, B rejects the duplicate — no network |
| 🌐 **Reconnect** | `redeem()` ×2 | first succeeds, second reverts `"already spent"` |

---

## 6. Data structures

### Voucher

Created and signed entirely offline (`shared/voucher.js`):

```js
voucher = {
  voucherId,     // keccak256(`${vault}:${denom}:${nonce}:${expiry}`)
  vaultAddress,  // which vault the collateral lives in
  denom,         // "1.00" — human amount, as a string
  nonce,         // per-buyer uniqueness
  expiry         // unix seconds; verify rejects if past
}
```

### The signed digest — the security binding

```
digest = keccak256( voucherId ‖ merchantAddress ‖ invoiceHash ‖ denom )
signature = personal_sign(digest)        // EIP-191, over the 32-byte hash
```

This binding is the heart of the design. The signature commits to **all four** fields, so:

```
change the merchant  → signature no longer recovers the buyer  → REJECT
change the bill      → invoiceHash differs → REJECT
change the amount    → denom differs → REJECT
replay the voucherId → chain's spent[] catches it → REVERT
```

### Invoice (from QVAC)

```js
invoice = {
  items:    [{ name, quantity, price }],
  total:    3,
  currency: "USDT",
  raw:      "one coffee, one USDT"
}
invoiceHash = keccak256(JSON.stringify(invoice))   // bound into the signature
```

---

## 7. The mesh protocol

`peer/mesh.js` is deliberately tiny. Peers discover each other on a fixed topic (`sha256("signet-market-v1")`) and exchange three message types over Hyperswarm connections:

| Message | Direction | Effect |
|---------|-----------|--------|
| `VOUCHER` | buyer → merchants | Delivers `{ voucher, signature, invoice, buyer }`. Merchant verifies + decides. |
| `SEEN` | merchant → all | Announces `voucherId` is now spent; every peer adds it to its local `seen` set. |
| `SEEN_SYNC` | on new connection | New peer receives the whole `seen` set, so partitions reconcile on reconnect. |

```
   Buyer                Merchant A                Merchant B
     │  VOUCHER(id, →A)     │                          │
     ├─────────────────────▶│ verify ✓                 │
     │                      │ markSpent(id)            │
     │                      ├──── SEEN(id) ───────────▶│  seen.add(id)
     │  VOUCHER(id, →B)     │                          │
     ├──────────────────────┼─────────────────────────▶│ isSeen(id)? → REJECT
     │                      │                          │
   (new peer joins) ──────── SEEN_SYNC(all ids) ───────▶ reconcile
```

**Honest framing:** the mesh does **not** compute global consensus. It raises the *cost* of local double-spending by catching duplicates within the connected mesh, and it reconciles partitions via `SEEN_SYNC`. A buyer who splits the mesh (talks to A and B on disconnected partitions) can still get two offline acceptances — but **only one can ever settle on-chain**. That residual risk is exactly the bounded, collateral-backed risk described in the threat model.

---

## 8. On-chain settlement

`contracts/VoucherVault.sol` — the only authoritative component.

```solidity
mapping(address => uint256) public balance; // buyer -> locked USDT
mapping(bytes32 => bool)    public spent;    // voucherId -> redeemed?
```

**`deposit(amount)`** — buyer locks collateral (after ERC-20 `approve`). Increases `balance[buyer]`.

**`redeem(voucherId, buyer, amount, invoiceHash, denom, merchant, sig)`** — the merchant cashes the voucher. In order:

```
1. require(!spent[voucherId])          // ← double-spend guard (finality)
2. require(balance[buyer] >= amount)    // collateral must cover the payout
3. digest = keccak256(voucherId, merchant, invoiceHash, denom)
   require(recover(ethSigned(digest), sig) == buyer)   // signature binds everything
4. spent[voucherId] = true              // flip BEFORE payout (no reentrancy window)
5. balance[buyer] -= amount
6. usdt.transfer(merchant, amount)      // payout
7. emit Redeemed(...)
```

The ordering matters: `spent` is set **before** the external `transfer`, and the signature is recomputed on-chain with the **caller-supplied** `merchant`, so a different merchant cannot replay someone else's voucher. Two concurrent `redeem` calls for the same id are ordered by the miner; the first mines, the second reverts on line 1.

> **The `spent` mapping is the entire finality story.** Everything offline is advisory; this one boolean is the truth.

---

## 9. The bridge & UI

The browser can't run Hyperswarm or hold keys, so `bridge/server.js` runs the **real** system in Node and exposes it:

```
   Browser (web/)                Bridge (bridge/server.js)              Chain
   ─────────────                 ────────────────────────              ─────
   React UI                      buyerMesh  ┐
      │  REST: /api/sign,             meshA ├─ real SignetMesh peers
      │        /api/send,             meshB ┘
      │        /api/redeem …    ──▶  real voucher crypto (shared/)
      │                              real QVAC parser   (qvac/)
      │  WS: /ws  ◀── emit(evt) ──   real settlement    → deploys + redeem() ──▶ anvil / Sepolia
      ▼
   live event stream (deposit, mesh:connected, merchant:accepted,
                      merchant:rejected, redeem:confirmed, …)
```

- **REST** drives actions (`init`, `invoice`, `sign`, `send`, `redeem`, `redeem-again`).
- **WebSocket `/ws`** streams every real event; new clients get the full `history` on connect.
- Locally the bridge auto-spawns `anvil`; with `RPC_URL`/`PRIVATE_KEY` it runs against live Sepolia.

Nothing in the UI is simulated — it is a **live window** onto the same code paths as `app/signet.js`.

---

## 10. Threat model

| Attack | Defense | Residual risk |
|--------|---------|---------------|
| **Copy a voucher, redeem elsewhere** | Signature binds `merchant`; a different merchant fails signature recovery. | None. |
| **Reuse a voucher for a bigger bill** | Signature binds `invoiceHash` + `denom`. | None. |
| **Redeem the same voucher twice on-chain** | `spent[voucherId]` flips on first redeem; second reverts. | None. |
| **Double-spend within one mesh** | `SEEN`/`SEEN_SYNC` gossip; merchants reject seen ids. | Caught early, before settlement. |
| **Double-spend across a split mesh** | Both may *accept* offline, but only one can *settle*. | Bounded — one merchant loses the race, capped at the voucher amount, backed by collateral. |
| **Steal funds via the AI layer** | QVAC never holds keys or authorizes spend; it only shapes an invoice that gets *hashed*. | None. |
| **Expired voucher** | `verifyVoucher` rejects past `expiry`. | None. |
| **Spend more than collateral** | `redeem` requires `balance[buyer] >= amount`. | None. |

The one accepted risk — the **split-mesh race** — is intentional and bounded: it is the price of instant offline acceptance, and it is capped by the pre-locked collateral. This is the "bounded-risk offline acceptance" claim, stated precisely.

---

## 11. What Signet does *not* claim

- ❌ It does **not** provide offline blockchain finality. Finality is on-chain, deferred.
- ❌ The mesh is **not** a consensus layer. It's advisory gossip that reconciles on reconnect.
- ❌ QVAC is **not** part of the trust boundary. It's accessibility, not security.
- ✅ It **does** provide: instant offline acceptance, cryptographic binding, and deterministic single-redeem finality backed by locked USDT.

---

## 12. Extending the system

- **Real QVAC SDK** — implement `async (input) => invoice` and register it with `setEngine()` / `useQvac()`. No other code changes; `toInvoice()` normalizes the output.
- **Real USDT** — deploy `VoucherVault` pointed at the canonical USDT address; drop `MockUSDT`.
- **More denominations / partial spend** — the voucher `denom` and vault `balance` math already support arbitrary amounts; extend `createVoucher` accordingly.
- **Stronger offline anti-double-spend** — add signed `SEEN` receipts or a merchant reputation gossip on top of the existing mesh messages.
- **Mobile transport** — swap Hyperswarm for a BLE/Wi-Fi-Direct transport behind the same `SignetMesh` interface; the protocol (`VOUCHER`/`SEEN`/`SEEN_SYNC`) is transport-agnostic.

---

<p align="center">
  <a href="./README.md">← Back to README</a> ·
  <em>No bank. No server. No cloud AI. Connectivity can vanish; commerce need not.</em>
</p>
