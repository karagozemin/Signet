// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Signet — VoucherVault
// Buyers lock USDT and issue single-use, off-chain-signed vouchers. Merchants accept
// those vouchers OFFLINE (verified cryptographically), then REDEEM them on-chain when
// connectivity returns. The `spent` mapping is the FINAL double-spend arbiter: whoever
// redeems a given voucherId first wins; any later redeem of the same id reverts.
//
// Signet does not claim offline blockchain finality. It provides bounded-risk offline
// acceptance backed by locked USDT + deferred on-chain settlement.

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract VoucherVault {
    IERC20 public immutable usdt;

    mapping(address => uint256) public balance; // buyer -> locked USDT
    mapping(bytes32 => bool)    public spent;    // voucherId -> redeemed?

    event Deposited(address indexed buyer, uint256 amount);
    event Redeemed(bytes32 indexed voucherId, address indexed buyer, address indexed merchant, uint256 amount);

    constructor(address _usdt) {
        usdt = IERC20(_usdt);
    }

    /// Buyer locks USDT into the vault (requires prior ERC20 approve).
    function deposit(uint256 amount) external {
        require(usdt.transferFrom(msg.sender, address(this), amount), "transferFrom failed");
        balance[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    /// Merchant redeems a voucher signed offline by the buyer.
    /// digest = keccak256(voucherId, merchant, invoiceHash, denom) signed via EIP-191.
    function redeem(
        bytes32 voucherId,
        address buyer,
        uint256 amount,
        bytes32 invoiceHash,
        string calldata denom,
        address merchant,
        bytes calldata sig
    ) external {
        require(!spent[voucherId], "already spent");
        require(balance[buyer] >= amount, "insufficient locked");

        bytes32 digest = keccak256(abi.encodePacked(voucherId, merchant, invoiceHash, denom));
        require(_recover(_ethSigned(digest), sig) == buyer, "bad signature");

        spent[voucherId] = true;
        balance[buyer] -= amount;
        require(usdt.transfer(merchant, amount), "payout failed");

        emit Redeemed(voucherId, buyer, merchant, amount);
    }

    function _ethSigned(bytes32 h) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", h));
    }

    function _recover(bytes32 h, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "bad sig len");
        bytes32 r; bytes32 s; uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        return ecrecover(h, v, r, s);
    }
}