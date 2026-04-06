//! Haven Protocol shared types for CKB smart contracts.
//!
//! All types are `no_std` compatible and use manual byte serialization
//! for deterministic on-chain parsing. No allocator required.

#![no_std]

// ---------------------------------------------------------------------------
// Error codes (CKB convention: numeric error codes)
// ---------------------------------------------------------------------------

/// Error codes returned by Haven scripts. CKB convention is to use small
/// positive integers. We reserve 0-9 for generic errors and 10+ for
/// domain-specific errors.
pub mod error {
    /// Data length does not match expected size.
    pub const INVALID_DATA_LENGTH: i8 = 5;
    /// Score value exceeds the maximum allowed (1000).
    pub const SCORE_OUT_OF_RANGE: i8 = 6;
    /// Version field is unsupported.
    pub const UNSUPPORTED_VERSION: i8 = 7;

    // -- Type script errors --------------------------------------------------
    /// No matching registry cell found in cell deps.
    pub const REGISTRY_NOT_FOUND: i8 = 10;
    /// SP1 proof verification failed.
    pub const PROOF_VERIFICATION_FAILED: i8 = 11;
    /// Program hash in proof does not match registry (current or previous).
    pub const PROGRAM_HASH_MISMATCH: i8 = 12;
    /// User identity changed between input and output cells.
    pub const IDENTITY_CHANGED: i8 = 13;
    /// Epoch did not increment correctly.
    pub const INVALID_EPOCH: i8 = 14;
    /// Deposit balance change does not match the per-update fee.
    pub const INVALID_FEE_DEDUCTION: i8 = 15;
    /// Initial score must be zero.
    pub const INITIAL_SCORE_NOT_ZERO: i8 = 16;
    /// Deposit below minimum required.
    pub const DEPOSIT_BELOW_MINIMUM: i8 = 17;
    /// Expires_at field is set incorrectly.
    pub const INVALID_EXPIRY: i8 = 18;
    /// Public inputs from proof do not match cell state.
    pub const PUBLIC_INPUTS_MISMATCH: i8 = 19;
    /// Witness data is missing or malformed.
    pub const INVALID_WITNESS: i8 = 20;
    /// Component breakdown score exceeds maximum (250 per component).
    pub const BREAKDOWN_OUT_OF_RANGE: i8 = 21;
    /// Breakdown scores do not sum to total score.
    pub const BREAKDOWN_SUM_MISMATCH: i8 = 22;

