use starknet::ContractAddress;
use stealthswap::types::{Swap, SwapStatus, SwapProof};

#[starknet::interface]
pub trait IStealthSwap<TContractState> {
    // Core swap functions
    fn initiate_swap(
        ref self: TContractState,
        participant: ContractAddress,
        amount_hash: felt252,
        hashlock: felt252,
        timelock: u64,
    ) -> felt252;

    fn lock_swap(ref self: TContractState, swap_id: felt252, proof: SwapProof);
    
    fn complete_swap(ref self: TContractState, swap_id: felt252, preimage: felt252);
    
    fn refund_swap(ref self: TContractState, swap_id: felt252);

    // View functions
    fn get_swap(self: @TContractState, swap_id: felt252) -> Swap;
    
    fn get_swap_status(self: @TContractState, swap_id: felt252) -> SwapStatus;
    
    fn get_user_swaps(self: @TContractState, user: ContractAddress) -> Array<felt252>;
    
    fn get_swap_count(self: @TContractState) -> u64;
    
    fn is_swap_expired(self: @TContractState, swap_id: felt252) -> bool;
}

#[starknet::contract]
pub mod StealthSwap {
    use core::poseidon::poseidon_hash_span;
    use starknet::{
        ContractAddress, 
        get_caller_address, 
        get_block_timestamp,
    };
    use starknet::storage::{
        StoragePointerReadAccess, 
        StoragePointerWriteAccess, 
        StoragePathEntry, 
        Map
    };
    use stealthswap::types::{Swap, SwapStatus, SwapProof};

    #[storage]
    struct Storage {
        // Swap storage
        swaps: Map<felt252, Swap>,
        swap_count: u64,
        
        // User swap tracking
        user_swap_count: Map<ContractAddress, u64>,
        user_swaps: Map<(ContractAddress, u64), felt252>,
        
        // Privacy: used nullifiers to prevent replay attacks
        // Note: Tracked here in StealthSwap (not in Verifier) since swap state is managed here
        used_nullifiers: Map<felt252, bool>,
        
        // Contract owner
        owner: ContractAddress,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        SwapInitiated: SwapInitiated,
        SwapLocked: SwapLocked,
        SwapCompleted: SwapCompleted,
        SwapRefunded: SwapRefunded,
    }

    #[derive(Drop, starknet::Event)]
    pub struct SwapInitiated {
        #[key]
        pub swap_id: felt252,
        pub initiator: ContractAddress,
        pub participant: ContractAddress,
        pub timelock: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct SwapLocked {
        #[key]
        pub swap_id: felt252,
        pub proof_hash: felt252,
    }

    #[derive(Drop, starknet::Event)]
    pub struct SwapCompleted {
        #[key]
        pub swap_id: felt252,
        pub completed_by: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    pub struct SwapRefunded {
        #[key]
        pub swap_id: felt252,
        pub refunded_to: ContractAddress,
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        self.owner.write(owner);
        self.swap_count.write(0);
    }

    #[abi(embed_v0)]
    impl StealthSwapImpl of super::IStealthSwap<ContractState> {
        /// Initiates a new atomic swap with privacy-preserving amount commitment
        fn initiate_swap(
            ref self: ContractState,
            participant: ContractAddress,
            amount_hash: felt252,
            hashlock: felt252,
            timelock: u64,
        ) -> felt252 {
            let caller = get_caller_address();
            let timestamp = get_block_timestamp();
            
            // Validate timelock is in the future
            assert(timelock > timestamp, 'Timelock must be in future');
            
            // Generate unique swap ID
            let swap_count = self.swap_count.read();
            let swap_id = poseidon_hash_span(
                array![
                    caller.into(),
                    participant.into(),
                    amount_hash,
                    swap_count.into(),
                    timestamp.into()
                ].span()
            );
            
            // Create swap
            let swap = Swap {
                id: swap_id,
                initiator: caller,
                participant,
                amount_hash,
                hashlock,
                timelock,
                status: SwapStatus::Pending,
                created_at: timestamp,
            };
            
            // Store swap
            self.swaps.entry(swap_id).write(swap);
            self.swap_count.write(swap_count + 1);
            
            // Track user swaps
            let user_count = self.user_swap_count.entry(caller).read();
            self.user_swaps.entry((caller, user_count)).write(swap_id);
            self.user_swap_count.entry(caller).write(user_count + 1);
            
            let participant_count = self.user_swap_count.entry(participant).read();
            self.user_swaps.entry((participant, participant_count)).write(swap_id);
            self.user_swap_count.entry(participant).write(participant_count + 1);
            
            // Emit event
            self.emit(SwapInitiated {
                swap_id,
                initiator: caller,
                participant,
                timelock,
            });
            
            swap_id
        }

