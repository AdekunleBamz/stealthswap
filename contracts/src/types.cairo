use starknet::ContractAddress;

#[derive(Drop, Serde, starknet::Store, Copy)]
pub struct Swap {
    pub id: felt252,
    pub initiator: ContractAddress,
    pub participant: ContractAddress,
    pub amount_hash: felt252,        // ZK: hashed amount (privacy)
    pub hashlock: felt252,           // HTLC hashlock
    pub timelock: u64,               // Unix timestamp
    pub status: SwapStatus,
    pub created_at: u64,
}

#[derive(Drop, Serde, starknet::Store, PartialEq, Copy, Default)]
pub enum SwapStatus {
    #[default]
    Pending,
    Locked,
    Completed,
    Refunded,
    /// Note: Expired is a derived status - swaps are not automatically marked expired on-chain.
    /// Use is_swap_expired() to check, or call refund_swap() which handles expired swaps.
    Expired,
}

#[derive(Drop, Serde, Copy)]
pub struct SwapProof {
    pub amount_commitment: felt252,
    pub nullifier: felt252,
    pub proof_hash: felt252,
}

impl SwapStatusIntoFelt252 of Into<SwapStatus, felt252> {
    fn into(self: SwapStatus) -> felt252 {
        match self {
            SwapStatus::Pending => 0,
            SwapStatus::Locked => 1,
            SwapStatus::Completed => 2,
            SwapStatus::Refunded => 3,
            SwapStatus::Expired => 4,
        }
    }
}
