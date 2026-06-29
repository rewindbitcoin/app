// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { MIN_FEE_RATE } from './fees';
import { RESCUE_TX_VBYTES, TRIGGER_TX_VBYTES } from './vaultSizes';

// On-chain backup restore depends on these policy values. If they ever
// change, preserve the old restore branch and bump the backup entry version.
// TRUC trigger parents must be zero-fee because they use a 0-sat P2A anchor.
export const P2A_TRUC_PRESIGNED_TRIGGER_FEERATE = 0;
// NON_TRUC trigger parents use a funded P2A anchor and can pay relay fee directly.
export const P2A_NON_TRUC_PRESIGNED_TRIGGER_FEERATE = MIN_FEE_RATE;
// Rescue parents pay a high direct fee, so their P2A anchor is always non-dust.
export const PRESIGNED_RESCUE_FEERATE = 100;
// Trigger reserve sizing targets this emergency package feerate ceiling.
export const MAX_TRIGGER_FEERATE = 100;

const getPresignedParentFee = (vbytes: number[], feeRate: number) =>
  BigInt(Math.ceil(Math.max(...vbytes) * feeRate));

export const getPresignedTriggerFeeRate = (
  vaultMode: 'P2A_TRUC' | 'P2A_NON_TRUC'
) =>
  vaultMode === 'P2A_TRUC'
    ? P2A_TRUC_PRESIGNED_TRIGGER_FEERATE
    : P2A_NON_TRUC_PRESIGNED_TRIGGER_FEERATE;

export const getPresignedTriggerParentFee = (presignedTriggerFeeRate: number) =>
  getPresignedParentFee(TRIGGER_TX_VBYTES, presignedTriggerFeeRate);

export const getPresignedRescueParentFee = (presignedRescueFeeRate: number) =>
  getPresignedParentFee(RESCUE_TX_VBYTES, presignedRescueFeeRate);