        /// Locks the swap with a ZK-style proof of the amount commitment
        fn lock_swap(ref self: ContractState, swap_id: felt252, proof: SwapProof) {
            let mut swap = self.swaps.entry(swap_id).read();
            let caller = get_caller_address();
            let timestamp = get_block_timestamp();
            
            // Validations
            assert(swap.status == SwapStatus::Pending, 'Swap not pending');
            assert(timestamp <= swap.timelock, 'Swap expired');
            assert(
                caller == swap.initiator || caller == swap.participant,
                'Not authorized'
            );
            assert(!self.used_nullifiers.entry(proof.nullifier).read(), 'Nullifier already used');
            
            // Verify proof matches amount commitment
            assert(proof.amount_commitment == swap.amount_hash, 'Invalid commitment');
            
            // Mark nullifier as used
            self.used_nullifiers.entry(proof.nullifier).write(true);
            
            // Update swap status
            swap.status = SwapStatus::Locked;
            self.swaps.entry(swap_id).write(swap);
            
            self.emit(SwapLocked {
                swap_id,
                proof_hash: proof.proof_hash,
            });
        }

        /// Completes the swap by revealing the preimage
        fn complete_swap(ref self: ContractState, swap_id: felt252, preimage: felt252) {
            let mut swap = self.swaps.entry(swap_id).read();
            let caller = get_caller_address();
            let timestamp = get_block_timestamp();
            
            // Validations
            assert(swap.status == SwapStatus::Locked, 'Swap not locked');
            assert(timestamp <= swap.timelock, 'Swap expired');
            
            // Verify hashlock
            let computed_hash = poseidon_hash_span(array![preimage].span());
            assert(computed_hash == swap.hashlock, 'Invalid preimage');
            
            // Complete swap
            swap.status = SwapStatus::Completed;
            self.swaps.entry(swap_id).write(swap);
            
            self.emit(SwapCompleted {
                swap_id,
                completed_by: caller,
            });
        }

        /// Refunds the swap after timelock expires
        fn refund_swap(ref self: ContractState, swap_id: felt252) {
            let mut swap = self.swaps.entry(swap_id).read();
            let caller = get_caller_address();
            let timestamp = get_block_timestamp();
            
            // Validations
            assert(
                swap.status == SwapStatus::Pending || swap.status == SwapStatus::Locked,
                'Cannot refund'
            );
            assert(timestamp > swap.timelock, 'Timelock not expired');
            assert(caller == swap.initiator, 'Only initiator can refund');
            
            // Refund
            swap.status = SwapStatus::Refunded;
            self.swaps.entry(swap_id).write(swap);
            
            self.emit(SwapRefunded {
                swap_id,
                refunded_to: caller,
            });
        }

        // View functions
        fn get_swap(self: @ContractState, swap_id: felt252) -> Swap {
            self.swaps.entry(swap_id).read()
        }

        fn get_swap_status(self: @ContractState, swap_id: felt252) -> SwapStatus {
            self.swaps.entry(swap_id).read().status
        }

        fn get_user_swaps(self: @ContractState, user: ContractAddress) -> Array<felt252> {
            let count = self.user_swap_count.entry(user).read();
            let mut swaps = ArrayTrait::new();
            let mut i: u64 = 0;
            
            while i < count {
                swaps.append(self.user_swaps.entry((user, i)).read());
                i += 1;
            };
            
            swaps
        }

        fn get_swap_count(self: @ContractState) -> u64 {
            self.swap_count.read()
        }

        fn is_swap_expired(self: @ContractState, swap_id: felt252) -> bool {
            let swap = self.swaps.entry(swap_id).read();
            let timestamp = get_block_timestamp();
            timestamp > swap.timelock
        }

       