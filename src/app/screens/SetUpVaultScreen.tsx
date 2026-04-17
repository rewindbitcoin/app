// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.
//FIXME: check the UX when there is not enough funds for the reerve.

import AddressInput from '../components/AddressInput';
import AmountInput from '../components/AmountInput';
import BlocksInput from '../components/BlocksInput';
import FeeInput from '../components/FeeInput';
import LearnMoreAboutVaults from '../components/LearnMoreAboutVaults';
import ModalInfoButton from '../components/ModalInfoButton';
import { Trans, useTranslation } from 'react-i18next';
import React, { useCallback, useState, useMemo, useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Text, View } from 'react-native';
import {
  Button,
  IconType,
  KeyboardAwareScrollView,
  Modal
} from '../../common/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  areVaultsSynched,
  coinSelectVaultTx,
  getTargetValue,
  getRequiredTriggerReserveAmount,
  getSpendableUtxosData,
  utxosDataBalance,
  type VaultSettings
} from '../lib/vaults';
import {
  DUMMY_BACKUP_OUTPUT,
  DUMMY_TRIGGER_RESERVE_OUTPUT,
  DUMMY_VAULT_OUTPUT,
  DUMMY_CHANGE_OUTPUT,
  getMainAccount,
  DUMMY_COLD_ADDRESS,
  computeChangeOutput
} from '../lib/vaultDescriptors';
import useFirstDefinedValue from '../../common/hooks/useFirstDefinedValue';
import useArrayChangeDetector from '../../common/hooks/useArrayChangeDetector';

import {
  computeMaxAllowedFeeRate,
  FeeEstimates,
  MIN_FEE_RATE,
  pickFeeEstimate
} from '../lib/fees';
import { formatBtc } from '../lib/btcRates';
import {
  estimateMaxVaultAmount,
  estimateVaultSetupRange
} from '../lib/vaultRange';
import { networkMapping } from '../lib/network';
import { useSettings } from '../hooks/useSettings';
import { useWallet } from '../hooks/useWallet';
import { OutputInstance } from '@bitcoinerlab/descriptors';
import { useLocalization } from '../hooks/useLocalization';
import { batchedUpdates } from '~/common/lib/batchedUpdates';
import { toBigInt, toNumber } from '../lib/sats';

