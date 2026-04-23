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
import { formatBlocks } from '../lib/format';
import { useSettings } from '../hooks/useSettings';
import {
  type Vault,
  type VaultStatus,
  estimateCpfpPackage,
  getTriggerReserveUtxosData,
  getVaultMode,
  type HistoryData
} from '../lib/vaults';
import { transactionFromHex } from '../lib/bitcoin';
import { useWallet } from '../hooks/useWallet';
import useFirstDefinedValue from '~/common/hooks/useFirstDefinedValue';
import { useLocalization } from '../hooks/useLocalization';
import { toNumber } from '../lib/sats';
import { DUMMY_CHANGE_OUTPUT, getMainAccount } from '../lib/vaultDescriptors';
import { type NetworkId, networkMapping } from '../lib/network';
import {
  findMinimumActionableFeeRate,
  findNextEqualOrLargerFeeRate,
  getCpfpReplacementFeeRateFloor,
  pickActionableInitialFeeRate,
  type VaultActionTxData
} from '../lib/vaultActionTx';
import { type Accounts, type Signer } from '../lib/wallets';

const getP2ATriggerInfo = (vault: Vault) => {
  const txHex = Object.keys(vault.triggerMap)[0];
  if (!txHex) throw new Error('P2A vault is missing trigger tx');
  const triggerTxData = vault.txMap[txHex];
  if (!triggerTxData) throw new Error('P2A trigger tx is not mapped');
  return { txHex, fee: triggerTxData.fee, feeRate: triggerTxData.feeRate };
};

const getLadderedTriggerSortedTxs = (vault: Vault) =>
  Object.entries(vault.triggerMap)
    .map(([txHex]) => {
      const txData = vault.txMap[txHex];
      if (!txData) throw new Error('trigger tx not mapped');
      return { txHex, fee: txData.fee, feeRate: txData.feeRate };
    })
    .sort((a, b) => a.feeRate - b.feeRate);

export const getTriggerAccelerationInfo = ({
  vault,
  vaultStatus,
  feeEstimates,
  accounts,
  networkId,
  historyData,
  signer
}: {
  vault: Vault;
  vaultStatus: VaultStatus | undefined;
  feeEstimates: FeeEstimates | undefined;
  accounts: Accounts | undefined;
  networkId: NetworkId | undefined;
  historyData: HistoryData | undefined;
  signer: Signer | undefined;
}) => {
  const isTriggerConfirmed =
    vaultStatus?.triggerTxBlockHeight !== undefined &&
    vaultStatus.triggerTxBlockHeight > 0;
  const isAccelerationAttempt =
    (!!vaultStatus?.triggerPushTime ||
      vaultStatus?.triggerTxBlockHeight === 0) &&
    !isTriggerConfirmed;
  if (!isAccelerationAttempt) {
    return {
      isAccelerationAttempt,
      replacementFeeRateFloor: null,
      canAccelerate: false
    };
  } else {
    if (!vaultStatus?.triggerTxHex) {
      throw new Error('trigger is not set');
    } else if (!feeEstimates) {
      return {
        isAccelerationAttempt,
        replacementFeeRateFloor: null,
        canAccelerate: false
      };
    } else if (
      !!vaultStatus.panicTxHex ||
      !!vaultStatus.panicPushTime ||
      vaultStatus.panicTxBlockHeight !== undefined
    ) {
      return {
        isAccelerationAttempt,
        replacementFeeRateFloor: null,
        canAccelerate: false
      };
    } else {
      const maxFeeRate = computeMaxAllowedFeeRate(feeEstimates);

      if (getVaultMode(vault) === 'LADDERED') {
        const { tx } = transactionFromHex(vaultStatus.triggerTxHex);
        const outValue = tx.outs[0]?.value;
        if (!tx || tx.outs.length !== 1 || !outValue)
          throw new Error('Invalid triggerTxHex');

        const replacementFeeRateFloor =
          (vault.vaultedAmount - toNumber(outValue)) / tx.virtualSize() + 1;
        if (replacementFeeRateFloor > maxFeeRate) {
          return {
            isAccelerationAttempt,
            replacementFeeRateFloor,
            canAccelerate: false
          };
        } else {
          return {
            isAccelerationAttempt,
            replacementFeeRateFloor,
            canAccelerate:
              findNextEqualOrLargerFeeRate(
                getLadderedTriggerSortedTxs(vault),
                replacementFeeRateFloor
              ) !== null
          };
        }
      } else {
        if (!accounts || !networkId || !signer) {
          return {
            isAccelerationAttempt,
            replacementFeeRateFloor: null,
            canAccelerate: false
          };
        } else {
          const triggerInfo = getP2ATriggerInfo(vault);
          const network = networkMapping[networkId];
          const triggerReserveUtxosData = getTriggerReserveUtxosData({
            vault,
            signer,
            network
          });
          const replacementFeeRateFloor = getCpfpReplacementFeeRateFloor({
            parentTxHex: triggerInfo.txHex,
            parentFee: triggerInfo.fee,
            feeEstimates,
            utxosData: triggerReserveUtxosData,
            childOutput: DUMMY_CHANGE_OUTPUT(
              getMainAccount(accounts, network),
              network
            ),
            ...(historyData ? { historyData } : {}),
            ...(vaultStatus.triggerCpfpTxHex
              ? { childTxHex: vaultStatus.triggerCpfpTxHex }
              : {})
          });

          if (replacementFeeRateFloor === null) {
            return {
              isAccelerationAttempt,
              replacementFeeRateFloor: null,
              canAccelerate: false
            };
          } else {
            return {
              isAccelerationAttempt,
              replacementFeeRateFloor,
              canAccelerate: replacementFeeRateFloor <= maxFeeRate
            };
          }
        }
      }
    }
  }
};

