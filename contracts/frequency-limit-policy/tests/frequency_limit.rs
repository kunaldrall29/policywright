//! Integration tests for the frequency limit policy, written in the style of
//! the OpenZeppelin stellar-accounts policy tests (soroban-sdk testutils:
//! `e.register`, `mock_all_auths`, `e.ledger().with_mut`, and
//! `should_panic(expected = "Error(Contract, #NNNN)")` assertions).

use frequency_limit_policy::{
    FrequencyLimitParams, FrequencyLimitPolicy, FrequencyLimitPolicyClient,
};
use soroban_sdk::{
    auth::{Context, ContractContext},
    symbol_short,
    testutils::{Address as _, Ledger},
    vec, Address, Env, IntoVal, String, Vec,
};
use stellar_accounts::smart_account::{ContextRule, ContextRuleType, Signer};

/// A realistic ledger close time (2023-11-14T22:13:20Z); the window logic is
/// exercised at real-world magnitudes, not at genesis.
const T0: u64 = 1_700_000_000;

fn setup() -> (Env, Address) {
    let e = Env::default();
    let contract_id = e.register(FrequencyLimitPolicy, ());
    e.mock_all_auths();
    e.ledger().with_mut(|li| {
        li.timestamp = T0;
    });
    (e, contract_id)
}

fn set_time(e: &Env, timestamp: u64) {
    e.ledger().with_mut(|li| {
        li.timestamp = timestamp;
    });
}

fn create_context_rule(e: &Env, id: u32) -> ContextRule {
    ContextRule {
        id,
        context_type: ContextRuleType::CallContract(Address::generate(e)),
        name: String::from_str(e, "rule"),
        signers: Vec::new(e),
        signer_ids: Vec::new(e),
        policies: Vec::new(e),
        policy_ids: Vec::new(e),
        valid_until: None,
    }
}

fn swap_context(e: &Env) -> Context {
    Context::Contract(ContractContext {
        contract: Address::generate(e),
        fn_name: symbol_short!("swap"),
        args: vec![e, 1i128.into_val(e)],
    })
}

fn no_signers(e: &Env) -> Vec<Signer> {
    Vec::new(e)
}

fn params(window_secs: u64, max_calls: u32) -> FrequencyLimitParams {
    FrequencyLimitParams {
        window_secs,
        max_calls,
    }
}

// ################## INSTALL ##################

#[test]
fn install_persists_params_and_empty_history() {
    let (e, contract_id) = setup();
    let client = FrequencyLimitPolicyClient::new(&e, &contract_id);
    let smart_account = Address::generate(&e);
    let rule = create_context_rule(&e, 1);

    client.install(&params(600, 3), &rule, &smart_account);

    let data = client.get_frequency_limit_data(&rule.id, &smart_account);
    assert_eq!(data.window_secs, 600);
    assert_eq!(data.max_calls, 3);
    assert_eq!(data.call_history.len(), 0);
}

#[test]
#[should_panic(expected = "Error(Contract, #3233)")]
fn install_twice_panics_already_installed() {
    let (e, contract_id) = setup();
    let client = FrequencyLimitPolicyClient::new(&e, &contract_id);
    let smart_account = Address::generate(&e);
    let rule = create_context_rule(&e, 1);

    client.install(&params(600, 3), &rule, &smart_account);
    client.install(&params(600, 3), &rule, &smart_account);
}

#[test]
#[should_panic(expected = "Error(Contract, #3232)")]
fn install_zero_window_panics_invalid() {
    let (e, contract_id) = setup();
    let client = FrequencyLimitPolicyClient::new(&e, &contract_id);
    let smart_account = Address::generate(&e);
    let rule = create_context_rule(&e, 1);

    client.install(&params(0, 3), &rule, &smart_account);
}

#[test]
#[should_panic(expected = "Error(Contract, #3232)")]
fn install_zero_max_calls_panics_invalid() {
    let (e, contract_id) = setup();
    let client = FrequencyLimitPolicyClient::new(&e, &contract_id);
    let smart_account = Address::generate(&e);
    let rule = create_context_rule(&e, 1);

    client.install(&params(600, 0), &rule, &smart_account);
}

// ################## ENFORCE: COUNT LIMIT ##################

#[test]
fn enforce_permits_up_to_max_calls() {
    let (e, contract_id) = setup();
    let client = FrequencyLimitPolicyClient::new(&e, &contract_id);
    let smart_account = Address::generate(&e);
    let rule = create_context_rule(&e, 1);

    client.install(&params(600, 3), &rule, &smart_account);
    for _ in 0..3 {
        client.enforce(&swap_context(&e), &no_signers(&e), &rule, &smart_account);
    }

    let data = client.get_frequency_limit_data(&rule.id, &smart_account);
    assert_eq!(data.call_history.len(), 3);
}