    // -- Lock script errors --------------------------------------------------
    /// Signature verification failed (user path).
    pub const INVALID_SIGNATURE: i8 = 30;
    /// Lock args length is invalid.
    pub const INVALID_LOCK_ARGS: i8 = 31;
    /// TEE path: type script not present on output cell.
    pub const TYPE_SCRIPT_MISSING: i8 = 32;
    /// TEE path: TEE signature invalid.
    pub const INVALID_TEE_SIGNATURE: i8 = 33;
    /// Witness path flag is invalid.
    pub const INVALID_PATH_FLAG: i8 = 34;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Total size of the Haven Score cell data in bytes.
pub const SCORE_CELL_SIZE: usize = 127;

/// Maximum allowed Haven Score value.
pub const MAX_SCORE: u16 = 1000;

/// Maximum allowed per-component breakdown score (1000 * 0.40 = 400 max
/// for the heaviest component, but spec says score 0-1000 total). Each
/// component is u16 so theoretically up to 65535, but we enforce the sum
/// must equal the total score.
pub const MAX_COMPONENT_SCORE: u16 = 1000;

/// Current supported cell schema version.
pub const CURRENT_VERSION: u8 = 1;

/// Size of the registry cell data.
pub const REGISTRY_CELL_SIZE: usize = 138;

/// Size of the lock script args: user_pubkey_hash (20) + tee_pubkey_hash (20).
pub const LOCK_ARGS_SIZE: usize = 40;

/// Witness path flag: TEE update path.
pub const PATH_TEE_UPDATE: u8 = 0x00;

/// Witness path flag: user direct control path.
pub const PATH_USER_DIRECT: u8 = 0x01;

/// Size of the PublicInputs struct when serialized.
pub const PUBLIC_INPUTS_SIZE: usize = 84;

// ---------------------------------------------------------------------------
// Score Cell (127 bytes)
// ---------------------------------------------------------------------------

/// Haven Score Cell data layout.
///
/// | Field            | Offset | Size | Type  |
/// |------------------|--------|------|-------|
/// | version          | 0      | 1    | u8    |
/// | score            | 1      | 2    | u16   |
/// | epoch            | 3      | 4    | u32   |
/// | user_identity    | 7      | 32   | [u8]  |
/// | program_hash     | 39     | 32   | [u8]  |
/// | proof_hash       | 71     | 32   | [u8]  |
/// | score_breakdown  | 103    | 8    | 4xu16 |
/// | issued_at        | 111    | 4    | u32   |
/// | expires_at       | 115    | 4    | u32   |
/// | deposit_balance  | 119    | 8    | u64   |
#[derive(Clone, Debug, PartialEq)]
pub struct ScoreCell {
    pub version: u8,
    pub score: u16,
    pub epoch: u32,
    pub user_identity: [u8; 32],
    pub program_hash: [u8; 32],
    pub proof_hash: [u8; 32],
    pub privacy_score: u16,
    pub contribution_score: u16,
    pub humanity_score: u16,
    pub community_score: u16,
    pub issued_at: u32,
    pub expires_at: u32,
    pub deposit_balance: u64,
}

impl ScoreCell {
    /// Deserialize a ScoreCell from exactly 127 bytes (little-endian).
    pub fn from_bytes(data: &[u8]) -> Result<Self, i8> {
        if data.len() != SCORE_CELL_SIZE {
            return Err(error::INVALID_DATA_LENGTH);
        }

        let version = data[0];
        if version != CURRENT_VERSION {
            return Err(error::UNSUPPORTED_VERSION);
        }

        let score = u16::from_le_bytes([data[1], data[2]]);
        if score > MAX_SCORE {
            return Err(error::SCORE_OUT_OF_RANGE);
        }

        let epoch = u32::from_le_bytes([data[3], data[4], data[5], data[6]]);

        let mut user_identity = [0u8; 32];
        user_identity.copy_from_slice(&data[7..39]);

        let mut program_hash = [0u8; 32];
        program_hash.copy_from_slice(&data[39..71]);

        let mut proof_hash = [0u8; 32];
        proof_hash.copy_from_slice(&data[71..103]);

        let privacy_score = u16::from_le_bytes([data[103], data[104]]);
        let contribution_score = u16::from_le_bytes([data[105], data[106]]);
        let humanity_score = u16::from_le_bytes([data[107], data[108]]);
        let community_score = u16::from_le_bytes([data[109], data[110]]);

        let issued_at = u32::from_le_bytes([data[111], data[112], data[113], data[114]]);
        let expires_at = u32::from_le_bytes([data[115], data[116], data[117], data[118]]);
        let deposit_balance = u64::from_le_bytes([
            data[119], data[120], data[121], data[122],
            data[123], data[124], data[125], data[126],
        ]);

        Ok(ScoreCell {
            version,
            score,
            epoch,
            user_identity,
            program_hash,
            proof_hash,
            privacy_score,
            contribution_score,
            humanity_score,
            community_score,
            issued_at,
            expires_at,
            deposit_balance,
        })
    }

    /// Serialize the ScoreCell to exactly 127 bytes (little-endian).
    pub fn to_bytes(&self, buf: &mut [u8]) -> Result<(), i8> {
        if buf.len() != SCORE_CELL_SIZE {
            return Err(error::INVALID_DATA_LENGTH);
        }

        buf[0] = self.version;
        buf[1..3].copy_from_slice(&self.score.to_le_bytes());
        buf[3..7].copy_from_slice(&self.epoch.to_le_bytes());
        buf[7..39].copy_from_slice(&self.user_identity);
        buf[39..71].copy_from_slice(&self.program_hash);
        buf[71..103].copy_from_slice(&self.proof_hash);
        buf[103..105].copy_from_slice(&self.privacy_score.to_le_bytes());
        buf[105..107].copy_from_slice(&self.contribution_score.to_le_bytes());
        buf[107..109].copy_from_slice(&self.humanity_score.to_le_bytes());
        buf[109..111].copy_from_slice(&self.community_score.to_le_bytes());
        buf[111..115].copy_from_slice(&self.issued_at.to_le_bytes());
        buf[115..119].copy_from_slice(&self.expires_at.to_le_bytes());
        buf[119..127].copy_from_slice(&self.deposit_balance.to_le_bytes());

        Ok(())
    }

