// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal, Button, ActivityIndicator } from '../../common/ui';
import { useTranslation } from 'react-i18next';
import { View, Text } from 'react-native';
import FeeInput from './FeeInput';
import {
  computeMaxAllowedFeeRate,
  FeeEstimates,
  MIN_FEE_RATE,
  pickFeeEstimate
} from '../lib/fees';
import { useSettings } from '../hooks/useSettings';
import {
  type Vault,
  type VaultStatus,
  estimateCpfpPackage,
  getVaultMode,
  type HistoryData
} from '../lib/vaults';
import { transactionFromHex } from '../lib/bitcoin';
import { useWallet } from '../hooks/useWallet';
import useFirstDefinedValue from '~/common/hooks/useFirstDefinedValue';
import { toNumber } from '../lib/sats';
import {
  type AccelerationInfo,
  findNextEqualOrLargerFeeRate,
  getCpfpReplacementFeeRateFloor,
  pickActionableInitialFeeRate,
  type PreparedCpfpPlan,
  type VaultActionTxData
} from '../lib/vaultActionTx';

const getP2ARescueInfo = (vault: Vault, triggerTxHex: string | undefined) => {
  if (!triggerTxHex) throw new Error('P2A vault is missing trigger tx');
  const txHex = vault.triggerMap[triggerTxHex]?.[0];
  if (!txHex) throw new Error('P2A trigger tx is missing rescue tx');
  const rescueTxData = vault.txMap[txHex];
  if (!rescueTxData) throw new Error('P2A rescue tx is not mapped');
  return { txHex, fee: rescueTxData.fee, feeRate: rescueTxData.feeRate };
};

const getLadderedRescueSortedTxs = (vault: Vault, triggerTxHex: string) => {
  const rescueTxs = vault.triggerMap[triggerTxHex];
  if (!rescueTxs)
    throw new Error("Triggered vault doesn't have matching rescue txs");
  return rescueTxs
    .map(txHex => {
      const txData = vault.txMap[txHex];
      if (!txData) throw new Error('rescue tx not mapped');
      return { txHex, fee: txData.fee, feeRate: txData.feeRate };
    })
    .sort((a, b) => a.feeRate - b.feeRate);
};

/**
 * Returns the current acceleration state for the rescue tx.
 *
 * The returned fields mean:
 * - `isUnconfirmed`: the rescue tx is already broadcast and still unconfirmed
 * - `replacementFeeRateFloor`: the minimum package fee rate that improves the
 *   currently live state
 * - `canAccelerate`: a valid rescue acceleration path can be built right now
 * - `hasFundingUtxos`: the non-anchor funding UTXOs for the rescue fee-bump
 *   child are available
 */
