//@ts-expect-error: Could not find a declaration file for module 'pushdata-bitcoin'
import { encodingLength as pushdataEncodingLength } from 'pushdata-bitcoin';
import { encodingLength } from 'varuint-bitcoin';
import { ONCHAIN_BACKUP_PAYLOAD_BYTE_OPTIONS } from './backup/onchainFormat';
import {
  EMERGENCY_OUTPUT_TYPES,
  type EmergencyOutputType
} from './emergencyOutputs';
import { P2A_OUTPUT_SCRIPT } from './p2aPolicy';

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

const outputBytes = (scriptBytes: number) =>
  8 + encodingLength(scriptBytes) + scriptBytes;

const ONE_INPUT_TX_BASE_STRIPPED_BYTES = 51;

const EMERGENCY_OUTPUT_SCRIPT_BYTES: Record<EmergencyOutputType, number> = {
  P2WPKH: 22,
  P2PKH: 25,
  P2SH: 23,
  P2TR: 34,
  P2WSH: 34
};
const P2A_OUTPUT_BYTES = outputBytes(P2A_OUTPUT_SCRIPT.length);
const EMERGENCY_OUTPUT_BYTES = uniqueSorted(
  EMERGENCY_OUTPUT_TYPES.map(type =>
    outputBytes(EMERGENCY_OUTPUT_SCRIPT_BYTES[type])
  )
);
const RESCUE_WITNESS_BYTES = [176, 177, 178, 179];

//////////////////////
// Rescue (139–152 vB):
// 1 P2WSH input, 2 outputs (emergency address + P2A).
// Emergency outputs can be P2WPKH, P2PKH, P2SH, P2TR or P2WSH. Parent fee
// policy uses the worst case so on-chain backup restore and vault creation agree.
//////////////////////
export const RESCUE_TX_VBYTES = uniqueSorted(
  EMERGENCY_OUTPUT_BYTES.flatMap(emergencyOutputBytes =>
    RESCUE_WITNESS_BYTES.map(witnessBytes => {
      const strippedBytes =
        ONE_INPUT_TX_BASE_STRIPPED_BYTES +
        P2A_OUTPUT_BYTES +
        emergencyOutputBytes;
      return Math.ceil((strippedBytes * 4 + witnessBytes) / 4);
    })
  )
);
const BACKUP_P2WPKH_WITNESS_BYTES = [108, 109, 110, 111];

const OP_RETURN_SCRIPT_BYTES =
  ONCHAIN_BACKUP_PAYLOAD_BYTE_OPTIONS.map(opReturnScriptBytes);
// output value (sats) = fixed 8-byte value.
const OP_RETURN_OUTPUT_BYTES = OP_RETURN_SCRIPT_BYTES.map(outputBytes);

// Fixed stripped (non-witness) overhead for a 1-input, 1-output transaction
// excluding the output itself:
//- 4 bytes version
//- 1 byte input count
//- 41 bytes input (prevout 36 + scriptLen 1 + sequence 4)
//- 1 byte output count
//- 4 bytes locktime
const OP_RETURN_BACKUP_TX_STRIPPED_BYTES = OP_RETURN_OUTPUT_BYTES.map(
  bytes => bytes + ONE_INPUT_TX_BASE_STRIPPED_BYTES
);
export const OP_RETURN_BACKUP_TX_VBYTES = uniqueSorted(
  OP_RETURN_BACKUP_TX_STRIPPED_BYTES.flatMap(strippedBytes =>
    BACKUP_P2WPKH_WITNESS_BYTES.map(witnessBytes =>
      Math.ceil((strippedBytes * 4 + witnessBytes) / 4)
    )
  )
);