type InitUnfreezeProps = {
  vault: Vault;
  vaultStatus: VaultStatus | undefined;
  onInitUnfreeze: (initUnfreezeData: VaultActionTxData) => void;
  lockBlocks: number;
  isVisible: boolean;
  onClose: () => void;
};

const InitUnfreeze = ({
  vault,
  vaultStatus,
  isVisible,
  lockBlocks,
  onInitUnfreeze,
  onClose
}: InitUnfreezeProps) => {
  const { locale } = useLocalization();
  const vaultMode = useMemo(() => getVaultMode(vault), [vault]);
  const isLadderedVault = vaultMode === 'LADDERED';
  const { t } = useTranslation();
  const {
    feeEstimates: feeEstimatesRealTime,
    btcFiat: btcFiatRealTime,
    accounts,
    networkId,
    historyData,
    signers
  } = useWallet();
  // Cache to avoid flickering in the sliders while background refreshes happen.
  const btcFiat = useFirstDefinedValue<number>(btcFiatRealTime);
  const feeEstimates = useFirstDefinedValue<FeeEstimates>(feeEstimatesRealTime);
  const signer = signers?.[0];
  const { isAccelerationAttempt, replacementFeeRateFloor, canAccelerate } =
    useMemo(
      () =>
        getTriggerAccelerationInfo({
          vault,
          vaultStatus,
          feeEstimates,
          accounts,
          networkId,
          historyData,
          signer
        }),
      [
        vault,
        vaultStatus,
        feeEstimates,
        accounts,
        networkId,
        historyData,
        signer
      ]
    );

  const ladderedTriggerSortedTxs = useMemo(() => {
    // This modal stays mounted so Modal can animate across isVisible changes.
    // While hidden, return inert render-time values instead of trigger data.
    if (!isVisible) {
      return [];
    } else if (isLadderedVault) {
      return getLadderedTriggerSortedTxs(vault);
    } else {
      return [];
    }
  }, [vault, isLadderedVault, isVisible]);

  const maxFeeRate = feeEstimates ? computeMaxAllowedFeeRate(feeEstimates) : 0;
  const { settings } = useSettings();
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );

  const [step, setStep] = useState<'intro' | 'fee'>('intro');

  const preferredInitialFeeRate = useMemo(() => {
    // This modal stays mounted so Modal can animate across isVisible changes.
    // While hidden, return inert render-time values instead of trigger data.
    if (!isVisible) {
      return null;
    } else if (!feeEstimates) {
      return null;
    } else {
      const preferredNetworkFeeRate = pickFeeEstimate(
        feeEstimates,
        settings.INITIAL_CONFIRMATION_TIME
      ).feeEstimate;
      if (!isAccelerationAttempt) return preferredNetworkFeeRate;
      else {
        if (replacementFeeRateFloor === null) return null;
        else return Math.max(replacementFeeRateFloor, preferredNetworkFeeRate);
      }
    }
  }, [
    isVisible,
    feeEstimates,
    settings.INITIAL_CONFIRMATION_TIME,
    isAccelerationAttempt,
    replacementFeeRateFloor
  ]);

  const [feeRate, setFeeRate] = useState<number | null>(null);

  const buildTxDataForFeeRate = useCallback(
    (selectedFeeRate: number): VaultActionTxData | null => {
      // This modal stays mounted so Modal can animate across isVisible changes.
      // While hidden, return inert render-time values instead of trigger data.
      if (!isVisible) {
        return null;
      } else if (isLadderedVault) {
        const triggerInfo = findNextEqualOrLargerFeeRate(
          ladderedTriggerSortedTxs,
          selectedFeeRate
        );
        if (!triggerInfo) return null;
        return {
          parentTxHex: triggerInfo.txHex,
          parentTxFee: triggerInfo.fee,
          actionFee: triggerInfo.fee,
          actionFeeRate: triggerInfo.feeRate
        };
      } else {
        const signer = signers?.[0];
        if (!networkId || !signer || !accounts) return null;
        const triggerInfo = getP2ATriggerInfo(vault);
        const network = networkMapping[networkId];
        const triggerReserveUtxosData = getTriggerReserveUtxosData({
          vault,
          signer,
          network
        });
        const changeOutput = DUMMY_CHANGE_OUTPUT(
          getMainAccount(accounts, network),
          network
        );
        // Trigger fee bumping is reserve-only by design: always reuse this
        // vault's dedicated reserve UTXO as the only non-anchor input and send
        // any leftover value back through normal wallet change.
        if (isAccelerationAttempt) {
          const previousChildTxHex = vaultStatus?.triggerCpfpTxHex;
          if (!previousChildTxHex || !historyData?.length) return null;
        }
        const plan = estimateCpfpPackage({
          parentTxHex: triggerInfo.txHex,
          parentFee: triggerInfo.fee,
          targetPackageFeeRate: selectedFeeRate,
          utxosData: triggerReserveUtxosData,
          changeOutput
        });
        if (!plan) return null;
        return {
          parentTxHex: triggerInfo.txHex,
          parentTxFee: triggerInfo.fee,
          actionFee: plan.packageFee,
          actionFeeRate: plan.packageFeeRate
        };
      }
    },
    [
      isVisible,
      isLadderedVault,
      ladderedTriggerSortedTxs,
      accounts,
      networkId,
      vault,
      isAccelerationAttempt,
      vaultStatus?.triggerCpfpTxHex,
      historyData,
      signers
    ]
  );

  const minimumSelectableFeeRate = useMemo(() => {
    // This modal stays mounted so Modal can animate across isVisible changes.
    // While hidden, return inert render-time values instead of trigger data.
    if (!isVisible) {
      return null;
    } else if (isLadderedVault) {
      return isAccelerationAttempt
        ? replacementFeeRateFloor
        : (ladderedTriggerSortedTxs[0]?.feeRate ?? MIN_FEE_RATE);
    } else {
      if (isAccelerationAttempt) {
        return replacementFeeRateFloor;
      } else {
        return findMinimumActionableFeeRate({
          minimumFeeRate: MIN_FEE_RATE,
          maximumFeeRate: maxFeeRate,
          canBuildAtFeeRate: feeRate => buildTxDataForFeeRate(feeRate) !== null
        });
      }
    }
  }, [
    isVisible,
    isLadderedVault,
    isAccelerationAttempt,
    replacementFeeRateFloor,
    ladderedTriggerSortedTxs,
    maxFeeRate,
    buildTxDataForFeeRate
  ]);

  const initialFeeRate = useMemo(
    () =>
      // If the wallet's preferred confirmation target is no longer fundable,
      // fall back to the minimum actionable replacement floor instead of
      // opening an acceleration modal that cannot proceed past the intro step.
      pickActionableInitialFeeRate({
        preferredFeeRate:
          isAccelerationAttempt &&
          replacementFeeRateFloor !== null &&
          replacementFeeRateFloor > maxFeeRate
            ? null
            : preferredInitialFeeRate,
        minimumActionableFeeRate:
          isAccelerationAttempt &&
          replacementFeeRateFloor !== null &&
          replacementFeeRateFloor > maxFeeRate
            ? null
            : minimumSelectableFeeRate,
        canBuildAtFeeRate: feeRate => buildTxDataForFeeRate(feeRate) !== null
      }),
    [
      preferredInitialFeeRate,
      isAccelerationAttempt,
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

  const canOpenFeeStep = isAccelerationAttempt
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

  const handleInitUnfreeze = useCallback(() => {
    if (!txData) throw new Error('Cannot unfreeze non-existing selected tx');
    onInitUnfreeze(txData);
  }, [onInitUnfreeze, txData]);

  const timeLockTime = formatBlocks(lockBlocks, t, locale, true);

  return (
    <Modal
      headerMini={true}
      isVisible={isVisible}
      title={t('wallet.vault.triggerUnfreezeButton')}
      icon={{
        family: 'MaterialCommunityIcons',
        name: 'snowflake-melt'
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
                <Button onPress={() => setStep('fee')}>
                  {isAccelerationAttempt
                    ? t('accelerateButton')
                    : t('continueButton')}
                </Button>
              )}
            </View>
          ) : step === 'fee' ? (
            <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
              <Button mode="secondary" onPress={onClose}>
                {t('cancelButton')}
              </Button>
              <Button onPress={handleInitUnfreeze} disabled={!txData}>
                {t('wallet.vault.triggerUnfreezeButton')}
              </Button>
            </View>
          ) : undefined
      }}
    >
      {!feeEstimates ? (
        //loading...
        <ActivityIndicator />
      ) : isAccelerationAttempt &&
        replacementFeeRateFloor !== null &&
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
            {isAccelerationAttempt
              ? t('wallet.vault.triggerUnfreeze.introAccelerate')
              : t('wallet.vault.triggerUnfreeze.intro', { timeLockTime })}
          </Text>
        </View>
      ) : step === 'fee' ? (
        <View>
          <Text className="text-base text-slate-600 pb-4 px-2">
            {t('wallet.vault.triggerUnfreeze.feeSelectorExplanation')}
          </Text>
          <View className="bg-slate-100 p-2 rounded-xl">
            {feeEstimates ? (
              <FeeInput
                {...(minimumSelectableFeeRate !== null
                  ? { min: minimumSelectableFeeRate }
                  : {})}
                btcFiat={btcFiat}
                feeEstimates={feeEstimates}
                initialValue={initialFeeRate!}
                fee={fee}
                label={t('wallet.vault.triggerUnfreeze.confirmationSpeedLabel')}
                onValueChange={setFeeRate}
              />
            ) : (
              <ActivityIndicator />
            )}
          </View>
          <Text className="text-base text-slate-600 pt-4 px-2">
            {t('wallet.vault.triggerUnfreeze.additionalExplanation', {
              timeLockTime
            })}
          </Text>
        </View>
      ) : null}
    </Modal>
  );
};

export default InitUnfreeze;
