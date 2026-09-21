#![no_std]
//! Minimal vault: `deposit` / `withdraw` against a SEP-41-shaped token.
//!
//! Original flow for Phase 4 S2 — not Blend / Soroswap.

use soroban_sdk::{contract, contracterror, contractimpl, symbol_short, token, Address, Env, Symbol};

#[contract]
pub struct SampleVault;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InsufficientShares = 1,
}

fn shares_key(user: &Address) -> (Symbol, Address) {
    (symbol_short!("SHARES"), user.clone())
}

#[contractimpl]
impl SampleVault {
    /// Bind the vault to a single token contract for its lifetime.
    pub fn __constructor(e: Env, token: Address) {
        e.storage().instance().set(&symbol_short!("TOKEN"), &token);
    }

    pub fn token(e: Env) -> Address {
        e.storage().instance().get(&symbol_short!("TOKEN")).unwrap()
    }

    /// Pull `amount` of the vault token from `from` into the vault.
    pub fn deposit(e: Env, from: Address, amount: i128) {
        from.require_auth();
        let token_addr: Address = e.storage().instance().get(&symbol_short!("TOKEN")).unwrap();
        let client = token::Client::new(&e, &token_addr);
        client.transfer(&from, &e.current_contract_address(), &amount);
        let shares: i128 = e.storage().persistent().get(&shares_key(&from)).unwrap_or(0);
        e.storage()
            .persistent()
            .set(&shares_key(&from), &(shares + amount));
    }

    /// Return `amount` of the vault token from the vault to `to`.
    pub fn withdraw(e: Env, to: Address, amount: i128) -> Result<(), Error> {
        to.require_auth();
        let shares: i128 = e.storage().persistent().get(&shares_key(&to)).unwrap_or(0);
        if shares < amount {
            return Err(Error::InsufficientShares);
        }
        e.storage()
            .persistent()
            .set(&shares_key(&to), &(shares - amount));
        let token_addr: Address = e.storage().instance().get(&symbol_short!("TOKEN")).unwrap();
        let client = token::Client::new(&e, &token_addr);
        client.transfer(&e.current_contract_address(), &to, &amount);
        Ok(())
    }

    pub fn shares(e: Env, user: Address) -> i128 {
        e.storage().persistent().get(&shares_key(&user)).unwrap_or(0)
    }
}