export const getRescueAccelerationInfo = ({
  vault,
  vaultStatus,
  feeEstimates,
  historyData,
  emergencyBumpPlan
}: {
  vault: Vault;
  vaultStatus: VaultStatus | undefined;
  feeEstimates: FeeEstimates | undefined;
  historyData: HistoryData | undefined;
  /**
   * Optional external CPFP funding plan for P2A-vault-type rescue.
   *
   * This is a small emergency wallet plan prepared outside the
   * main wallet after an attack. It provides fresh UTXOs and a signer that are
   * not meant to be under the compromised wallet's normal flow.
   *
    * When present, rescue can attach a child tx that spends those fresh UTXOs to
    * add more fee and sends leftover value to the provided output, which should
    * normally be the emergency address. When absent, P2A rescue stays parent-only.
    */
  emergencyBumpPlan: PreparedCpfpPlan | undefined;
}): AccelerationInfo => {
  const isRescueConfirmed =
    vaultStatus?.panicTxBlockHeight !== undefined &&
    vaultStatus.panicTxBlockHeight > 0;
  const isUnconfirmed =
    (!!vaultStatus?.panicPushTime || vaultStatus?.panicTxBlockHeight === 0) &&
    !isRescueConfirmed;
  if (!isUnconfirmed) {
    return {
      isUnconfirmed,
      replacementFeeRateFloor: null,
      canAccelerate: false,
      hasFundingUtxos: false
    };
  } else {
    if (!vaultStatus?.triggerTxHex || !vaultStatus.panicTxHex) {
      throw new Error('trigger or panic txs not set');
    } else if (!feeEstimates) {
      return {
        isUnconfirmed,
        replacementFeeRateFloor: null,
        canAccelerate: false,
        hasFundingUtxos:
          getVaultMode(vault) === 'LADDERED' || emergencyBumpPlan !== undefined
      };
    } else {
      const maxFeeRate = computeMaxAllowedFeeRate(feeEstimates);

      if (getVaultMode(vault) === 'LADDERED') {
        const { tx: triggerTx } = transactionFromHex(vaultStatus.triggerTxHex);
        const { tx: panicTx } = transactionFromHex(vaultStatus.panicTxHex);
        const triggerOutValue = triggerTx.outs[0]?.value;
        if (!triggerTx || triggerTx.outs.length !== 1 || !triggerOutValue)
          throw new Error('Invalid triggerTxHex');

        const panicOutValue = panicTx.outs[0]?.value;
        if (!panicTx || panicTx.outs.length !== 1 || !panicOutValue)
          throw new Error('Invalid panicTxHex');

        const replacementFeeRateFloor =
          (toNumber(triggerOutValue) - toNumber(panicOutValue)) /
            panicTx.virtualSize() +
          1;
        if (replacementFeeRateFloor > maxFeeRate) {
          return {
            isUnconfirmed,
            replacementFeeRateFloor,
            canAccelerate: false,
            hasFundingUtxos: true
          };
        } else {
          return {
            isUnconfirmed,
            replacementFeeRateFloor,
            canAccelerate:
              findNextEqualOrLargerFeeRate(
                getLadderedRescueSortedTxs(vault, vaultStatus.triggerTxHex),
                replacementFeeRateFloor
              ) !== null,
            hasFundingUtxos: true
          };
        }
      } else {
        if (!emergencyBumpPlan) {
          return {
            isUnconfirmed,
            replacementFeeRateFloor: null,
            canAccelerate: false,
            hasFundingUtxos: false
          };
        } else {
          const rescueInfo = getP2ARescueInfo(vault, vaultStatus.triggerTxHex);
          const replacementFeeRateFloor = getCpfpReplacementFeeRateFloor({
            parentTxHex: rescueInfo.txHex,
            parentFee: rescueInfo.fee,
            feeEstimates,
            utxosData: emergencyBumpPlan.utxosData,
            childOutput: emergencyBumpPlan.changeOutput,
            ...(historyData ? { historyData } : {}),
            ...(vaultStatus.panicCpfpTxHex
              ? { childTxHex: vaultStatus.panicCpfpTxHex }
              : {})
          });

          if (replacementFeeRateFloor === null) {
            return {
              isUnconfirmed,
              replacementFeeRateFloor: null,
              canAccelerate: false,
              hasFundingUtxos: true
            };
          } else {
            return {
              isUnconfirmed,
              replacementFeeRateFloor,
              canAccelerate: replacementFeeRateFloor <= maxFeeRate,
              hasFundingUtxos: true
            };
          }
        }
      }
    }
  }
};

type RescueProps = {
  vault: Vault;
  vaultStatus: VaultStatus | undefined;
  onRescue: (
    rescueData: VaultActionTxData,
    emergencyBumpPlan?: PreparedCpfpPlan
  ) => void;
  isVisible: boolean;
  /**
   * Optional external CPFP funding plan for P2A-vault-type rescue.
   *
   * This is a small emergency wallet plan prepared outside the
   * main wallet after an attack. It provides fresh UTXOs and a signer that are
   * not meant to be under the compromised wallet's normal flow.
   *
   * When present, rescue can attach a child tx that spends those fresh UTXOs to
   * add more fee and sends leftover value to the provided output, which should
   * normally be the emergency address. When absent, P2A rescue stays parent-only.
   */
  emergencyBumpPlan?: PreparedCpfpPlan;
  onClose: () => void;
};

