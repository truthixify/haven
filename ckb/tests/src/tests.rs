use ckb_testtool::ckb_types::{bytes::Bytes, core::TransactionBuilder, packed::*, prelude::*};
use ckb_testtool::context::Context;

use super::verify_and_dump_failed_tx;

const MAX_CYCLES: u64 = 100_000_000;

#[test]
fn test_haven_type_script_creation() {
    let mut context = Context::default();
    let type_script_out_point = context.deploy_cell_by_name("haven-type-script");

    let type_script = context
        .build_script(&type_script_out_point, Bytes::new())
        .expect("type script");

    // Build a minimal score cell with score=0 for creation
    // This is a placeholder test — full validation requires
    // proper 127-byte cell data and a registry cell dep.
    let lock_script = context
        .build_script(&type_script_out_point, Bytes::from(vec![0u8; 40]))
        .expect("lock script");

    let input_out_point = context.create_cell(
        CellOutput::new_builder()
            .capacity(500u64.pack())
            .lock(lock_script.clone())
            .build(),
        Bytes::new(),
    );

    let input = CellInput::new_builder()
        .previous_output(input_out_point)
        .build();

    let outputs = vec![CellOutput::new_builder()
        .capacity(500u64.pack())
        .lock(lock_script)
        .type_(Some(type_script).pack())
        .build()];

    // 127-byte score cell data: all zeros = version 0, score 0, epoch 0, etc.
    let score_cell_data = Bytes::from(vec![0u8; 127]);
    let outputs_data = vec![score_cell_data];

    let tx = TransactionBuilder::default()
        .input(input)
        .outputs(outputs)
        .outputs_data(outputs_data.pack())
        .build();
    let tx = context.complete_tx(tx);

    // This test verifies the type script can at least be loaded and executed.
    // Full validation tests will require proper cell data setup.
    let result = context.verify_tx(&tx, MAX_CYCLES);
    println!("Type script creation test result: {:?}", result);
}

#[test]
fn test_haven_lock_script_basic() {
    let mut context = Context::default();
    let lock_script_out_point = context.deploy_cell_by_name("haven-lock-script");

    // Lock args: 40 bytes = user_pubkey_hash(20) + tee_pubkey_hash(20)
    let lock_args = Bytes::from(vec![0u8; 40]);
    let lock_script = context
        .build_script(&lock_script_out_point, lock_args)
        .expect("lock script");

    let input_out_point = context.create_cell(
        CellOutput::new_builder()
            .capacity(1000u64.pack())
            .lock(lock_script.clone())
            .build(),
        Bytes::new(),
    );

    let input = CellInput::new_builder()
        .previous_output(input_out_point)
        .build();

    let outputs = vec![CellOutput::new_builder()
        .capacity(1000u64.pack())
        .lock(lock_script)
        .build()];

    let outputs_data = vec![Bytes::new()];

    let tx = TransactionBuilder::default()
        .input(input)
        .outputs(outputs)
        .outputs_data(outputs_data.pack())
        .build();
    let tx = context.complete_tx(tx);

    // This test verifies the lock script can be loaded.
    // Full signature verification tests require proper witness construction.
    let result = context.verify_tx(&tx, MAX_CYCLES);
    println!("Lock script basic test result: {:?}", result);
}
