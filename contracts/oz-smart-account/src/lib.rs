#![no_std]

//! Thin deployable OpenZeppelin SmartAccount (stellar-accounts v0.7.2).
//!
//! Pattern mirrors `examples/multisig-smart-account/account` **without**
//! `Upgradeable` / `stellar-contract-utils` so the workspace stays on the
//! minimal dep set already pinned for FrequencyLimitPolicy.

use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contractimpl,
    crypto::Hash,
    Address, Env, Map, String, Symbol, Val, Vec,
};
use stellar_accounts::smart_account::{
    self, AuthPayload, ContextRule, ContextRuleType, ExecutionEntryPoint, Signer, SmartAccount,
    SmartAccountError,
};

#[contract]
pub struct OzSmartAccount;

#[contractimpl]
impl OzSmartAccount {
    /// Create a Default context rule with the provided signers and policies.
    ///
    /// Rule name is `"default"` (≤20 bytes). An empty `policies` map is valid
    /// when `signers` alone satisfies the ≥1 signer-or-policy requirement.
    pub fn __constructor(e: &Env, signers: Vec<Signer>, policies: Map<Address, Val>) {
        smart_account::add_context_rule(
            e,
            &ContextRuleType::Default,
            &String::from_str(e, "default"),
            None,
            &signers,
            &policies,
        );
    }
}

#[contractimpl]
impl CustomAccountInterface for OzSmartAccount {
    type Error = SmartAccountError;
    type Signature = AuthPayload;

    fn __check_auth(
        e: Env,
        signature_payload: Hash<32>,
        signatures: AuthPayload,
        auth_contexts: Vec<Context>,
    ) -> Result<(), Self::Error> {
        smart_account::do_check_auth(&e, &signature_payload, &signatures, &auth_contexts)
    }
}

#[contractimpl(contracttrait)]
impl SmartAccount for OzSmartAccount {}

#[contractimpl(contracttrait)]
impl ExecutionEntryPoint for OzSmartAccount {}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, vec, Address, Env};

    #[test]
    fn constructor_creates_default_rule_with_delegated_signer() {
        let e = Env::default();
        e.mock_all_auths();

        let signer_addr = Address::generate(&e);
        let signers = vec![&e, Signer::Delegated(signer_addr.clone())];
        let policies: Map<Address, Val> = Map::new(&e);

        let contract_id = e.register(OzSmartAccount, (signers, policies));
        let client = OzSmartAccountClient::new(&e, &contract_id);

        assert_eq!(client.get_context_rules_count(), 1);
        let rule = client.get_context_rule(&0);
        assert_eq!(rule.name, String::from_str(&e, "default"));
        assert_eq!(rule.context_type, ContextRuleType::Default);
        assert_eq!(rule.signers.len(), 1);
        match rule.signers.get(0).unwrap() {
            Signer::Delegated(a) => assert_eq!(a, signer_addr),
            _ => panic!("expected Delegated signer"),
        }
    }
}