const Rescue = ({
  vault,
  vaultStatus,
  isVisible,
  emergencyBumpPlan,
  onRescue,
  onClose
}: RescueProps) => {
  const vaultMode = useMemo(() => getVaultMode(vault), [vault]);
  const isLadderedVault = vaultMode === 'LADDERED';
  const { t } = useTranslation();
  const {
    feeEstimates: feeEstimatesRealTime,
    btcFiat: btcFiatRealTime,
    historyData
  } = useWallet();
  // Cache to avoid flickering in the sliders while background refreshes happen.
  const btcFiat = useFirstDefinedValue<number>(btcFiatRealTime);
  const feeEstimates = useFirstDefinedValue<FeeEstimates>(feeEstimatesRealTime);
  const {
    isUnconfirmed,
    replacementFeeRateFloor,
    canAccelerate,
    hasFundingUtxos
  } = useMemo(
      () =>
        getRescueAccelerationInfo({
          vault,
          vaultStatus,
          feeEstimates,
          historyData,
          emergencyBumpPlan
        }),
      [vault, vaultStatus, feeEstimates, historyData, emergencyBumpPlan]
    );
  const triggerTxHex = vaultStatus?.triggerTxHex;

  const ladderedRescueSortedTxs = useMemo(() => {
    // This modal stays mounted so Modal can animate across isVisible changes.
    // While hidden, return inert render-time values instead of rescue data.
    if (!isVisible) {
      return [];
    } else if (isLadderedVault) {
      if (!triggerTxHex)
        throw new Error('Visible rescue is missing trigger tx');
      return getLadderedRescueSortedTxs(vault, triggerTxHex);
    } else {
      return [];
    }
  }, [vault, triggerTxHex, isLadderedVault, isVisible]);

  const maxFeeRate = feeEstimates
    ? computeMaxAllowedFeeRate(feeEstimates)
    : null;
  const { settings } = useSettings();
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );

  const [step, setStep] = useState<'intro' | 'fee'>('intro');

  const preferredInitialFeeRate = useMemo(() => {
    // This modal stays mounted so Modal can animate across isVisible changes.
    // While hidden, return inert render-time values instead of rescue data.
    if (!isVisible) {
      return null;
    } else if (isLadderedVault) {
      if (!feeEstimates) return null;
      const preferredNetworkFeeRate = pickFeeEstimate(
        feeEstimates,
        settings.INITIAL_CONFIRMATION_TIME
      ).feeEstimate;
      if (!isUnconfirmed) return preferredNetworkFeeRate;
      else {
        if (replacementFeeRateFloor === null) return null;
        else return Math.max(replacementFeeRateFloor, preferredNetworkFeeRate);
      }
    } else {
      if (!triggerTxHex)
        throw new Error('Visible rescue is missing trigger tx');
      const rescueInfo = getP2ARescueInfo(vault, triggerTxHex);

      if (!hasFundingUtxos) return isUnconfirmed ? null : rescueInfo.feeRate;

      if (!feeEstimates) return null;
      const preferredNetworkFeeRate = pickFeeEstimate(
        feeEstimates,
        settings.INITIAL_CONFIRMATION_TIME
      ).feeEstimate;

      if (!isUnconfirmed)
        return Math.max(rescueInfo.feeRate, preferredNetworkFeeRate);
      if (replacementFeeRateFloor === null) return null;
      return Math.max(replacementFeeRateFloor, preferredNetworkFeeRate);
    }
  }, [
    feeEstimates,
    settings.INITIAL_CONFIRMATION_TIME,
    isLadderedVault,
    vault,
    isVisible,
    triggerTxHex,
    hasFundingUtxos,
    isUnconfirmed,
    replacementFeeRateFloor
  ]);

  const showsFeePicker = isLadderedVault || hasFundingUtxos;
  const needsFeeEstimates = showsFeePicker;

  const [feeRate, setFeeRate] = useState<number | null>(null);

  const minimumSelectableFeeRate = useMemo(() => {
    // This modal stays mounted so Modal can animate across isVisible changes.
    // While hidden, return inert render-time values instead of rescue data.
    if (!isVisible) {
      return null;
    } else if (isLadderedVault) {
      return isUnconfirmed
        ? replacementFeeRateFloor
        : (ladderedRescueSortedTxs[0]?.feeRate ?? MIN_FEE_RATE);
    } else {
      if (!triggerTxHex)
        throw new Error('Visible rescue is missing trigger tx');
      if (!hasFundingUtxos) {
        return null;
      } else {
        const rescueInfo = getP2ARescueInfo(vault, triggerTxHex);
        if (!isUnconfirmed) {
          return rescueInfo.feeRate;
        } else {
          return replacementFeeRateFloor;
        }
      }
    }
  }, [
    isLadderedVault,
    isUnconfirmed,
    replacementFeeRateFloor,
    isVisible,
    ladderedRescueSortedTxs,
    hasFundingUtxos,
    vault,
    triggerTxHex
  ]);

  const buildTxDataForFeeRate = useCallback(
    (selectedFeeRate: number): VaultActionTxData | null => {
      // This modal stays mounted so Modal can animate across isVisible changes.
      // While hidden, return inert render-time values instead of rescue data.
      if (!isVisible) {
        return null;
      } else if (isLadderedVault) {
        const rescueInfo = findNextEqualOrLargerFeeRate(
          ladderedRescueSortedTxs,
          selectedFeeRate
        );
        if (!rescueInfo) return null;
        return {
          parentTxHex: rescueInfo.txHex,
          parentTxFee: rescueInfo.fee,
          actionFee: rescueInfo.fee,
          actionFeeRate: rescueInfo.feeRate
        };
      } else {
        if (!triggerTxHex)
          throw new Error('Visible rescue is missing trigger tx');
        const rescueInfo = getP2ARescueInfo(vault, triggerTxHex);
        // Rescue is parent-only by default. Only switch to a package when an
        // explicit external emergency bump plan exists.
        if (selectedFeeRate <= rescueInfo.feeRate)
          return {
            parentTxHex: rescueInfo.txHex,
            parentTxFee: rescueInfo.fee,
            actionFee: rescueInfo.fee,
            actionFeeRate: rescueInfo.feeRate
          };
        else if (!emergencyBumpPlan) return null;
        else {
          const plan = estimateCpfpPackage({
            parentTxHex: rescueInfo.txHex,
            parentFee: rescueInfo.fee,
            targetPackageFeeRate: selectedFeeRate,
            utxosData: emergencyBumpPlan.utxosData,
            changeOutput: emergencyBumpPlan.changeOutput
          });
          if (!plan) return null;
          else
            return {
              parentTxHex: rescueInfo.txHex,
              parentTxFee: rescueInfo.fee,
              actionFee: plan.packageFee,
              actionFeeRate: plan.packageFeeRate
            };
        }
      }
    },
    [
      isVisible,
      isLadderedVault,
      ladderedRescueSortedTxs,
      vault,
      triggerTxHex,
      emergencyBumpPlan
    ]
  );

  const initialFeeRate = useMemo(
    () =>
      // If the wallet's preferred confirmation target is no longer fundable,
      // fall back to the minimum actionable replacement floor instead of
      // opening an acceleration modal that cannot proceed past the intro step.
      pickActionableInitialFeeRate({
        preferredFeeRate:
          isUnconfirmed &&
          replacementFeeRateFloor !== null &&
          maxFeeRate !== null &&
          replacementFeeRateFloor > maxFeeRate
            ? null
            : preferredInitialFeeRate,
        minimumActionableFeeRate:
          isUnconfirmed &&
          replacementFeeRateFloor !== null &&
          maxFeeRate !== null &&
          replacementFeeRateFloor > maxFeeRate
            ? null
            : minimumSelectableFeeRate,
        canBuildAtFeeRate: feeRate => buildTxDataForFeeRate(feeRate) !== null
      }),
    [
      preferredInitialFeeRate,
      isUnconfirmed,
      replacementFeeRateFloor,
      maxFeeRate,
      minimumSelectableFeeRate,
      buildTxDataForFeeRate
    ]
  );

  const txData = useMemo<VaultActionTxData | null>(() => {
    const selectedFeeRate = feeRate ?? initialFeeRate;
    if (selectedFeeRate === null) return null;
    return buildTxDataForFeeRate(selectedFeeRate);
  }, [feeRate, initialFeeRate, buildTxDataForFeeRate]);

  const canOpenFeeStep = isUnconfirmed
    ? canAccelerate
    : initialFeeRate !== null;

  const fee = txData ? txData.actionFee : null;

  // This modal stays mounted so Modal can animate across isVisible changes.
  // Reset the local wizard step when it closes so reopening starts clean.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!isVisible) setStep('intro');
  }, [isVisible]);

  // Reset feeRate every time the selected initial fee changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFeeRate(prev =>
      initialFeeRate !== null && prev !== initialFeeRate ? initialFeeRate : prev
    );
  }, [initialFeeRate]);

  const handleRescue = useCallback(() => {
    if (!txData) throw new Error('Cannot rescue non-existing selected tx');
    onRescue(
      txData,
      txData.actionFee > txData.parentTxFee ? emergencyBumpPlan : undefined
    );
  }, [onRescue, txData, emergencyBumpPlan]);

  return (
    <Modal
      headerMini={true}
      isVisible={isVisible}
      title={t('wallet.vault.rescueButton')}
      icon={{
        family: 'MaterialCommunityIcons',
        name: 'alarm-light'
      }}
      onClose={onClose}
      {...{
        customButtons:
          step === 'intro' ? (
            <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
              <Button mode="secondary" onPress={onClose}>
                {t('cancelButton')}
              </Button>
              {canOpenFeeStep && (
                <Button mode="primary-alert" onPress={() => setStep('fee')}>
                  {isUnconfirmed
                    ? t('accelerateButton')
                    : t('imInDangerButton')}
                </Button>
              )}
            </View>
          ) : step === 'fee' ? (
            <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
              <Button mode="secondary" onPress={onClose}>
                {t('cancelButton')}
              </Button>
              <Button
                mode="primary-alert"
                onPress={handleRescue}
                disabled={!txData}
              >
                {t('wallet.vault.rescueButton')}
              </Button>
            </View>
          ) : undefined
      }}
    >
      {needsFeeEstimates && !feeEstimates ? (
        //loading...
        <ActivityIndicator />
      ) : isUnconfirmed &&
        replacementFeeRateFloor !== null &&
        maxFeeRate !== null &&
        replacementFeeRateFloor > maxFeeRate ? (
        //cannot RBF
        <View>
          <Text className="text-base text-slate-600 pb-2 px-2">
            {t('wallet.vault.cannotAccelerateMaxFee')}
          </Text>
        </View>
      ) : step === 'intro' ? (
        <View>
          <Text className="text-base text-slate-600 pb-2 px-2">
            {isUnconfirmed
              ? t('wallet.vault.rescue.introAccelerate')
              : t('wallet.vault.rescue.intro', {
                  panicAddress: vault.coldAddress
                })}
          </Text>
        </View>
      ) : step === 'fee' ? (
        <View>
          {showsFeePicker ? (
            <>
              <Text className="text-base text-slate-600 pb-4 px-2">
                {t('wallet.vault.rescue.feeSelectorExplanation')}
              </Text>
              <View className="bg-slate-100 p-2 rounded-xl">
                <FeeInput
                  {...(minimumSelectableFeeRate !== null
                    ? { min: minimumSelectableFeeRate }
                    : {})}
                  btcFiat={btcFiat}
                  feeEstimates={feeEstimates!}
                  initialValue={initialFeeRate!}
                  fee={fee}
                  label={t('wallet.vault.rescue.confirmationSpeedLabel')}
                  onValueChange={setFeeRate}
                />
              </View>
            </>
          ) : (
            <Text className="text-base text-slate-600 pb-4 px-2">
              {t('wallet.vault.rescue.highFeeConfirmation')}
            </Text>
          )}
          <Text className="text-base text-slate-600 pt-4 px-2">
            {t('wallet.vault.rescue.additionalExplanation', {
              timeLockTime: 0
            })}
          </Text>
        </View>
      ) : null}
    </Modal>
  );
};

export default Rescue;