#[test]
#[should_panic(expected = "Error(Contract, #3231)")]
fn enforce_over_max_calls_panics() {
    let (e, contract_id) = setup();
    let client = FrequencyLimitPolicyClient::new(&e, &contract_id);
    let smart_account = Address::generate(&e);
    let rule = create_context_rule(&e, 1);

    client.install(&params(600, 3), &rule, &smart_account);
    for _ in 0..4 {
        client.enforce(&swap_context(&e), &no_signers(&e), &rule, &smart_account);
    }
}

#[test]
#[should_panic(expected = "Error(Contract, #3230)")]
fn enforce_without_install_panics_not_installed() {
    let (e, contract_id) = setup();
    let client = FrequencyLimitPolicyClient::new(&e, &contract_id);
    let smart_account = Address::generate(&e);
    let rule = create_context_rule(&e, 1);

    client.enforce(&swap_context(&e), &no_signers(&e), &rule, &smart_account);
}

// ################## ENFORCE: WINDOW ROLLOVER ##################

#[test]
fn enforce_permits_again_once_window_rolls_over() {
    let (e, contract_id) = setup();
    let client = FrequencyLimitPolicyClient::new(&e, &contract_id);
    let smart_account = Address::generate(&e);
    let rule = create_context_rule(&e, 1);

    client.install(&params(600, 1), &rule, &smart_account);
    client.enforce(&swap_context(&e), &no_signers(&e), &rule, &smart_account);

    // Exactly one window later the T0 entry is evicted (exclusive window
    // start: entries at or before now - window_secs leave the window).
    set_time(&e, T0 + 600);
    client.enforce(&swap_context(&e), &no_signers(&e), &rule, &smart_account);

    let data = client.get_frequency_limit_data(&rule.id, &smart_account);
    assert_eq!(data.call_history.len(), 1);
    assert_eq!(data.call_history.get(0), Some(T0 + 600));
}

#[test]
#[should_panic(expected = "Error(Contract, #3231)")]
fn enforce_inside_window_still_panics() {
    let (e, contract_id) = setup();
    let client = FrequencyLimitPolicyClient::new(&e, &contract_id);
    let smart_account = Address::generate(&e);
    let rule = create_context_rule(&e, 1);

    client.install(&params(600, 1), &rule, &smart_account);
    client.enforce(&swap_context(&e), &no_signers(&e), &rule, &smart_account);

    // One second before the window rolls over, the T0 entry still counts.
    set_time(&e, T0 + 599);
    client.enforce(&swap_context(&e), &no_signers(&e), &rule, &smart_account);
}

#[test]
fn enforce_evicts_only_expired_entries() {
    let (e, contract_id) = setup();
    let client = FrequencyLimitPolicyClient::new(&e, &contract_id);
    let smart_account = Address::generate(&e);
    let rule = create_context_rule(&e, 1);

    client.install(&params(600, 2), &rule, &smart_account);
    client.enforce(&swap_context(&e), &no_signers(&e), &rule, &smart_account);
    set_time(&e, T0 + 300);
    client.enforce(&swap_context(&e), &no_signers(&e), &rule, &smart_account);

    // T0 has left the window; T0+300 is still inside it.
    set_time(&e, T0 + 700);
    client.enforce(&swap_context(&e), &no_signers(&e), &rule, &smart_account);

    let data = client.get_frequency_limit_data(&rule.id, &smart_account);
    assert_eq!(data.call_history, vec![&e, T0 + 300, T0 + 700]);
}

// ################## ISOLATION ##################

