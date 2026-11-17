// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

export type VaultActionFunding = {
  notice: 'insufficient' | 'belowRecommended' | 'manualSelection' | null;
  action: 'wallet' | 'receive' | 'coins' | 'reserve' | 'wait' | null;
  targetFeeRate: number | null;
};

/** One decision supplies both the explanation and its corresponding action.
 * A recommended-fee shortfall is advisory; it never disables a buildable choice.
 */
export const getVaultActionFunding = ({
  role,
  selectedFeeRate,
  recommendedFeeRate,
  canBuildSelected,
  canBuildRecommended,
  canBuildRecommendedWithAutomaticCoins,
  manualSelectionNeedsRecovery,
  hasUsableWalletFunds,
  canBuildSelectedAfterConfirmation,
  walletSupplementRequested
}: {
  role: 'TRIGGER' | 'RESCUE';
  selectedFeeRate: number | null;
  recommendedFeeRate: number | null;
  canBuildSelected: boolean;
  canBuildRecommended: boolean;
  canBuildRecommendedWithAutomaticCoins: boolean;
  manualSelectionNeedsRecovery: boolean;
  hasUsableWalletFunds: boolean;
  canBuildSelectedAfterConfirmation: boolean;
  walletSupplementRequested: boolean;
}): VaultActionFunding => {
  const none: VaultActionFunding = {
    notice: null,
    action: null,
    targetFeeRate: null
  };
  if (selectedFeeRate === null) return none;
  if (manualSelectionNeedsRecovery)
    return {
      notice: 'manualSelection',
      action: 'coins',
      targetFeeRate: selectedFeeRate
    };

  const belowRecommended =
    canBuildSelected &&
    recommendedFeeRate !== null &&
    selectedFeeRate < recommendedFeeRate &&
    !canBuildRecommended;
  if (canBuildSelected && !belowRecommended) return none;
  // A fundable trigger fee does not need wallet permission or another deposit.
  // Keep the higher recommendation advisory; manual coins can still be reviewed.
  if (
    belowRecommended &&
    role === 'TRIGGER' &&
    !canBuildRecommendedWithAutomaticCoins
  )
    return { ...none, notice: 'belowRecommended' };

  return {
    notice: belowRecommended ? 'belowRecommended' : 'insufficient',
    targetFeeRate: belowRecommended ? recommendedFeeRate : selectedFeeRate,
    action:
      role === 'TRIGGER' &&
      belowRecommended &&
      canBuildRecommendedWithAutomaticCoins
        ? 'coins'
        : role === 'RESCUE'
          ? 'reserve'
          : hasUsableWalletFunds && !walletSupplementRequested
            ? 'wallet'
            : canBuildSelectedAfterConfirmation
              ? 'wait'
              : 'receive'
  };
};
