# Minimal On-Chain Backup Size

This note describes the current Rewind2 on-chain backup format.

The backup transaction does not store full presigned trigger and rescue transaction hex. It stores only the encrypted fields needed to recreate those transactions exactly from the vault transaction and Rewind2 policy constants.

## Current Payload

The plaintext backup entry is `185 bytes` for 20-byte emergency output data and `197 bytes` for 32-byte emergency output data:

- `ONCHAIN_BACKUP_ENTRY_VERSION = 0`, with `ONCHAIN_BACKUP_ENTRY_VERSION_BYTES = 1` (`onchainFormat.ts`).
- `EMERGENCY_OUTPUT_TYPE_BYTES = 1`, emergency output type (`emergencyOutputs.ts`).
- `LOCK_BLOCKS_BYTES = 2`, CSV timelock as a fixed unsigned block count, big-endian (`onchainFormat.ts`).
- `COMPRESSED_PUBLIC_KEY_BYTES = 33`, ephemeral compressed public key (`onchainFormat.ts`).
- `EMERGENCY_OUTPUT_DATA_BYTES = 20 | 32`, type-specific emergency output data (`emergencyOutputs.ts`).
- `ONCHAIN_BACKUP_SIGNATURE_BYTES = 64`, trigger transaction ECDSA signature as raw `r || s` (`onchainFormat.ts`).
- `ONCHAIN_BACKUP_SIGNATURE_BYTES = 64`, rescue transaction ECDSA signature as raw `r || s` (`onchainFormat.ts`).

The sighash type does not need to be stored if it is always the same, for example always `SIGHASH_ALL`. During restore, the raw `r || s` signatures are DER-encoded and the fixed sighash byte is appended.

## Assumptions

- The OP_RETURN is part of the signed backup transaction outputs.
- The backup transaction spends the deterministic backup output from the vault transaction.
- The spender/signer of that backup output is the trusted author of the backup message.
- The receiver verifies the backup transaction and script validity before reading the OP_RETURN.
- The receiver only reads the OP_RETURN from that verified backup transaction.
- There is no authentication tag in the cipher payload.
- The encryption nonce is deterministic, one per vault, derived from the vault number.
- The same key and nonce are never used to encrypt two different plaintexts.
- The CSV timelock is block-based, not time-based.
- Transaction templates, output order, tx versions, anchor values, fee rules, and sighash type are fixed by the backup format version.
- Emergency outputs must be one of `P2WPKH`, `P2PKH`, `P2SH`, `P2TR` or `P2WSH`.
- Restore code uses the backup format and Rewind2 policy constants, not persisted settings that might change later.
- The backup entry does not store vault mode. Restore infers `P2A_TRUC` from vault tx version `3` and `P2A_NON_TRUC` from vault tx version `2`.

Without an authentication tag, ciphertext tampering is not detected by the cipher itself. The restored data must be accepted only after recreating the transactions and verifying that the signatures, scripts, outputs, and spending chain are valid.

## Deterministic Values

The output values do not need to be stored if they are deterministic.

The restore code can derive them from:

- The vault transaction output value.
- The vault mode, inferred from the vault tx version in the current format.
- Fixed P2A anchor values.
- Fixed trigger and rescue fee rules.
- The fixed transaction virtual-size policy for the format version.

For `P2A_TRUC`, the trigger parent fee uses `P2A_TRUC_PRESIGNED_TRIGGER_FEERATE = 0 sat/vB` (`vaultFees.ts`). For `P2A_NON_TRUC`, the trigger parent fee uses `P2A_NON_TRUC_PRESIGNED_TRIGGER_FEERATE = MIN_FEE_RATE = 0.1 sat/vB` (`vaultFees.ts`). Rescue uses `PRESIGNED_RESCUE_FEERATE = 100 sat/vB` (`vaultFees.ts`). These rules are part of Rewind2 policy and do not depend on persisted settings.