#[test]
fn state_is_isolated_per_smart_account() {
    let (e, contract_id) = setup();
    let client = FrequencyLimitPolicyClient::new(&e, &contract_id);
    let account_a = Address::generate(&e);
    let account_b = Address::generate(&e);
    let rule = create_context_rule(&e, 1);

    client.install(&params(600, 1), &rule, &account_a);
    client.install(&params(600, 1), &rule, &account_b);

    // Exhaust A's limit; B must be unaffected.
    client.enforce(&swap_context(&e), &no_signers(&e), &rule, &account_a);
    client.enforce(&swap_context(&e), &no_signers(&e), &rule, &account_b);

    assert_eq!(
        client
            .get_frequency_limit_data(&rule.id, &account_a)
            .call_history
            .len(),
        1
    );
    assert_eq!(
        client
            .get_frequency_limit_data(&rule.id, &account_b)
            .call_history
            .len(),
        1
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #3231)")]
fn exhausted_account_still_denied_while_other_account_passes() {
    let (e, contract_id) = setup();
    let client = FrequencyLimitPolicyClient::new(&e, &contract_id);
    let account_a = Address::generate(&e);
    let account_b = Address::generate(&e);
    let rule = create_context_rule(&e, 1);

    client.install(&params(600, 1), &rule, &account_a);
    client.install(&params(600, 1), &rule, &account_b);

    client.enforce(&swap_context(&e), &no_signers(&e), &rule, &account_a);
    client.enforce(&swap_context(&e), &no_signers(&e), &rule, &account_b);
    client.enforce(&swap_context(&e), &no_signers(&e), &rule, &account_a);
}

#[test]
fn state_is_isolated_per_context_rule() {
    let (e, contract_id) = setup();
    let client = FrequencyLimitPolicyClient::new(&e, &contract_id);
    let smart_account = Address::generate(&e);
    let rule_1 = create_context_rule(&e, 1);
    let rule_2 = create_context_rule(&e, 2);

    client.install(&params(600, 1), &rule_1, &smart_account);
    client.install(&params(600, 1), &rule_2, &smart_account);

    // Exhaust rule 1's limit; rule 2 must be unaffected.
    client.enforce(&swap_context(&e), &no_signers(&e), &rule_1, &smart_account);
    client.enforce(&swap_context(&e), &no_signers(&e), &rule_2, &smart_account);

    assert_eq!(
        client
            .get_frequency_limit_data(&rule_1.id, &smart_account)
            .call_history
            .len(),
        1
    );
    assert_eq!(
        client
            .get_frequency_limit_data(&rule_2.id, &smart_account)
            .call_history
            .len(),
        1
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #3231)")]
fn exhausted_rule_still_denied_while_other_rule_passes() {
    let (e, contract_id) = setup();
    let client = FrequencyLimitPolicyClient::new(&e, &contract_id);
    let smart_account = Address::generate(&e);
    let rule_1 = create_context_rule(&e, 1);
    let rule_2 = create_context_rule(&e, 2);

    client.install(&params(600, 1), &rule_1, &smart_account);
    client.install(&params(600, 1), &rule_2, &smart_account);

    client.enforce(&swap_context(&e), &no_signers(&e), &rule_1, &smart_account);
    client.enforce(&swap_context(&e), &no_signers(&e), &rule_2, &smart_account);
    client.enforce(&swap_context(&e), &no_signers(&e), &rule_1, &smart_account);
}

// ################## UNINSTALL ##################

#[test]
fn uninstall_removes_state() {
    let (e, contract_id) = setup();
    let client = FrequencyLimitPolicyClient::new(&e, &contract_id);
    let smart_account = Address::generate(&e);
    let rule = create_context_rule(&e, 1);

    client.install(&params(600, 1), &rule, &smart_account);
    client.enforce(&swap_context(&e), &no_signers(&e), &rule, &smart_account);
    // Not should_panic: uninstall itself must succeed; only the read after it
    // may fail — this keeps the panic attributable.
    client.uninstall(&rule, &smart_account);

    assert!(client
        .try_get_frequency_limit_data(&rule.id, &smart_account)
        .is_err());
}

#[test]
#[should_panic(expected = "Error(Contract, #3230)")]
fn uninstall_without_install_panics_not_installed() {
    let (e, contract_id) = setup();
    let client = FrequencyLimitPolicyClient::new(&e, &contract_id);
    let smart_account = Address::generate(&e);
    let rule = create_context_rule(&e, 1);

    client.uninstall(&rule, &smart_account);
}

#[test]
fn reinstall_after_uninstall_starts_fresh() {
    let (e, contract_id) = setup();
    let client = FrequencyLimitPolicyClient::new(&e, &contract_id);
    let smart_account = Address::generate(&e);
    let rule = create_context_rule(&e, 1);

    client.install(&params(600, 1), &rule, &smart_account);
    client.enforce(&swap_context(&e), &no_signers(&e), &rule, &smart_account);
    client.uninstall(&rule, &smart_account);

    // A fresh install must not inherit the exhausted history.
    client.install(&params(600, 1), &rule, &smart_account);
    client.enforce(&swap_context(&e), &no_signers(&e), &rule, &smart_account);

    let data = client.get_frequency_limit_data(&rule.id, &smart_account);
    assert_eq!(data.call_history.len(), 1);
}

#[test]
fn uninstall_of_one_pair_leaves_others_intact() {
    let (e, contract_id) = setup();
    let client = FrequencyLimitPolicyClient::new(&e, &contract_id);
    let account_a = Address::generate(&e);
    let account_b = Address::generate(&e);
    let rule = create_context_rule(&e, 1);

    client.install(&params(600, 3), &rule, &account_a);
    client.install(&params(600, 3), &rule, &account_b);
    client.enforce(&swap_context(&e), &no_signers(&e), &rule, &account_b);

    client.uninstall(&rule, &account_a);

    let data = client.get_frequency_limit_data(&rule.id, &account_b);
    assert_eq!(data.call_history.len(), 1);
}

// ################## AUTHORIZATION ##################

#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn enforce_requires_smart_account_auth() {
    let (e, contract_id) = setup();
    let client = FrequencyLimitPolicyClient::new(&e, &contract_id);
    let smart_account = Address::generate(&e);
    let rule = create_context_rule(&e, 1);

    client.install(&params(600, 3), &rule, &smart_account);

    // Withdraw auth mocking: the smart account no longer authorizes.
    e.set_auths(&[]);
    client.enforce(&swap_context(&e), &no_signers(&e), &rule, &smart_account);
}

#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn install_requires_smart_account_auth() {
    let (e, contract_id) = setup();
    let client = FrequencyLimitPolicyClient::new(&e, &contract_id);
    let smart_account = Address::generate(&e);
    let rule = create_context_rule(&e, 1);

    // A third party must not be able to pre-install params for a victim.
    e.set_auths(&[]);
    client.install(&params(600, 3), &rule, &smart_account);
}

#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn uninstall_requires_smart_account_auth() {
    let (e, contract_id) = setup();
    let client = FrequencyLimitPolicyClient::new(&e, &contract_id);
    let smart_account = Address::generate(&e);
    let rule = create_context_rule(&e, 1);

    client.install(&params(600, 3), &rule, &smart_account);

    // A third party must not be able to reset a victim's meter by
    // uninstalling their policy.
    e.set_auths(&[]);
    client.uninstall(&rule, &smart_account);
}

// ################## EVENTS ##################

#[test]
fn install_and_enforce_publish_events() {
    let (e, contract_id) = setup();
    let client = FrequencyLimitPolicyClient::new(&e, &contract_id);
    let smart_account = Address::generate(&e);
    let rule = create_context_rule(&e, 1);

    use soroban_sdk::testutils::Events;

    // `e.events().all()` holds the events of the last invocation only.
    client.install(&params(600, 3), &rule, &smart_account);
    // Exactly one FrequencyLimitInstalled.
    assert_eq!(e.events().all().events().len(), 1);

    client.enforce(&swap_context(&e), &no_signers(&e), &rule, &smart_account);
    // Exactly one FrequencyLimitEnforced.
    assert_eq!(e.events().all().events().len(), 1);
}

// ################## HISTORY CAPACITY ##################

#[test]
#[should_panic(expected = "Error(Contract, #3232)")]
fn install_max_calls_over_history_capacity_panics_invalid() {
    let (e, contract_id) = setup();
    let client = FrequencyLimitPolicyClient::new(&e, &contract_id);
    let smart_account = Address::generate(&e);
    let rule = create_context_rule(&e, 1);

    // max_calls above MAX_HISTORY_ENTRIES would be undeliverable (the
    // history cap would bind before the configured limit) — rejected at
    // install instead.
    client.install(&params(600, 1_001), &rule, &smart_account);
}

// ################## GENESIS-EDGE WINDOW ##################

#[test]
fn window_reaching_before_genesis_keeps_all_entries() {
    let (e, contract_id) = setup();
    let client = FrequencyLimitPolicyClient::new(&e, &contract_id);
    let smart_account = Address::generate(&e);
    let rule = create_context_rule(&e, 1);

    // Clock earlier than one full window after genesis: the cutoff
    // underflows (None) and nothing is evicted.
    set_time(&e, 50);
    client.install(&params(600, 2), &rule, &smart_account);
    client.enforce(&swap_context(&e), &no_signers(&e), &rule, &smart_account);
    set_time(&e, 100);
    client.enforce(&swap_context(&e), &no_signers(&e), &rule, &smart_account);

    let data = client.get_frequency_limit_data(&rule.id, &smart_account);
    assert_eq!(data.call_history, vec![&e, 50, 100]);
}

#[test]
#[should_panic(expected = "Error(Contract, #3231)")]
fn window_reaching_before_genesis_still_counts_entries() {
    let (e, contract_id) = setup();
    let client = FrequencyLimitPolicyClient::new(&e, &contract_id);
    let smart_account = Address::generate(&e);
    let rule = create_context_rule(&e, 1);

    set_time(&e, 50);
    client.install(&params(600, 2), &rule, &smart_account);
    client.enforce(&swap_context(&e), &no_signers(&e), &rule, &smart_account);
    set_time(&e, 100);
    client.enforce(&swap_context(&e), &no_signers(&e), &rule, &smart_account);

    // Still inside the genesis-truncated window: both entries count.
    set_time(&e, 150);
    client.enforce(&swap_context(&e), &no_signers(&e), &rule, &smart_account);
}
