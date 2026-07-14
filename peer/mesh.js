// peer/mesh.js
// Signet — Pears / Hyperswarm mesh layer (PRIMARY TRACK).
//
// ROLE: serverless device-to-device transport for signed vouchers, AND replication of
// the local "seen" (spent) voucher set so a duplicate can be rejected LOCALLY while offline.
//
// HONEST FRAMING: Pears transports & replicates signed claims. It does NOT compute global
// finality. The on-chain `spent` mapping is the final arbiter; this mesh only raises the
// cost of local double-spending by detecting duplicates within the connected mesh.

import Hyperswarm from 'hyperswarm';
import crypto from 'crypto';
import b4a from 'b4a';
import { EventEmitter } from 'events';

const TOPIC = crypto.createHash('sha256').update('signet-market-v1').digest(); // 32 bytes

export class SignetMesh extends EventEmitter {
  /** @param {string} role  label for logs: 'buyer' | 'merchant-a' | ... */
  constructor(role = 'node') {
    super();
    this.role = role;
    this.swarm = new Hyperswarm();
    this.peers = new Set();
    this.seen = new Set(); // voucherIds observed as spent in this local mesh

    this.swarm.on('connection', (conn) => {
      this.peers.add(conn);
      this.emit('peer', this.peers.size);

      // new peer: sync our current seen-set so partitions reconcile on connect
      this._send(conn, { type: 'SEEN_SYNC', ids: [...this.seen] });

      conn.on('data', (buf) => this._onData(conn, buf));
      conn.on('close', () => { this.peers.delete(conn); this.emit('peer', this.peers.size); });
      conn.on('error', () => {});
    });
  }

  async join() {
    const discovery = this.swarm.join(TOPIC, { server: true, client: true });
    await discovery.flushed();
    return this;
  }

  _send(conn, obj) { try { conn.write(b4a.from(JSON.stringify(obj))); } catch {} }
  _broadcast(obj) { for (const c of this.peers) this._send(c, obj); }

  _onData(conn, buf) {
    let msg; try { msg = JSON.parse(b4a.toString(buf)); } catch { return; }
    switch (msg.type) {
      case 'VOUCHER':
        this.emit('voucher', msg.payload); // { voucher, signature, invoice, buyer }
        break;
      case 'SEEN':
        if (!this.seen.has(msg.voucherId)) {
          this.seen.add(msg.voucherId);
          this.emit('seen', msg.voucherId);
        }
        break;
      case 'SEEN_SYNC':
        for (const id of msg.ids || []) {
          if (!this.seen.has(id)) { this.seen.add(id); this.emit('seen', id); }
        }
        break;
    }
  }

  /** Buyer -> mesh: hand a signed voucher to merchants. */
  sendVoucher(payload) { this._broadcast({ type: 'VOUCHER', payload }); }

  /** Has this voucher already been observed spent in the local mesh? (double-spend check) */
  isSeen(voucherId) { return this.seen.has(voucherId); }

  /** Merchant accepts a voucher: mark spent locally + replicate to the mesh. */
  markSpent(voucherId) {
    this.seen.add(voucherId);
    this._broadcast({ type: 'SEEN', voucherId });
  }

  async destroy() { await this.swarm.destroy(); }
}