## Approximate Size

For a 20-byte emergency output (`P2WPKH`, `P2PKH` or `P2SH`):

```text
1 byte       format/version
1 byte       emergency output type
2 bytes      CSV timelock, uint16 block count, big-endian
33 bytes    ephemeral compressed public key
20 bytes    emergency output data
64 bytes    trigger ECDSA signature, raw r || s
64 bytes    rescue ECDSA signature, raw r || s
```

That is `185 bytes` before encryption.

For a 32-byte emergency output (`P2TR` or `P2WSH`), the emergency output data field is 32 bytes, so the entry is `197 bytes` before encryption.

With no auth tag and a deterministic nonce, encryption adds no payload bytes. The OP_RETURN payload keeps `ONCHAIN_BACKUP_MAGIC = "REW"` (`onchainFormat.ts`), so the current on-chain payload is either `188 bytes` or `200 bytes`: `3` bytes of `REW` plus the type-specific ciphertext.

The current code uses block-based BIP68 CSV with `olderEncode({ blocks: lockBlocks })`. It does not use seconds. The current maximum lock time is far below the BIP68 block limit of 65,535 blocks, so a fixed 2-byte unsigned big-endian integer is simple and clear. DER encoding is only needed when turning the raw ECDSA signatures back into Bitcoin witness signatures; the CSV value is just read as a number and passed back into the script builder.

The magic prefix means the literal bytes `REW`. The encrypted plaintext starts with `ONCHAIN_BACKUP_ENTRY_VERSION = 0` (`onchainFormat.ts`). That binary version byte is different from the ASCII character `"0"`, which is byte `0x30`.

The deterministic encryption nonce is `ONCHAIN_BACKUP_NONCE_BYTES = 24` (`onchainFormat.ts`). The current format encodes the vault index in the final 4 bytes, big-endian, and leaves the rest zero. This is safe only because each vault uses a distinct derived encryption key path and each vault has one on-chain backup plaintext.

On backup creation, the app recreates the trigger and rescue transactions from the serialized entry and requires exact tx-hex equality with the original presigned transactions before accepting the backup data. On restore, the app recreates the transactions again and verifies the stored signatures against the reconstructed transactions before accepting the restored vault.

The emergency output is type-specific. The backup stores a one-byte type ID and the minimal output data needed to rebuild the scriptPubKey: a 20-byte hash for `P2WPKH`, `P2PKH` and `P2SH`, or 32 bytes for `P2TR` and `P2WSH`. Restore rebuilds the exact emergency script from those fields before verifying the rescue signature.

## Taproot Note

The transaction itself is not Taproot or non-Taproot. Each input depends on the output it spends.

One useful hybrid variant is:

- The vault output is simple key-path P2TR.
- The trigger transaction input spends that P2TR vault output.
- The trigger transaction output remains the current P2WSH miniscript output.
- The rescue transaction input remains P2WSH because it spends the P2WSH trigger output.

In that hybrid, the ephemeral public key probably does not need to be encoded in the backup payload. The vault transaction already publishes the 32-byte x-only Taproot output key. Restore can read that x-only key from the vault tx and use it to reconstruct the expected key material.

This can reduce the backup payload by about 33 bytes:

```text
1 byte       format/version
1 byte       emergency output type
2 bytes      CSV timelock, uint16 block count, big-endian
20 bytes    emergency output data, if using a 20-byte emergency type
64 bytes    trigger ECDSA signature, raw r || s
64 bytes    rescue ECDSA signature, raw r || s
```

That is `152 bytes` before any optional magic prefix for 20-byte emergency output data, or `164 bytes` for 32-byte emergency output data.

That only holds if the Taproot output key is the key the restore logic needs, or if any tweak is fixed and deterministic. If the design uses Taproot script paths, control blocks, or non-trivial tweaks, the backup format must store or deterministically derive the extra Taproot data needed for reconstruction.
