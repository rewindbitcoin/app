# Minimal On-Chain Backup Size

This note describes a compact backup idea. It is not the current implementation.

The current implementation stores the full presigned trigger and rescue transactions in the backup payload. A smaller format could store only the data needed to recreate those transactions exactly.

## Minimum Payload

Assuming deterministic transaction templates and fixed fee rules, the backup payload only needs:

- A backup format/version byte.
- The CSV timelock as a fixed 2-byte unsigned block count.
- The ephemeral compressed public key, 33 bytes.
- The emergency P2WPKH public key hash, 20 bytes.
- The trigger transaction ECDSA signature as raw `r || s`, 64 bytes.
- The rescue transaction ECDSA signature as raw `r || s`, 64 bytes.

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
- Emergency outputs are always P2WPKH.
- Restore code uses the backup format constants, not current app settings that might change later.

Without an authentication tag, ciphertext tampering is not detected by the cipher itself. The restored data must be accepted only after recreating the transactions and verifying that the signatures, scripts, outputs, and spending chain are valid.

## Deterministic Values

The output values do not need to be stored if they are deterministic.

The restore code can derive them from:

- The vault transaction output value.
- The vault mode.
- Fixed P2A anchor values.
- Fixed trigger and rescue fee rules.
- The fixed transaction virtual sizes for the format version.

For TRUC, these values can be constant. For non-TRUC, the format can define that the minimum relay fee rate is always used. The important part is that these rules are part of the backup format and do not depend on runtime settings.

## Approximate Size

For a P2WPKH emergency output:

```text
1 byte       format/version
2 bytes      CSV timelock, uint16 block count
33 bytes    ephemeral compressed public key
20 bytes    emergency P2WPKH public key hash
64 bytes    trigger ECDSA signature, raw r || s
64 bytes    rescue ECDSA signature, raw r || s
```

That is `184 bytes` before any optional magic prefix.

With no auth tag and a deterministic nonce, encryption adds no payload bytes. If a `REW` magic prefix is still kept, add 3 bytes.

The current code uses block-based BIP68 CSV with `olderEncode({ blocks: lockBlocks })`. It does not use seconds. The current maximum lock time is far below the BIP68 block limit of 65,535 blocks, so a fixed 2-byte unsigned integer is simple and clear. DER encoding is only needed when turning the raw ECDSA signatures back into Bitcoin witness signatures; the CSV value is just read as a number and passed back into the script builder.

The magic prefix means the literal bytes `REW`. A compact binary header could be `REW` followed by one binary version byte, for example `0x00` for the first compact format. That is different from the ASCII character `"0"`, which is byte `0x30`. Either can work if the format defines it, but a binary version byte is cleaner.

The emergency output is not variable in this format. Since it is always P2WPKH, the backup only stores the 20-byte public key hash. Restore rebuilds the scriptPubKey as `OP_0 <20-byte-hash>`. The full P2WPKH scriptPubKey is 22 bytes on-chain, but only the 20-byte hash needs to be in the backup payload when the type is implied by the format version.

## Taproot Note

The transaction itself is not Taproot or non-Taproot. Each input depends on the output it spends.

One useful hybrid variant is:

- The vault output is simple key-path P2TR.
- The trigger transaction input spends that P2TR vault output.
- The trigger transaction output remains the current P2WSH miniscript output.
- The rescue transaction input remains P2WSH because it spends the P2WSH trigger output.

In that hybrid, the ephemeral public key probably does not need to be encoded in the backup payload. The vault transaction already publishes the 32-byte x-only Taproot output key. Restore can read that x-only key from the vault tx and use it to reconstruct the expected key material.

This can reduce the compact payload by about 33 bytes:

```text
1 byte       format/version
2 bytes      CSV timelock, uint16 block count
20 bytes    emergency P2WPKH public key hash
64 bytes    trigger ECDSA signature, raw r || s
64 bytes    rescue ECDSA signature, raw r || s
```

That is `151 bytes` before any optional magic prefix.

That only holds if the Taproot output key is the key the restore logic needs, or if any tweak is fixed and deterministic. If the design uses Taproot script paths, control blocks, or non-trivial tweaks, the backup format must store or deterministically derive the extra Taproot data needed for reconstruction.
