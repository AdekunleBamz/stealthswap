use core::poseidon::poseidon_hash_span;
use stealthswap::types::SwapProof;

#[starknet::interface]
pub trait IVerifier<TContractState> {
    fn verify_amount_commitment(
        self: @TContractState, 
        amount: u256, 
        blinding_factor: felt252
    ) -> felt252;
    
    fn verify_swap_proof(
        self: @TContractState,
        proof: SwapProof,
        expected_commitment: felt252
    ) -> bool;
    
    fn compute_hashlock(
        self: @TContractState,
        preimage: felt252
    ) -> felt252;
    
    fn verify_hashlock(
        self: @TContractState,
        preimage: felt252,
        hashlock: felt252
    ) -> bool;
}

#[starknet::contract]
pub mod Verifier {
    use core::poseidon::poseidon_hash_span;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess, StoragePathEntry, Map};
    use stealthswap::types::SwapProof;

    #[storage]
    struct Storage {
        // Used nullifiers to prevent double-spending
        used_nullifiers: Map<felt252, bool>,
    }

    #[abi(embed_v0)]
    impl VerifierImpl of super::IVerifier<ContractState> {
        /// Creates a Pedersen-style commitment to hide the actual amount
        /// commitment = hash(amount, blinding_factor)
        fn verify_amount_commitment(
            self: @ContractState,
            amount: u256,
            blinding_factor: felt252
        ) -> felt252 {
            let amount_low: felt252 = amount.low.into();
            let amount_high: felt252 = amount.high.into();
            
            poseidon_hash_span(
                array![amount_low, amount_high, blinding_factor].span()
            )
        }

        /// Verifies that a swap proof is valid
        /// This is a simplified ZK verification - in production you'd use a full STARK proof
        fn verify_swap_proof(
            self: @ContractState,
            proof: SwapProof,
            expected_commitment: felt252
        ) -> bool {
            // Verify the commitment matches
            if proof.amount_commitment != expected_commitment {
                return false;
            }

            // Verify nullifier hasn't been used (prevents replay)
            if self.used_nullifiers.entry(proof.nullifier).read() {
                return false;
            }

            // Verify proof hash is non-zero (simplified check)
            if proof.proof_hash == 0 {
                return false;
            }

            true
        }

        /// Computes hashlock from preimage using Poseidon hash
        fn compute_hashlock(
            self: @ContractState,
            preimage: felt252
        ) -> felt252 {
            poseidon_hash_span(array![preimage].span())
        }

        /// Verifies that preimage hashes to the expected hashlock
        fn verify_hashlock(
            self: @ContractState,
            preimage: felt252,
            hashlock: felt252
        ) -> bool {
            let computed = poseidon_hash_span(array![preimage].span());
            computed == hashlock
        }
    }
}
