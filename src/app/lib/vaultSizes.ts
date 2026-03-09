//@ts-expect-error: Could not find a declaration file for module 'pushdata-bitcoin'
import { encodingLength as pushdataEncodingLength } from 'pushdata-bitcoin';
import { encodingLength } from 'varuint-bitcoin';

const uniqueSorted = (values: number[]) =>
  values
    .filter((value, index, array) => array.indexOf(value) === index)
    .sort((a, b) => a - b);

const opReturnScriptBytes = (payloadBytes: number) =>
  1 + pushdataEncodingLength(payloadBytes) + payloadBytes;

//////////////////////
// Trigger (134–135 vB):
// 1 P2WPKH input, 2 outputs (P2A + P2WSH).
// - Stripped size: 107 bytes
//   - Version (4) + vin (1) + input (41) + vout (1) + outputs (56) + locktime (4)
//   - Outputs = P2A (13) + P2WSH (43)
// - Witness size: 108–111 bytes
//   - Marker/flag 2
//   - Stack items: sig (70–73 bytes) + 1 len + pubkey (33 bytes) + 1 len + count (1)
// - Weight: 536–539 wu → vsize = 134–135 vB
//////////////////////
export const TRIGGER_TX_VBYTES = [134, 135];
const TRIGGER_TX_SERIALIZED_BYTES = [215, 216, 217, 218];

//////////////////////
// Panic (139–140 vB):
// 1 P2WSH input, 2 outputs (P2A + addr).
// - Stripped size: 95 bytes
//  - Version (4) + vin (1) + input (41) + vout (1) + outputs (44) + locktime (4)
//  - Outputs = P2A (13) + P2WPKH (31)
// - Witness size: 176–179 bytes
//  - Marker/flag 2
//  - Stack items: sig (70–73 bytes) + 1 len + pubkey (33 bytes) + 1 len + selector (1 byte) + 1 len + witnessScript (65 bytes) + 1 len + count (1)
// - Weight: 556–559 wu → vsize = 139–140 vB
//////////////////////
export const PANIC_TX_VBYTES = [139, 140];
const PANIC_TX_SERIALIZED_BYTES = [271, 272, 273, 274];

const VAULT_ENTRY_BYTES = uniqueSorted(
  TRIGGER_TX_SERIALIZED_BYTES.flatMap(triggerBytes =>
    PANIC_TX_SERIALIZED_BYTES.map(
      panicBytes =>
        1 + //The version: [Version][TriggerLen][Trigger][PanicLen][Panic]
        encodingLength(triggerBytes) +
        triggerBytes +
        encodingLength(panicBytes) +
        panicBytes
    )
  )
);
// "REW" = 3-byte, plus XChaCha20-Poly1305 nonce (24) and tag (16).
const ENCRYPTION_OVERHEAD_BYTES = 24 + 16;
const VAULT_CONTENT_BYTES = VAULT_ENTRY_BYTES.map(
  bytes => bytes + 3 + ENCRYPTION_OVERHEAD_BYTES
);
const P2WPKH_WITNESS_BYTES = [108, 109, 110, 111];

const OP_RETURN_SCRIPT_BYTES = VAULT_CONTENT_BYTES.map(opReturnScriptBytes);
// output value (sats) = fixed 8-byte value.
const OP_RETURN_OUTPUT_BYTES = OP_RETURN_SCRIPT_BYTES.map(
  scriptBytes => scriptBytes + 8 + encodingLength(scriptBytes)
);

//The +51 is the fixed stripped (non‑witness) overhead for a 1‑input,
//1‑output transaction excluding the output itself:
//- 4 bytes version
//- 1 byte input count
//- 41 bytes input (prevout 36 + scriptLen 1 + sequence 4)
//- 1 byte output count
//- 4 bytes locktime
const OP_RETURN_BACKUP_TX_STRIPPED_BYTES = OP_RETURN_OUTPUT_BYTES.map(
  bytes => bytes + 51
);
export const OP_RETURN_BACKUP_TX_VBYTES = uniqueSorted(
  OP_RETURN_BACKUP_TX_STRIPPED_BYTES.flatMap(strippedBytes =>
    P2WPKH_WITNESS_BYTES.map(witnessBytes =>
      Math.ceil((strippedBytes * 4 + witnessBytes) / 4)
    )
  )
);