export default function VaultSetUp({
  onVaultSetUpComplete
}: {
  onVaultSetUpComplete: (vaultSettings: VaultSettings) => void;
}) {
  const insets = useSafeAreaInsets();
  const containerStyle = useMemo(
    () => ({ marginBottom: insets.bottom / 4 + 16 }),
    [insets.bottom]
  );
  const navigation = useNavigation();

  const {
    feeEstimates: feeEstimatesRealTime,
    btcFiat: btcFiatRealTime,
    utxosData,
    networkId,
    accounts,
    historyData,
    vaults,
    vaultsStatuses,
    getNextChangeDescriptorWithIndex
  } = useWallet();

  const spendableUtxosData =
    utxosData && getSpendableUtxosData(utxosData, vaultsStatuses, historyData);

  //Warn the user and reset this component if wallet changes.
  const walletChanged = useArrayChangeDetector([spendableUtxosData, accounts]);

  //Cache to avoid flickering in the Sliders
  const btcFiat = useFirstDefinedValue<number>(btcFiatRealTime);
  const feeEstimates = useFirstDefinedValue<FeeEstimates>(feeEstimatesRealTime);

  if (!spendableUtxosData)
    throw new Error('SetUpVaultScreen cannot be called with unset utxos');
  if (!utxosData)
    throw new Error('SetUpVaultScreen cannot be called with unset raw utxos');
  if (!accounts)
    throw new Error('SetUpVaultScreen cannot be called with unset accounts');
  if (!networkId)
    throw new Error('SetUpVaultScreen cannot be called with unset networkId');
  if (!feeEstimates)
    throw new Error(
      'SetUpVaultScreen cannot be called with unset feeEstimates'
    );
  const rawUtxosData = utxosData;
  const spendableUtxos = spendableUtxosData;
  const hasReservedFunds = spendableUtxos !== rawUtxosData;
  const network = networkMapping[networkId];

  const { settings } = useSettings();
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );
  const { locale, currency } = useLocalization();

  const [lockBlocks, setLockBlocks] = useState<number | null>(
    settings.INITIAL_LOCK_BLOCKS
  );

  const lastUnusedColdAddress =
    vaults && vaultsStatuses && areVaultsSynched(vaults, vaultsStatuses)
      ? Object.entries(vaults)
          .filter(([vaultId]) => !vaultsStatuses[vaultId]?.panicTxHex)
          .sort(([, a], [, b]) => b.creationTime - a.creationTime)[0]?.[1]
          .coldAddress || null
      : null;
  const [coldAddress, setColdAddress] = useState<string | null>(
    lastUnusedColdAddress
  );
  const [changeOutput, setChangeOutput] = useState<OutputInstance | null>(null);
  const [prefilledAddressHelp, setPrefilledAddressHelp] =
    useState<boolean>(false);
  const showPrefilledAddressHelp = useCallback(
    () => setPrefilledAddressHelp(true),
    []
  );
  const hidePrefilledAddressHelp = useCallback(
    () => setPrefilledAddressHelp(false),
    []
  );
  const { t } = useTranslation();

  useEffect(() => {
    const getAndSetChangeOutput = async () => {
      const changeDescriptorWithIndex =
        await getNextChangeDescriptorWithIndex(accounts);
      setChangeOutput(computeChangeOutput(changeDescriptorWithIndex, network));
    };
    getAndSetChangeOutput();
  }, [getNextChangeDescriptorWithIndex, network, accounts]);

  const vaultMode =
    networkId === 'BITCOIN' ? 'P2A_TRUC' : settings.TESTING_VAULT_MODE;
  // P2A_TRUC vault creation must avoid unconfirmed wallet inputs.
  const { confirmedSpendableUtxos, hasExcludedUnconfirmedUtxos } =
    useMemo(() => {
      if (vaultMode !== 'P2A_TRUC' || !historyData?.length) {
        return {
          confirmedSpendableUtxos: spendableUtxos,
          hasExcludedUnconfirmedUtxos: false
        };
      }
      const unconfirmedTxIds = new Set(
        historyData
          .filter(item => item.blockHeight === 0)
          .map(item => item.txId)
      );
      if (unconfirmedTxIds.size === 0) {
        return {
          confirmedSpendableUtxos: spendableUtxos,
          hasExcludedUnconfirmedUtxos: false
        };
      }
      const filteredUtxos = spendableUtxos.filter(
        utxo => !unconfirmedTxIds.has(utxo.tx.getId())
      );
      return filteredUtxos.length === spendableUtxos.length
        ? {
            confirmedSpendableUtxos: spendableUtxos,
            hasExcludedUnconfirmedUtxos: false
          }
        : {
            confirmedSpendableUtxos: filteredUtxos,
            hasExcludedUnconfirmedUtxos: true
          };
    }, [vaultMode, historyData, spendableUtxos]);
  const vaultSetupUtxos =
    vaultMode === 'P2A_TRUC' ? confirmedSpendableUtxos : spendableUtxos;
  const maxFeeRate = computeMaxAllowedFeeRate(feeEstimates);
  // FIXME: 0.1 sat/vB is only the minimum target package fee rate.
  // This is still safe because backup funding is later clamped by dust, so the
  // realized package fee rate ends up higher, not lower. With the current
  // backup tx shape (max 634 vB, 297-sat wpkh dust), the backup alone already
  // bottoms out around 298 sats, or ~0.47 sat/vB. The UI should probably show
  // users that real minimum obtainable package fee rate instead of 0.1.
  const minimumPackageFeeRate = MIN_FEE_RATE;
  const { feeEstimate: pickedInitialPackageFeeRate } = pickFeeEstimate(
    feeEstimates,
    settings.INITIAL_CONFIRMATION_TIME
  );
  const initialPackageFeeRate = Math.min(
    maxFeeRate,
    Math.max(pickedInitialPackageFeeRate, minimumPackageFeeRate)
  );
  const [userSelectedPackageFeeRate, setUserSelectedPackageFeeRate] = useState<
    number | null
  >(initialPackageFeeRate);
  const packageFeeRate =
    userSelectedPackageFeeRate === null
      ? null
      : userSelectedPackageFeeRate >= minimumPackageFeeRate &&
          userSelectedPackageFeeRate <= maxFeeRate
        ? userSelectedPackageFeeRate
        : null;

  const {
    maxVaultAtSelectedPackageFeeRate,
    maxVaultAtMinimumPackageFeeRate,
    minimumVaultSetup
  } = estimateVaultSetupRange({
    accounts,
    utxosData: vaultSetupUtxos,
    coldAddress: coldAddress || DUMMY_COLD_ADDRESS(network),
    minimumPackageFeeRate,
    packageFeeRate,
    lockBlocks: lockBlocks || settings.INITIAL_LOCK_BLOCKS,
    network,
    vaultMode,
    presignedTriggerFeeRate: settings.PRESIGNED_TRIGGER_FEERATE,
    presignedRescueFeeRate: settings.PRESIGNED_RESCUE_FEERATE,
    maxTriggerFeeRate: settings.MAX_TRIGGER_FEERATE
  });
  const rawVaultRange = estimateVaultSetupRange({
    accounts,
    utxosData: rawUtxosData,
    coldAddress: coldAddress || DUMMY_COLD_ADDRESS(network),
    minimumPackageFeeRate,
    packageFeeRate,
    lockBlocks: lockBlocks || settings.INITIAL_LOCK_BLOCKS,
    network,
    vaultMode,
    presignedTriggerFeeRate: settings.PRESIGNED_TRIGGER_FEERATE,
    presignedRescueFeeRate: settings.PRESIGNED_RESCUE_FEERATE,
    maxTriggerFeeRate: settings.MAX_TRIGGER_FEERATE
  });
  const hasAnyVaultRange =
    maxFeeRate >= minimumPackageFeeRate &&
    maxVaultAtMinimumPackageFeeRate !== undefined &&
    maxVaultAtMinimumPackageFeeRate.vaultedAmount >=
      minimumVaultSetup.vaultedAmount;
  // P2A_TRUC can only use confirmed funds, so unconfirmed UTXOs can block setup.
  const isBlockedByUnconfirmedFunds =
    vaultMode === 'P2A_TRUC' &&
    hasExcludedUnconfirmedUtxos &&
    !hasAnyVaultRange;
  // Without temporarily reserved funds, this wallet would be able to create a vault.
  const isBlockedByReservedFunds =
    !isBlockedByUnconfirmedFunds &&
    !hasAnyVaultRange &&
    maxFeeRate >= minimumPackageFeeRate &&
    rawVaultRange.maxVaultAtMinimumPackageFeeRate !== undefined &&
    rawVaultRange.maxVaultAtMinimumPackageFeeRate.vaultedAmount >=
      rawVaultRange.minimumVaultSetup.vaultedAmount;
  const minimumRequiredFundsNow =
    minimumVaultSetup.vaultedAmount +
    minimumVaultSetup.packageFee +
    minimumVaultSetup.triggerReserveAmount;
  const requiredFundsForMinimumVaultSetup = maxVaultAtMinimumPackageFeeRate
    ? maxVaultAtMinimumPackageFeeRate.vaultedAmount +
      maxVaultAtMinimumPackageFeeRate.packageFee +
      maxVaultAtMinimumPackageFeeRate.triggerReserveAmount
    : null;
  // If coinselection cannot build any vault yet, `maxVaultAtMinimumPackageFeeRate`
  // is undefined even though some eligible UTXOs may still exist. In that case,
  // fall back to the raw eligible balance so the warnig message can show an approximation
  const missingFundsNow: number = Math.max(
    0,
    minimumRequiredFundsNow -
      (requiredFundsForMinimumVaultSetup !== null
        ? requiredFundsForMinimumVaultSetup
        : utxosDataBalance(vaultSetupUtxos))
  );
  const currentMaxVaultedAmount =
    maxVaultAtSelectedPackageFeeRate &&
    maxVaultAtSelectedPackageFeeRate.vaultedAmount >=
      minimumVaultSetup.vaultedAmount
      ? maxVaultAtSelectedPackageFeeRate.vaultedAmount
      : minimumVaultSetup.vaultedAmount;

  const [userSelectedVaultedAmount, setUserSelectedVaultedAmount] = useState<
    number | null
  >(hasAnyVaultRange ? currentMaxVaultedAmount : null);

  const [isMaxVaultedAmount, setIsMaxVaultedAmount] = useState<boolean>(
    userSelectedVaultedAmount !== null &&
      userSelectedVaultedAmount === currentMaxVaultedAmount
  );
  const [confirmedFundsWarningAccepted, setConfirmedFundsWarningAccepted] =
    useState<boolean>(false);
  const vaultedAmount: number | null =
    userSelectedVaultedAmount !== null &&
    maxVaultAtSelectedPackageFeeRate &&
    maxVaultAtSelectedPackageFeeRate.vaultedAmount >=
      minimumVaultSetup.vaultedAmount &&
    userSelectedVaultedAmount >= minimumVaultSetup.vaultedAmount &&
    userSelectedVaultedAmount <= maxVaultAtSelectedPackageFeeRate.vaultedAmount
      ? userSelectedVaultedAmount
      : null;

  const onUserSelectedVaultedAmountChange = useCallback(
    (userSelectedVaultedAmount: number | null, type: 'USER' | 'RESET') => {
      setUserSelectedVaultedAmount(userSelectedVaultedAmount);

      //Make sure the MAX_FUNDS text is set when the user reacted to the
      //slider or input box, not when the onValueChange is triggered because
      //the componet was intenally reset
      if (type === 'USER' && userSelectedVaultedAmount !== null)
        setIsMaxVaultedAmount(
          userSelectedVaultedAmount === currentMaxVaultedAmount
        );
    },
    [currentMaxVaultedAmount]
  );

  const handleOK = useCallback(() => {
    if (
      packageFeeRate === null ||
      vaultedAmount === null ||
      lockBlocks === null ||
      coldAddress === null
    )
      throw new Error('Cannot process Vault');

    onVaultSetUpComplete({
      vaultedAmount,
      coldAddress,
      packageFeeRate,
      lockBlocks,

      accounts,
      btcFiat,
      utxosData: vaultSetupUtxos
    });
  }, [
    packageFeeRate,
    vaultSetupUtxos,
    vaultedAmount,
    lockBlocks,
    onVaultSetUpComplete,
    coldAddress,
    accounts,
    btcFiat
  ]);

  /**
   * Handles fee rate changes with special consideration for max amount
   * selection.
   *
   * This function solves a critical UI flicker issue by synchronizing fee rate
   * and amount updates:
   *
   * THE PROBLEM:
   * 1. When user selects max amount and then changes fee rate, the available
   * max amount changes
   * 2. If we update only the fee rate first, the UI will briefly show an
   * invalid state
   * 3. This causes a visible flicker as the amount updates in a separate render
   * cycle (AmountInput will call onUserSelectedVaultedAmountChange with the
   * correct value but a "tick" later)
   *
   * THE SOLUTION:
   * 1. When fee changes and max amount is selected, we calculate the new max
   * amount immediately
   * 2. We batch both state updates (fee and amount) to happen in the same
   * render cycle
   * 3. This ensures the UI always shows a consistent state without flicker
   *
   * OPTIMIZATION:
   * - We only perform the expensive calculation when necessary (max amount selected)
   * - We use the same calculation method as the main range estimation
   * - We batch updates to avoid multiple renders
   */
  const handlePackageFeeRateChange = useCallback(
    (newPackageFeeRate: number | null) => {
      batchedUpdates(() => {
        // Always update the fee rate
        setUserSelectedPackageFeeRate(newPackageFeeRate);

        // Only recalculate max amount if user has selected max and fee is valid
        if (isMaxVaultedAmount && newPackageFeeRate !== null) {
          const currentChangeOutput =
            changeOutput ||
            DUMMY_CHANGE_OUTPUT(getMainAccount(accounts, network), network);
          const newMaxEstimate = estimateMaxVaultAmount({
            utxosData: vaultSetupUtxos,
            vaultOutput: DUMMY_VAULT_OUTPUT(network),
            backupOutput: DUMMY_BACKUP_OUTPUT(network),
            triggerReserveOutput: DUMMY_TRIGGER_RESERVE_OUTPUT(network),
            triggerReserveAmount: getRequiredTriggerReserveAmount({
              triggerReserveOutput: DUMMY_TRIGGER_RESERVE_OUTPUT(network),
              changeOutput: currentChangeOutput,
              vaultMode,
              presignedTriggerFeeRate: settings.PRESIGNED_TRIGGER_FEERATE,
              maxTriggerFeeRate: settings.MAX_TRIGGER_FEERATE
            }),
            changeOutput: currentChangeOutput,
            vaultMode,
            packageFeeRate: newPackageFeeRate
          });

          // Update the amount in the same render cycle to prevent flicker
          setUserSelectedVaultedAmount(
            newMaxEstimate?.vaultedAmount || minimumVaultSetup.vaultedAmount
          );
        }
      });
    },
    [
      accounts,
      changeOutput,
      isMaxVaultedAmount,
      minimumVaultSetup.vaultedAmount,
      vaultSetupUtxos,
      network,
      settings.PRESIGNED_TRIGGER_FEERATE,
      settings.MAX_TRIGGER_FEERATE,
      vaultMode,
      setUserSelectedPackageFeeRate
    ]
  );

  const formatAmount = (amount: number) =>
    formatBtc({
      amount,
      subUnit: settings.SUB_UNIT,
      btcFiat,
      locale,
      currency
    });

  const triggerReserveAmount = getRequiredTriggerReserveAmount({
    triggerReserveOutput: DUMMY_TRIGGER_RESERVE_OUTPUT(network),
    changeOutput:
      changeOutput ||
      DUMMY_CHANGE_OUTPUT(getMainAccount(accounts, network), network),
    vaultMode,
    presignedTriggerFeeRate: settings.PRESIGNED_TRIGGER_FEERATE,
    maxTriggerFeeRate: settings.MAX_TRIGGER_FEERATE
  });

  // The slider shows the package fee for the vault tx plus the on-chain
  // backup tx. The Unfreeze Reserve is displayed separately because it is set
  // aside, not spent.
  let packageFee = null;
  if (vaultedAmount !== null && packageFeeRate !== null) {
    const selected = coinSelectVaultTx({
      utxosData: vaultSetupUtxos,
      //We never use the final vaultOutput since it is built using a random
      //key that we don't want to keep in memory, but setup still needs to
      //reserve the same backup and trigger-reserve outputs that real vault
      //creation will fund.
      vaultOutput: DUMMY_VAULT_OUTPUT(network),
      backupOutput: DUMMY_BACKUP_OUTPUT(network),
      triggerReserveOutput: DUMMY_TRIGGER_RESERVE_OUTPUT(network),
      triggerReserveAmount,
      changeOutput:
        changeOutput ||
        DUMMY_CHANGE_OUTPUT(getMainAccount(accounts, network), network),
      packageFeeRate,
      vaultMode,
      vaultedAmount: toBigInt(vaultedAmount)
    });
    if (typeof selected !== 'string') {
      const finalBackupFeeBudget = getTargetValue(
        selected.targets,
        DUMMY_BACKUP_OUTPUT(network)
      );
      packageFee = toNumber(selected.fee + finalBackupFeeBudget);
    }
  }

  const prefilledAddressHelpIcon = useMemo<IconType>(
    () => ({ family: 'FontAwesome6', name: 'shield-halved' }),
    []
  );

  const allFieldsValid =
    vaultedAmount !== null &&
    lockBlocks !== null &&
    packageFeeRate !== null &&
    coldAddress !== null;

  return (
    <KeyboardAwareScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="items-center pt-5 px-4"
    >
      {walletChanged ? (
        <View className="w-full max-w-screen-sm mx-4" style={containerStyle}>
          <View className="mb-8">
            <Text className="text-base">{t('vaultSetup.interrupt')}</Text>
          </View>
          <Button onPress={navigation.goBack}>{t('goBack')}</Button>
        </View>
      ) : vaultMode === 'P2A_TRUC' &&
        hasExcludedUnconfirmedUtxos &&
        hasAnyVaultRange &&
        !confirmedFundsWarningAccepted ? (
        <View className="w-full max-w-screen-sm mx-4" style={containerStyle}>
          <View className="mb-8">
            <Text className="text-base">
              {t('vaultSetup.confirmedFundsWarning')}
            </Text>
          </View>
          <View className="self-center flex-row justify-center items-center gap-5">
            <Button onPress={navigation.goBack}>{t('goBack')}</Button>
            <Button onPress={() => setConfirmedFundsWarningAccepted(true)}>
              {t('continueButton')}
            </Button>
          </View>
        </View>
      ) : !hasAnyVaultRange ? (
        <View className="w-full max-w-screen-sm mx-4" style={containerStyle}>
          <View className="mb-8">
            <Text className="text-base">
              <Trans
                i18nKey={
                  isBlockedByUnconfirmedFunds
                    ? 'vaultSetup.notEnoughConfirmedFunds'
                    : isBlockedByReservedFunds
                      ? 'vaultSetup.reservedFundsNotice'
                      : 'vaultSetup.notEnoughFunds'
                }
                values={{
                  missingFunds: formatBtc({
                    amount: missingFundsNow,
                    subUnit: settings.SUB_UNIT,
                    btcFiat,
                    locale,
                    currency
                  }),
                  minimumVaultedAmount: formatBtc({
                    amount: minimumVaultSetup.vaultedAmount,
                    subUnit: settings.SUB_UNIT,
                    btcFiat,
                    locale,
                    currency
                  }),
                  minimumRequiredFunds: formatBtc({
                    amount: minimumRequiredFundsNow,
                    subUnit: settings.SUB_UNIT,
                    btcFiat,
                    locale,
                    currency
                  })
                }}
                components={{
                  strong: <Text className="font-bold" />
                }}
              />
            </Text>
          </View>
          <Button onPress={navigation.goBack}>{t('goBack')}</Button>
        </View>
      ) : (
        <View className="w-full max-w-screen-sm mx-4" style={containerStyle}>
          <View className="mb-8">
            <Text className="text-base mb-1">{t('vaultSetup.intro')}</Text>
            <LearnMoreAboutVaults />
          </View>
          {hasReservedFunds ? (
            <View className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
              <Text className="text-base text-amber-900">
                <Trans
                  i18nKey="vaultSetup.reservedFundsBanner"
                  components={{
                    strong: <Text className="font-bold text-amber-900" />
                  }}
                />
              </Text>
            </View>
          ) : null}
          <AmountInput
            btcFiat={btcFiat}
            isMaxAmount={isMaxVaultedAmount}
            label={t('vaultSetup.amountLabel')}
            initialValue={currentMaxVaultedAmount}
            min={minimumVaultSetup.vaultedAmount}
            max={currentMaxVaultedAmount}
            onValueChange={onUserSelectedVaultedAmountChange}
          />
          <View className="w-full flex-row items-start gap-2 px-2 pt-1">
            <Text className="shrink text-sm text-slate-500">
              {t('vaultSetup.unfreezeReserveLabel')}:{' '}
              {formatAmount(toNumber(triggerReserveAmount))}
            </Text>
            <ModalInfoButton
              title={t('vaultSetup.unfreezeReserveHelpTitle')}
              icon={{ family: 'FontAwesome5', name: 'coins' }}
              text={t('vaultSetup.unfreezeReserveHelp')}
            />
          </View>
          <View className="mb-8" />
          <BlocksInput
            label={t('vaultSetup.securityLockTimeLabel')}
            initialValue={settings.INITIAL_LOCK_BLOCKS}
            min={settings.MIN_LOCK_BLOCKS}
            max={settings.MAX_LOCK_BLOCKS}
            onValueChange={setLockBlocks}
          />
          <View className="mb-8" />
          <AddressInput
            type="emergency"
            networkId={networkId}
            {...(coldAddress ? { initialValue: coldAddress } : {})}
            onValueChange={setColdAddress}
          />
          {lastUnusedColdAddress && lastUnusedColdAddress === coldAddress ? (
            <View className="px-1 pt-1">
              <Text className="text-sm text-slate-500">
                {t('vaultSetup.prefilledAddress') + ' '}
                <Text
                  //Cannot use Button mode='text' here and use <Text onPress> instead since I want texts to be in the same line flow and the Pressable wrapper in Button breaks vertical alignment because of some sort of React Native bug
                  onPress={showPrefilledAddressHelp}
                  className="text-sm text-primary hover:opacity-90 active:opacity-90 active:scale-95 select-none"
                >
                  {t('helpButton')}
                </Text>
              </Text>
              <Modal
                title={t('vaultSetup.prefilledAddressHelpTitle')}
                icon={prefilledAddressHelpIcon}
                isVisible={prefilledAddressHelp}
                onClose={hidePrefilledAddressHelp}
                closeButtonText={t('understoodButton')}
              >
                <Text className="pl-2 pr-2 text-base">
                  {t('vaultSetup.prefilledAddressHelp', { coldAddress })}
                </Text>
              </Modal>
            </View>
          ) : null}
          <View className="mb-8" />
          <FeeInput
            btcFiat={btcFiat}
            feeEstimates={feeEstimates}
            initialValue={initialPackageFeeRate}
            fee={packageFee}
            label={t('vaultSetup.confirmationSpeedLabel')}
            min={minimumPackageFeeRate}
            onValueChange={handlePackageFeeRateChange}
          />
          <View className="self-center flex-row justify-center items-center mt-5 gap-5">
            <Button onPress={navigation.goBack}>{t('cancelButton')}</Button>
            <Button disabled={!allFieldsValid} onPress={handleOK}>
              {t('continueButton')}
            </Button>
          </View>
          {!allFieldsValid && (
            <Text className="text-center text-orange-600 native:text-sm web:text-xs pt-2">
              {coldAddress
                ? t('vaultSetup.fillInAll')
                : t('vaultSetup.coldAddressMissing')}
            </Text>
          )}
        </View>
      )}
    </KeyboardAwareScrollView>
  );
}