    /// Validate that the breakdown scores sum to the total score.
    pub fn validate_breakdown(&self) -> Result<(), i8> {
        let sum = self.privacy_score as u32
            + self.contribution_score as u32
            + self.humanity_score as u32
            + self.community_score as u32;
        if sum != self.score as u32 {
            return Err(error::BREAKDOWN_SUM_MISMATCH);
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Registry Cell (139 bytes)
// ---------------------------------------------------------------------------

/// Haven Registry Cell data layout.
///
/// | Field              | Offset | Size | Type  |
/// |--------------------|--------|------|-------|
/// | program_hash       | 0      | 32   | [u8]  |
/// | prev_program_hash  | 32     | 32   | [u8]  |
/// | epoch_duration     | 64     | 4    | u32   |
/// | min_deposit        | 68     | 8    | u64   |
/// | per_update_fee     | 76     | 8    | u64   |
/// | fee_address        | 84     | 32   | [u8]  |
/// | tier_observer      | 116    | 2    | u16   |
/// | tier_initiate      | 118    | 2    | u16   |
/// | tier_trusted       | 120    | 2    | u16   |
/// | tier_guardian      | 122    | 2    | u16   |
/// | tier_sovereign     | 124    | 2    | u16   |
/// | version            | 126    | 1    | u8    |
/// | grace_epochs       | 127    | 4    | u32   |
/// | low_balance_warn   | 131    | 8    | u64   |  (threshold for low-balance warning, unused on-chain but stored)
///
/// Total: 32+32+4+8+8+32+2+2+2+2+2+1+4+8 = 139 bytes.
pub const REGISTRY_CELL_ACTUAL_SIZE: usize = 139;

pub struct RegistryCell {
    pub program_hash: [u8; 32],
    pub prev_program_hash: [u8; 32],
    pub epoch_duration: u32,
    pub min_deposit: u64,
    pub per_update_fee: u64,
    pub fee_address: [u8; 32],
    pub tier_observer: u16,
    pub tier_initiate: u16,
    pub tier_trusted: u16,
    pub tier_guardian: u16,
    pub tier_sovereign: u16,
    pub version: u8,
    pub grace_epochs: u32,
    pub low_balance_threshold: u64,
}

impl RegistryCell {
    /// Deserialize a RegistryCell from bytes (little-endian).
    pub fn from_bytes(data: &[u8]) -> Result<Self, i8> {
        if data.len() < REGISTRY_CELL_ACTUAL_SIZE {
            return Err(error::INVALID_DATA_LENGTH);
        }

        let mut program_hash = [0u8; 32];
        program_hash.copy_from_slice(&data[0..32]);

        let mut prev_program_hash = [0u8; 32];
        prev_program_hash.copy_from_slice(&data[32..64]);

        let epoch_duration = u32::from_le_bytes([data[64], data[65], data[66], data[67]]);

        let min_deposit = u64::from_le_bytes([
            data[68], data[69], data[70], data[71],
            data[72], data[73], data[74], data[75],
        ]);

        let per_update_fee = u64::from_le_bytes([
            data[76], data[77], data[78], data[79],
            data[80], data[81], data[82], data[83],
        ]);

        let mut fee_address = [0u8; 32];
        fee_address.copy_from_slice(&data[84..116]);

        let tier_observer = u16::from_le_bytes([data[116], data[117]]);
        let tier_initiate = u16::from_le_bytes([data[118], data[119]]);
        let tier_trusted = u16::from_le_bytes([data[120], data[121]]);
        let tier_guardian = u16::from_le_bytes([data[122], data[123]]);
        let tier_sovereign = u16::from_le_bytes([data[124], data[125]]);

        let version = data[126];

        let grace_epochs = u32::from_le_bytes([data[127], data[128], data[129], data[130]]);

        let low_balance_threshold = u64::from_le_bytes([
            data[131], data[132], data[133], data[134],
            data[135], data[136], data[137], data[138],
        ]);

        Ok(RegistryCell {
            program_hash,
            prev_program_hash,
            epoch_duration,
            min_deposit,
            per_update_fee,
            fee_address,
            tier_observer,
            tier_initiate,
            tier_trusted,
            tier_guardian,
            tier_sovereign,
            version,
            grace_epochs,
            low_balance_threshold,
        })
    }

    /// Check if a given program hash matches the current or previous
    /// (grace-period) program hash.
    pub fn is_valid_program_hash(&self, hash: &[u8; 32]) -> bool {
        if hash == &self.program_hash {
            return true;
        }
        // Allow previous program hash during grace period.
        // The caller should additionally check epoch-based grace window if needed.
        let zero = [0u8; 32];
        if self.prev_program_hash != zero && hash == &self.prev_program_hash {
            return true;
        }
        false
    }
}

// ---------------------------------------------------------------------------
// Public Inputs for SP1 verification (84 bytes)
// ---------------------------------------------------------------------------

/// PublicInputs are the values committed to in the SP1 proof and verified
/// by the type script against the actual cell state.
///
/// | Field           | Size | Type  |
/// |-----------------|------|-------|
/// | program_hash    | 32   | [u8]  |
/// | user_identity   | 32   | [u8]  |
/// | prev_score      | 2    | u16   |
/// | new_score       | 2    | u16   |
/// | epoch           | 4    | u32   |
/// | privacy         | 2    | u16   |
/// | contribution    | 2    | u16   |
/// | humanity        | 2    | u16   |
/// | community       | 2    | u16   |
/// | prev_epoch      | 4    | u32   |
/// | issued_at       | 4    | u32   |
/// | proof_hash      | 32   | [u8]  |  -- not in public inputs, computed from proof itself
///
/// Revised: proof_hash is computed on-chain from the proof bytes, not part
/// of public inputs. issued_at is read from the CKB header, not the proof.
/// Total serialized size: 84 bytes.
pub const PUBLIC_INPUTS_ACTUAL_SIZE: usize = 84;

pub struct PublicInputs {
    pub program_hash: [u8; 32],
    pub user_identity: [u8; 32],
    pub prev_score: u16,
    pub new_score: u16,
    pub epoch: u32,
    pub privacy_score: u16,
    pub contribution_score: u16,
    pub humanity_score: u16,
    pub community_score: u16,
    pub prev_epoch: u32,
    pub issued_at: u32,
}

impl PublicInputs {
    /// Deserialize PublicInputs from bytes (little-endian).
    pub fn from_bytes(data: &[u8]) -> Result<Self, i8> {
        if data.len() < PUBLIC_INPUTS_ACTUAL_SIZE {
            return Err(error::INVALID_DATA_LENGTH);
        }

        let mut program_hash = [0u8; 32];
        program_hash.copy_from_slice(&data[0..32]);

        let mut user_identity = [0u8; 32];
        user_identity.copy_from_slice(&data[32..64]);

        let prev_score = u16::from_le_bytes([data[64], data[65]]);
        let new_score = u16::from_le_bytes([data[66], data[67]]);
        let epoch = u32::from_le_bytes([data[68], data[69], data[70], data[71]]);

        let privacy_score = u16::from_le_bytes([data[72], data[73]]);
        let contribution_score = u16::from_le_bytes([data[74], data[75]]);
        let humanity_score = u16::from_le_bytes([data[76], data[77]]);
        let community_score = u16::from_le_bytes([data[78], data[79]]);

        let prev_epoch = u32::from_le_bytes([data[80], data[81], data[82], data[83]]);

        // issued_at is not part of the on-wire public inputs (it's read
        // from the CKB header by the type script). We keep the field in the
        // struct for convenience but always set it to 0 during deserialization
        // from proof data.
        let issued_at = 0u32;

        Ok(PublicInputs {
            program_hash,
            user_identity,
            prev_score,
            new_score,
            epoch,
            privacy_score,
            contribution_score,
            humanity_score,
            community_score,
            prev_epoch,
            issued_at,
        })
    }

    /// Serialize PublicInputs to bytes (little-endian).
    pub fn to_bytes(&self, buf: &mut [u8]) -> Result<(), i8> {
        if buf.len() < PUBLIC_INPUTS_ACTUAL_SIZE {
            return Err(error::INVALID_DATA_LENGTH);
        }

        buf[0..32].copy_from_slice(&self.program_hash);
        buf[32..64].copy_from_slice(&self.user_identity);
        buf[64..66].copy_from_slice(&self.prev_score.to_le_bytes());
        buf[66..68].copy_from_slice(&self.new_score.to_le_bytes());
        buf[68..72].copy_from_slice(&self.epoch.to_le_bytes());
        buf[72..74].copy_from_slice(&self.privacy_score.to_le_bytes());
        buf[74..76].copy_from_slice(&self.contribution_score.to_le_bytes());
        buf[76..78].copy_from_slice(&self.humanity_score.to_le_bytes());
        buf[78..80].copy_from_slice(&self.community_score.to_le_bytes());
        buf[80..84].copy_from_slice(&self.prev_epoch.to_le_bytes());

        // Zero-pad remaining if buffer is larger
        if buf.len() > PUBLIC_INPUTS_ACTUAL_SIZE {
            for byte in buf[PUBLIC_INPUTS_ACTUAL_SIZE..].iter_mut() {
                *byte = 0;
            }
        }

        Ok(())
    }

    /// Validate that public input scores are within range and breakdown sums
    /// to total.
    pub fn validate(&self) -> Result<(), i8> {
        if self.new_score > MAX_SCORE {
            return Err(error::SCORE_OUT_OF_RANGE);
        }
        if self.prev_score > MAX_SCORE {
            return Err(error::SCORE_OUT_OF_RANGE);
        }
        let sum = self.privacy_score as u32
            + self.contribution_score as u32
            + self.humanity_score as u32
            + self.community_score as u32;
        if sum != self.new_score as u32 {
            return Err(error::BREAKDOWN_SUM_MISMATCH);
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Witness layout for Haven transactions
// ---------------------------------------------------------------------------

/// The witness for a Haven score update transaction uses the following layout:
///
/// | Field              | Size     | Description                              |
/// |--------------------|----------|------------------------------------------|
/// | path_flag          | 1        | 0x00 = TEE update, 0x01 = user direct    |
/// | public_inputs      | 84       | PublicInputs (only for TEE path)         |
/// | vk_hash            | 32       | SP1 verification key hash (TEE path)     |
/// | proof_len          | 4        | Length of SP1 proof in bytes (u32 LE)    |
/// | proof              | variable | Raw SP1 PLONK proof bytes                |
///
/// For user direct path (0x01):
/// | path_flag          | 1        | 0x01                                     |
/// | signature          | 65       | secp256k1 recoverable signature          |
///
/// The witness is placed in the WitnessArgs.lock field for lock script
/// consumption, or in the WitnessArgs.input_type field for type script
/// consumption. In practice, Haven uses a raw witness layout without
/// WitnessArgs wrapping for simplicity.

/// Minimum witness size for TEE update path: flag(1) + public_inputs(84) + vk_hash(32) + proof_len(4) = 121
pub const TEE_WITNESS_HEADER_SIZE: usize = 121;

/// Witness size for user direct path: flag(1) + signature(65) = 66
pub const USER_WITNESS_SIZE: usize = 66;

/// Parse the path flag from the first byte of witness data.
pub fn parse_path_flag(witness: &[u8]) -> Result<u8, i8> {
    if witness.is_empty() {
        return Err(error::INVALID_WITNESS);
    }
    let flag = witness[0];
    if flag != PATH_TEE_UPDATE && flag != PATH_USER_DIRECT {
        return Err(error::INVALID_PATH_FLAG);
    }
    Ok(flag)
}

// ---------------------------------------------------------------------------
// Utility: constant-time comparison for hashes
// ---------------------------------------------------------------------------

/// Compare two 32-byte slices in constant time to prevent timing attacks.
pub fn ct_eq_32(a: &[u8; 32], b: &[u8; 32]) -> bool {
    let mut diff: u8 = 0;
    let mut i = 0;
    while i < 32 {
        diff |= a[i] ^ b[i];
        i += 1;
    }
    diff == 0
}

// ---------------------------------------------------------------------------
// Tests (std only)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    extern crate std;
    use super::*;

    #[test]
    fn test_score_cell_roundtrip() {
        let cell = ScoreCell {
            version: CURRENT_VERSION,
            score: 820,
            epoch: 22,
            user_identity: [0xAA; 32],
            program_hash: [0xBB; 32],
            proof_hash: [0xCC; 32],
            privacy_score: 340,
            contribution_score: 250,
            humanity_score: 160,
            community_score: 70,
            issued_at: 10000,
            expires_at: 10500,
            deposit_balance: 500_0000_0000, // 500 CKBytes in shannons
        };

        let mut buf = [0u8; SCORE_CELL_SIZE];
        cell.to_bytes(&mut buf).unwrap();

        let decoded = ScoreCell::from_bytes(&buf).unwrap();
        assert_eq!(decoded.version, cell.version);
        assert_eq!(decoded.score, cell.score);
        assert_eq!(decoded.epoch, cell.epoch);
        assert_eq!(decoded.user_identity, cell.user_identity);
        assert_eq!(decoded.program_hash, cell.program_hash);
        assert_eq!(decoded.proof_hash, cell.proof_hash);
        assert_eq!(decoded.privacy_score, cell.privacy_score);
        assert_eq!(decoded.contribution_score, cell.contribution_score);
        assert_eq!(decoded.humanity_score, cell.humanity_score);
        assert_eq!(decoded.community_score, cell.community_score);
        assert_eq!(decoded.issued_at, cell.issued_at);
        assert_eq!(decoded.expires_at, cell.expires_at);
        assert_eq!(decoded.deposit_balance, cell.deposit_balance);
    }

    #[test]
    fn test_score_cell_invalid_length() {
        let data = [0u8; 100]; // too short
        assert_eq!(ScoreCell::from_bytes(&data), Err(error::INVALID_DATA_LENGTH));
    }

    #[test]
    fn test_score_cell_score_out_of_range() {
        let mut buf = [0u8; SCORE_CELL_SIZE];
        buf[0] = CURRENT_VERSION;
        // score = 1001 (too high)
        buf[1..3].copy_from_slice(&1001u16.to_le_bytes());
        assert_eq!(ScoreCell::from_bytes(&buf), Err(error::SCORE_OUT_OF_RANGE));
    }

    #[test]
    fn test_breakdown_validation() {
        let cell = ScoreCell {
            version: CURRENT_VERSION,
            score: 820,
            epoch: 0,
            user_identity: [0; 32],
            program_hash: [0; 32],
            proof_hash: [0; 32],
            privacy_score: 340,
            contribution_score: 250,
            humanity_score: 160,
            community_score: 70, // 340+250+160+70 = 820
            issued_at: 0,
            expires_at: 0,
            deposit_balance: 0,
        };
        assert!(cell.validate_breakdown().is_ok());

        let bad = ScoreCell {
            community_score: 71, // now sums to 821 != 820
            ..cell
        };
        assert_eq!(bad.validate_breakdown(), Err(error::BREAKDOWN_SUM_MISMATCH));
    }

    #[test]
    fn test_public_inputs_roundtrip() {
        let pi = PublicInputs {
            program_hash: [0x11; 32],
            user_identity: [0x22; 32],
            prev_score: 500,
            new_score: 600,
            epoch: 10,
            privacy_score: 240,
            contribution_score: 180,
            humanity_score: 120,
            community_score: 60,
            prev_epoch: 9,
            issued_at: 0,
        };

        let mut buf = [0u8; PUBLIC_INPUTS_ACTUAL_SIZE];
        pi.to_bytes(&mut buf).unwrap();

        let decoded = PublicInputs::from_bytes(&buf).unwrap();
        assert_eq!(decoded.program_hash, pi.program_hash);
        assert_eq!(decoded.user_identity, pi.user_identity);
        assert_eq!(decoded.prev_score, pi.prev_score);
        assert_eq!(decoded.new_score, pi.new_score);
        assert_eq!(decoded.epoch, pi.epoch);
        assert_eq!(decoded.privacy_score, pi.privacy_score);
        assert_eq!(decoded.contribution_score, pi.contribution_score);
        assert_eq!(decoded.humanity_score, pi.humanity_score);
        assert_eq!(decoded.community_score, pi.community_score);
        assert_eq!(decoded.prev_epoch, pi.prev_epoch);
    }

    #[test]
    fn test_registry_valid_program_hash() {
        let reg = RegistryCell {
            program_hash: [0xAA; 32],
            prev_program_hash: [0xBB; 32],
            epoch_duration: 100,
            min_deposit: 200_0000_0000,
            per_update_fee: 3_0000_0000,
            fee_address: [0; 32],
            tier_observer: 0,
            tier_initiate: 200,
            tier_trusted: 400,
            tier_guardian: 650,
            tier_sovereign: 850,
            version: 1,
            grace_epochs: 2,
            low_balance_threshold: 10_0000_0000,
        };

        assert!(reg.is_valid_program_hash(&[0xAA; 32]));
        assert!(reg.is_valid_program_hash(&[0xBB; 32]));
        assert!(!reg.is_valid_program_hash(&[0xCC; 32]));
    }

    #[test]
    fn test_ct_eq_32() {
        let a = [0x42u8; 32];
        let b = [0x42u8; 32];
        let c = [0x43u8; 32];
        assert!(ct_eq_32(&a, &b));
        assert!(!ct_eq_32(&a, &c));
    }

    #[test]
    fn test_parse_path_flag() {
        assert_eq!(parse_path_flag(&[PATH_TEE_UPDATE]), Ok(PATH_TEE_UPDATE));
        assert_eq!(parse_path_flag(&[PATH_USER_DIRECT]), Ok(PATH_USER_DIRECT));
        assert_eq!(parse_path_flag(&[0x02]), Err(error::INVALID_PATH_FLAG));
        assert_eq!(parse_path_flag(&[]), Err(error::INVALID_WITNESS));
    }
}
