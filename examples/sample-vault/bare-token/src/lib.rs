#![no_std]
//! Minimal SEP-41-shaped token **without** `name` / `symbol` / `decimals`.
//!
//! Intentionally omits metadata getters so policywright's live resolver falls
//! back to `resolved: false` (Phase 4 S2 novelty check).

use soroban_sdk::{
    contract, contracterror, contractimpl, symbol_short, Address, Env, Symbol,
};

#[contract]
pub struct BareToken;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InsufficientBalance = 1,
    InsufficientAllowance = 2,
}

fn bal_key(id: &Address) -> (Symbol, Address) {
    (symbol_short!("BALANCE"), id.clone())
}

fn allow_key(from: &Address, spender: &Address) -> (Symbol, Address, Address) {
    (symbol_short!("ALLOW"), from.clone(), spender.clone())
}

#[contractimpl]
impl BareToken {
    pub fn __constructor(e: Env, admin: Address) {
        e.storage().instance().set(&symbol_short!("ADMIN"), &admin);
    }

    pub fn mint(e: Env, to: Address, amount: i128) {
        let admin: Address = e.storage().instance().get(&symbol_short!("ADMIN")).unwrap();
        admin.require_auth();
        let bal: i128 = e.storage().persistent().get(&bal_key(&to)).unwrap_or(0);
        e.storage().persistent().set(&bal_key(&to), &(bal + amount));
        e.events()
            .publish((Symbol::new(&e, "mint"), to.clone()), amount);
    }

    pub fn balance(e: Env, id: Address) -> i128 {
        e.storage().persistent().get(&bal_key(&id)).unwrap_or(0)
    }

    pub fn transfer(e: Env, from: Address, to: Address, amount: i128) -> Result<(), Error> {
        from.require_auth();
        Self::move_balance(&e, &from, &to, amount)?;
        e.events().publish(
            (Symbol::new(&e, "transfer"), from.clone(), to.clone()),
            amount,
        );
        Ok(())
    }

    pub fn approve(e: Env, from: Address, spender: Address, amount: i128, _expiration_ledger: u32) {
        from.require_auth();
        e.storage()
            .persistent()
            .set(&allow_key(&from, &spender), &amount);
    }

    pub fn allowance(e: Env, from: Address, spender: Address) -> i128 {
        e.storage()
            .persistent()
            .get(&allow_key(&from, &spender))
            .unwrap_or(0)
    }

    pub fn transfer_from(
        e: Env,
        spender: Address,
        from: Address,
        to: Address,
        amount: i128,
    ) -> Result<(), Error> {
        spender.require_auth();
        let allowed: i128 = e
            .storage()
            .persistent()
            .get(&allow_key(&from, &spender))
            .unwrap_or(0);
        if allowed < amount {
            return Err(Error::InsufficientAllowance);
        }
        e.storage()
            .persistent()
            .set(&allow_key(&from, &spender), &(allowed - amount));
        Self::move_balance(&e, &from, &to, amount)?;
        e.events().publish(
            (Symbol::new(&e, "transfer"), from.clone(), to.clone()),
            amount,
        );
        Ok(())
    }

    fn move_balance(e: &Env, from: &Address, to: &Address, amount: i128) -> Result<(), Error> {
        let from_bal: i128 = e.storage().persistent().get(&bal_key(from)).unwrap_or(0);
        if from_bal < amount {
            return Err(Error::InsufficientBalance);
        }
        let to_bal: i128 = e.storage().persistent().get(&bal_key(to)).unwrap_or(0);
        e.storage()
            .persistent()
            .set(&bal_key(from), &(from_bal - amount));
        e.storage()
            .persistent()
            .set(&bal_key(to), &(to_bal + amount));
        Ok(())
    }
}
