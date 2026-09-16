#![no_std]

//! Thin Policy wrapper around `stellar_accounts::policies::spending_limit`.
//!
//! Stock `spending_limit` is a free-function module — not a deployable
//! contract. This wrapper matches the OpenZeppelin
//! `examples/multisig-smart-account/spending-limit-policy` pattern so a
//! `C…` address can be attached via `add_context_rule`'s policies map.

use soroban_sdk::{auth::Context, contract, contractimpl, Address, Env, Vec};
use stellar_accounts::{
    policies::{spending_limit, Policy},
    smart_account::{ContextRule, Signer},
};

#[contract]
pub struct SpendingLimitPolicy;

#[contractimpl]
impl Policy for SpendingLimitPolicy {
    type AccountParams = spending_limit::SpendingLimitAccountParams;

    fn enforce(
        e: &Env,
        context: Context,
        authenticated_signers: Vec<Signer>,
        context_rule: ContextRule,
        smart_account: Address,
    ) {
        spending_limit::enforce(
            e,
            &context,
            &authenticated_signers,
            &context_rule,
            &smart_account,
        )
    }

    fn install(
        e: &Env,
        install_params: Self::AccountParams,
        context_rule: ContextRule,
        smart_account: Address,
    ) {
        spending_limit::install(e, &install_params, &context_rule, &smart_account)
    }

    fn uninstall(e: &Env, context_rule: ContextRule, smart_account: Address) {
        spending_limit::uninstall(e, &context_rule, &smart_account)
    }
}

#[contractimpl]
impl SpendingLimitPolicy {
    /// Read spending-limit state for a (smart account, context rule) pair.
    pub fn get_spending_limit_data(
        e: Env,
        context_rule_id: u32,
        smart_account: Address,
    ) -> spending_limit::SpendingLimitData {
        spending_limit::get_spending_limit_data(&e, context_rule_id, &smart_account)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{
        auth::{Context, ContractContext},
        symbol_short,
        testutils::{Address as _, Ledger},
        vec, Address, Env, IntoVal, String, Vec,
    };
    use stellar_accounts::smart_account::{ContextRule, ContextRuleType, Signer};

    fn setup() -> (Env, Address) {
        let e = Env::default();
        let id = e.register(SpendingLimitPolicy, ());
        e.mock_all_auths();
        (e, id)
    }

    fn rule(e: &Env, id: u32, contract: &Address) -> ContextRule {
        ContextRule {
            id,
            context_type: ContextRuleType::CallContract(contract.clone()),
            name: String::from_str(e, "xfer"),
            signers: Vec::new(e),
            signer_ids: Vec::new(e),
            policies: Vec::new(e),
            policy_ids: Vec::new(e),
            valid_until: None,
        }
    }

    #[test]
    fn install_and_read_params() {
        let (e, policy_id) = setup();
        let client = SpendingLimitPolicyClient::new(&e, &policy_id);
        let smart_account = Address::generate(&e);
        let token = Address::generate(&e);
        let r = rule(&e, 1, &token);

        client.install(
            &spending_limit::SpendingLimitAccountParams {
                spending_limit: 11_000_000,
                period_ledgers: 17_280,
            },
            &r,
            &smart_account,
        );

        let data = client.get_spending_limit_data(&r.id, &smart_account);
        assert_eq!(data.spending_limit, 11_000_000);
        assert_eq!(data.period_ledgers, 17_280);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #3227)")]
    fn install_rejects_default_context_type() {
        let (e, policy_id) = setup();
        let client = SpendingLimitPolicyClient::new(&e, &policy_id);
        let smart_account = Address::generate(&e);
        let r = ContextRule {
            id: 1,
            context_type: ContextRuleType::Default,
            name: String::from_str(&e, "bad"),
            signers: Vec::new(&e),
            signer_ids: Vec::new(&e),
            policies: Vec::new(&e),
            policy_ids: Vec::new(&e),
            valid_until: None,
        };
        client.install(
            &spending_limit::SpendingLimitAccountParams {
                spending_limit: 1,
                period_ledgers: 1,
            },
            &r,
            &smart_account,
        );
    }

    #[test]
    fn enforce_meters_transfer_amount() {
        let (e, policy_id) = setup();
        e.ledger().with_mut(|li| {
            li.sequence_number = 100;
        });
        let client = SpendingLimitPolicyClient::new(&e, &policy_id);
        let smart_account = Address::generate(&e);
        let token = Address::generate(&e);
        let r = rule(&e, 1, &token);
        client.install(
            &spending_limit::SpendingLimitAccountParams {
                spending_limit: 10_000_000,
                period_ledgers: 17_280,
            },
            &r,
            &smart_account,
        );

        let from = Address::generate(&e);
        let to = Address::generate(&e);
        let ctx = Context::Contract(ContractContext {
            contract: token,
            fn_name: symbol_short!("transfer"),
            args: vec![
                &e,
                from.into_val(&e),
                to.into_val(&e),
                5_000_000i128.into_val(&e),
            ],
        });
        let signers = vec![&e, Signer::Delegated(Address::generate(&e))];
        client.enforce(&ctx, &signers, &r, &smart_account);

        let data = client.get_spending_limit_data(&r.id, &smart_account);
        assert_eq!(data.spending_limit, 10_000_000);
    }
}
