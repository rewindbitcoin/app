// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import React, {
  useEffect,
  useState,
  useRef,
  useMemo,
  useCallback
} from 'react';
import { useWallet } from '../hooks/useWallet';
import { useTranslation } from 'react-i18next';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  createVault,
  getP2AVaultFundingBreakdown,
  type VaultSettings,
  type Vault,
  getRandomSigner
} from '../lib/vaults';
import { useSettings } from '../hooks/useSettings';
import {
  Button,
  KeyboardAwareScrollView,
  useToast,
  ActivityIndicator
} from '../../common/ui';
import { getVaultIdentity } from '../lib/backup/vaultIdentity';
import { useNavigation } from '@react-navigation/native';
import { useNetStatus } from '../hooks/useNetStatus';
import { NavigationPropsByScreenId, WALLET_HOME } from '../screens';
import { formatBlocks } from '../lib/format';
import { formatBtc } from '../lib/btcRates';
import { getPresignedTriggerFeeRate } from '../lib/settings';
import { useLocalization } from '../hooks/useLocalization';
import { toBigInt } from '../lib/sats';
import ModalInfoButton from '../components/ModalInfoButton';
import AddressActionRow from '../components/AddressActionRow';
import LabelEditor from '../components/LabelEditor';
import {
  getVaultCreationChangeOutputRef,
  getVaultOutputRef,
  getVaultTriggerReserveOutputRef,
  normalizeVaultNameText
} from '../lib/vaultLabels';
import { transactionFromHex } from '../lib/bitcoin';

const SummaryTitle = ({
  title,
  infoButton
}: {
  title: string;
  infoButton?: React.ReactNode;
}) => (
  <View className="flex-row items-center gap-2 mb-1">
    <Text className="text-base font-bold">{title}</Text>
    {infoButton}
  </View>
);

export default function CreateVaultScreen({
  vaultSettings
}: {
  vaultSettings: VaultSettings | undefined;
}) {
  if (!vaultSettings) throw new Error('vaultSettings not set');
  const {
    vaultedAmount,
    coldAddress,
    packageFeeRate,
    lockBlocks,

    utxosData,
    coinControl,
    accounts,
    btcFiat
  } = vaultSettings;

  const insets = useSafeAreaInsets();
  const mbStyle = useMemo(() => ({ marginBottom: insets.bottom }), [insets]);
  const {
    getNextChangeDescriptorWithIndex,
    getNextOnChainBackupIndex,
    getUnvaultKeyExpression,
    signers,
    pushVaultRegisterWTAndUpdateStates,
    wallet,
    vaults,
    labels,
    setWalletLabelTextsIfEmpty,
    networkId,
    blockExplorerURL
  } = useWallet();

  if (
    !wallet ||
    !vaults ||
    !networkId ||
    !signers ||
    !pushVaultRegisterWTAndUpdateStates
  )
    throw new Error('Missing data from context');
  const lastP2PBackupVaultIndex = wallet.lastP2PBackupVaultIndex;
  const walletId = wallet.walletId;
  const {
    netRequest,
    netToast,
    apiReachable,
    permanentErrorMessage: nsErrorMessage
  } = useNetStatus();
  const toast = useToast();
  const { t } = useTranslation();
  const defaultVaultName = String(Object.keys(vaults).length + 1);
  const [vaultNameDraft, setVaultNameDraft] =
    useState<string>(defaultVaultName);
  const vaultName = normalizeVaultNameText(vaultNameDraft) || defaultVaultName;
  const defaultCreateVaultTxLabel = t('wallet.vault.actionLabels.createVault', {
    vaultName
  });
  const [createVaultTxLabelDraft, setCreateVaultTxLabelDraft] = useState<
    string | undefined
  >();
  const createVaultTxLabel =
    createVaultTxLabelDraft ?? defaultCreateVaultTxLabel;
  const navigation = useNavigation<NavigationPropsByScreenId['CREATE_VAULT']>();
  const createCancelled = useRef<boolean>(false);
  const { settings } = useSettings();
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );
  const vaultMode =
    networkId === 'BITCOIN' ? 'P2A_TRUC' : settings.TESTING_VAULT_MODE;
  const presignedTriggerFeeRate = getPresignedTriggerFeeRate(
    settings,
    vaultMode
  );
  const { locale, currency } = useLocalization();
  const [confirmRequested, setConfirmRequested] = useState<boolean>(false);
  const [vault, setVault] = useState<Vault>();

  const backBlockerUnsubscriberRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    //prevents going back with any other action
    //https://reactnavigation.org/docs/preventing-going-back/
    if (confirmRequested) {
      navigation.setOptions({
        gestureEnabled: false,
        headerBackVisible: false
      });
      backBlockerUnsubscriberRef.current = navigation.addListener(
        'beforeRemove',
        e => e.preventDefault()
      );
    } else {
      navigation.setOptions({
        gestureEnabled: true,
        headerBackVisible: true
      });
    }
    return () => {
      if (backBlockerUnsubscriberRef.current) {
        backBlockerUnsubscriberRef.current();
        backBlockerUnsubscriberRef.current = null;
      }
    };
  }, [confirmRequested, navigation]);

  const goBack = useCallback(() => {
    //programatical goBack will re-enable back behaviour
    if (backBlockerUnsubscriberRef.current) {
      backBlockerUnsubscriberRef.current();
      backBlockerUnsubscriberRef.current = null;
    }
    //goBack will unmount this screen as per react-navigation docs.
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation]);
  const goBackToWalletHome = useCallback(() => {
    //programatical goBack will re-enable back behaviour
    if (backBlockerUnsubscriberRef.current) {
      backBlockerUnsubscriberRef.current();
      backBlockerUnsubscriberRef.current = null;
    }

    //In react navigation v6 navigation.navigate beahves as if doing a
    //navigation.pop(2). So it unmounts this screen.
    //Note that on version v7 the behaviour will change. Since a reset of all
    //states and refs is necessary when leaving this screen, then make sure
    //
    //I will still be using the same behaviupur when i upgrade to v7
    //https://reactnavigation.org/docs/7.x/upgrading-from-6.x#the-navigate-method-no-longer-goes-back-use-popto-instead
    //
    // @ts-expect-error: Using popTo for future upgrade to v7
    if (navigation.popTo) navigation.popTo(WALLET_HOME, { walletId });
    else navigation.navigate(WALLET_HOME, { walletId });
  }, [navigation, walletId]);

  useEffect(() => {
    return () => {
      createCancelled.current = true;
    };
  }, []);
  const cancelCreate = useCallback(() => {
    createCancelled.current = true;
    goBack();
  }, [goBack]);
  const shouldContinueCreate = useCallback(
    () => !createCancelled.current && navigation.isFocused(),
    [navigation]
  );

  const isVaultCreated = useRef<boolean>(false);

  const signer = signers[0];
  if (!signer) throw new Error('signer unavailable');

  const confirm = useCallback(async () => {
    //While the vault was being created, maybe the internet went down.
    //So recheck before confirm.
    if (nsErrorMessage && !apiReachable) {
      netToast(false, t('createVault.connectivityIssues'));
      goBack();
      return;
    }
    if (!vault) throw new Error('Unset vault cannot be confirmed');

    setConfirmRequested(true);

    //This means the screen is not focussed anymore!?!?!
    //Don't proceed.
    if (!navigation.isFocused()) return;

    //Pushes the vault and then updates:
    //  - Vaults and VaultsStatuses, discoveryExport local storage and
    //  - also derived data: utxosData and historyData
    const { status: pushAndUpdateStatus, result: pushAndUpdateResult } =
      await netRequest({
        whenToastErrors: 'ON_ANY_ERROR',
        errorMessage: message => t('createVault.vaultPushError', { message }),
        func: () => pushVaultRegisterWTAndUpdateStates(vault)
      });

    if (pushAndUpdateStatus !== 'SUCCESS') {
      //The toast with prev error message will have been shown.
      goBack();
    } else {
      if (!pushAndUpdateResult)
        throw new Error('Vault push succeeded without backup transaction data');
      try {
        const autoLabelEntries: Array<{
          type: 'tx' | 'output';
          ref: string;
          label: string;
        }> = [
          {
            type: 'output',
            ref: getVaultOutputRef(vault),
            label: vaultName
          },
          {
            type: 'tx',
            ref: transactionFromHex(vault.vaultTxHex).txId,
            label: createVaultTxLabel
          },
          {
            type: 'tx',
            ref: transactionFromHex(pushAndUpdateResult.backupTxHex).txId,
            label: t('wallet.vault.actionLabels.onChainBackup', { vaultName })
          }
        ];
        const triggerReserveRef = getVaultTriggerReserveOutputRef({
          vault,
          signer
        });
        if (triggerReserveRef)
          autoLabelEntries.push({
            type: 'output' as const,
            ref: triggerReserveRef,
            label: t('wallet.vault.actionLabels.unfreezeFeeReserve', {
              vaultName
            })
          });
        const changeRef = getVaultCreationChangeOutputRef({ vault, signer });
        if (changeRef)
          autoLabelEntries.push({
            type: 'output' as const,
            ref: changeRef,
            label: t('wallet.vault.actionLabels.vaultCreationChange', {
              vaultName
            })
          });
        if (autoLabelEntries.length)
          await setWalletLabelTextsIfEmpty(autoLabelEntries);
      } catch (error) {
        console.warn('Failed to save vault labels', error);
      }
      toast.show(t('createVault.vaultSuccess'), {
        type: 'success',
        duration: 4000
      });
      goBackToWalletHome();
    }
  }, [
    apiReachable,
    nsErrorMessage,
    goBackToWalletHome,
    toast,
    netToast,
    netRequest,
    vault,
    t,
    navigation,
    goBack,
    pushVaultRegisterWTAndUpdateStates,
    setWalletLabelTextsIfEmpty,
    vaultName,
    createVaultTxLabel,
    signer
  ]);

  useEffect(() => {
    //Run this effect only once (when it mounts)
    if (isVaultCreated.current === true) return;
    else isVaultCreated.current = true;

    if (!apiReachable) {
      netToast(false, t('createVault.connectivityIssues'));
      goBackToWalletHome();
      return;
    }
    if (lastP2PBackupVaultIndex === undefined) {
      netToast(false, t('createVault.backupScanPending'));
      goBackToWalletHome();
      return;
    }

    const create = async () => {
      if (!shouldContinueCreate()) return;

      const unvaultKeyExpression = await getUnvaultKeyExpression();
      if (!shouldContinueCreate()) return;
      const changeDescriptorWithIndex =
        await getNextChangeDescriptorWithIndex(accounts);
      if (!shouldContinueCreate()) return;

      const nextP2PBackupIndex = lastP2PBackupVaultIndex + 1;
      const { result: nextOnChainBackupIndex } = await netRequest({
        whenToastErrors: 'ON_ANY_ERROR',
        errorMessage: message => t('createVault.fetchIssues', { message }),
        func: () => getNextOnChainBackupIndex(nextP2PBackupIndex)
      });
      if (!shouldContinueCreate()) return;
      if (nextOnChainBackupIndex === undefined) {
        //The toast with prev error message will have been shown.
        goBack();
        return;
      }

      const randomSigner = await getRandomSigner(networkId);
      if (!shouldContinueCreate()) return;
      const nextVaultIndex = Math.max(
        nextP2PBackupIndex,
        nextOnChainBackupIndex
      );
      const nextVaultIdentity = getVaultIdentity({
        signer,
        networkId,
        index: nextVaultIndex
      });

      //createVault does not throw. It returns errors as strings:
      const vaultData = await createVault({
        vaultedAmount:
          vaultedAmount === 'MAX_FUNDS' ? 'MAX_FUNDS' : toBigInt(vaultedAmount),
        unvaultKeyExpression,
        packageFeeRate,
        presignedTriggerFeeRate,
        presignedRescueFeeRate: settings.PRESIGNED_RESCUE_FEERATE,
        maxTriggerFeeRate: settings.MAX_TRIGGER_FEERATE,
        utxosData,
        coinControl,
        signer,
        randomSigner,
        coldAddress,
        lockBlocks,
        changeDescriptorWithIndex,
        vaultIndex: nextVaultIndex,
        vaultMode,
        shiftFeesToBackupTx: true,
        networkId
      });
      if (!shouldContinueCreate()) return;

      if (typeof vaultData === 'object') {
        const vault: Vault = {
          vaultId: nextVaultIdentity.vaultId,
          vaultPath: nextVaultIdentity.vaultPath,
          vaultedAmount: vaultData.selectedVaultedAmount,
          vaultAddress: vaultData.vaultAddress,
          triggerAddress: vaultData.triggerAddress,
          coldAddress,
          lockBlocks,
          vaultTxHex: vaultData.vaultTxHex,
          txMap: vaultData.txMap,
          triggerMap: vaultData.triggerMap,
          networkId,
          unvaultKey: unvaultKeyExpression,
          triggerDescriptor: vaultData.triggerDescriptor,
          creationTime: vaultData.creationTime
        };
        setVault(vault);
      } else {
        if (vaultData !== 'USER_CANCEL') {
          const errorMessage = t('createVault.unexpectedError', {
            message: vaultData
          });
          toast.show(errorMessage, { type: 'danger' });
        }
        goBack();
      }
    };
    create();
  }, [
    apiReachable,
    goBackToWalletHome,
    netRequest,
    goBack,
    t,
    toast,
    netToast,
    vaultedAmount,
    coldAddress,
    packageFeeRate,
    getNextChangeDescriptorWithIndex,
    getNextOnChainBackupIndex,
    getUnvaultKeyExpression,
    lockBlocks,
    networkId,
    vaultMode,
    shouldContinueCreate,
    lastP2PBackupVaultIndex,
    signer,
    utxosData,
    coinControl,
    accounts,
    presignedTriggerFeeRate,
    settings.PRESIGNED_RESCUE_FEERATE,
    settings.MAX_TRIGGER_FEERATE
  ]);

  let vaultTxInfo: Vault['txMap'][string] | undefined;
  if (vault) {
    vaultTxInfo = vault.txMap[vault.vaultTxHex];
    if (!vaultTxInfo)
      throw new Error(`Vault txMap entry not set for vault ${vault.vaultId}`);
  }

  let vaultFundingBreakdown = null;
  if (vault && vaultTxInfo) {
    const { vaultTxFee, backupTxCost, triggerReserveValue } =
      getP2AVaultFundingBreakdown({ vault, signer });
    vaultFundingBreakdown = {
      vaultTxFee,
      backupTxCost,
      triggerReserveValue,
      totalTakenFromWalletNow:
        vault.vaultedAmount + vaultTxFee + backupTxCost + triggerReserveValue
    };
  }

  const formatAmount = (amount: number) =>
    formatBtc({
      amount,
      subUnit: settings.SUB_UNIT,
      btcFiat,
      locale,
      currency
    });

  if (confirmRequested) {
    return (
      <View
        className="flex-1 self-center max-w-screen-sm w-full px-4 py-4 mobmed:py-8"
        style={mbStyle}
      >
        <Text className="text-base">{t('createVault.submittingVault')}</Text>
        <View className="items-center pt-10">
          <ActivityIndicator size="large" />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="flex-grow"
    >
      <View
        className="flex-1 self-center max-w-screen-sm w-full px-4 py-4 mobmed:py-8"
        style={mbStyle}
      >
        {!vault || !vaultTxInfo ? (
          //Initial view:
          <View className="flex-1 justify-between">
            <View>
              <Text className="text-base self-start">
                {t('createVault.intro')}
              </Text>
              <View className="items-center pt-10">
                <ActivityIndicator size="large" />
              </View>
            </View>
            <Button onPress={cancelCreate}>{t('cancelButton')}</Button>
          </View>
        ) : (
          //After the vault has been created:
          <>
            <Text className="text-base mb-4">
              {t('createVault.confirmBackupSendVault')}
            </Text>
            <View className="bg-gray-50 p-4 rounded-lg mb-4 android:elevation ios:shadow web:shadow gap-5">
              {/* Vault Label */}
              <View>
                <Text className="text-base font-bold mb-1">
                  {t('createVault.label')}
                </Text>
                <LabelEditor
                  label={vaultNameDraft}
                  placeholder=""
                  disabled={!labels}
                  editActionText={t('createVault.editName')}
                  onSave={label =>
                    setVaultNameDraft(
                      normalizeVaultNameText(label) || defaultVaultName
                    )
                  }
                />
              </View>

              {/* Amount */}
              <View>
                <Text className="text-base font-bold mb-1">
                  {t('vaultSetup.amountLabel')}
                </Text>
                <Text className="text-base">
                  {formatAmount(vault.vaultedAmount)}
                </Text>
              </View>

              {/* Trigger Reserve */}
              {vaultFundingBreakdown ? (
                <View>
                  <SummaryTitle
                    title={t('vaultSetup.unfreezeReserveLabel')}
                    infoButton={
                      <ModalInfoButton
                        title={t('vaultSetup.unfreezeReserveHelpTitle')}
                        icon={{ family: 'FontAwesome5', name: 'coins' }}
                        text={t('vaultSetup.unfreezeReserveHelp')}
                        buttonContainerClassName=""
                      />
                    }
                  />
                  <Text className="text-base">
                    {formatAmount(vaultFundingBreakdown.triggerReserveValue)}
                  </Text>
                </View>
              ) : null}

              {/* Time Lock */}
              <View>
                <SummaryTitle
                  title={t('createVault.timeLock')}
                  infoButton={
                    <ModalInfoButton
                      title={t('blocksInput.coldAddress.helpTitle')}
                      icon={{
                        family: 'FontAwesome6',
                        name: 'shield-halved'
                      }}
                      text={t('blocksInput.coldAddress.helpText')}
                      buttonContainerClassName=""
                    />
                  }
                />
                <Text className="text-base">
                  {formatBlocks(vault.lockBlocks, t, locale, true)}
                </Text>
              </View>

              {/* Funding Breakdown */}
              {vaultFundingBreakdown ? (
                <>
                  <View>
                    <SummaryTitle
                      title={t('vaultSetup.vaultTransactionFeeLabel')}
                      infoButton={
                        vaultFundingBreakdown.vaultTxFee === 0 ? (
                          <ModalInfoButton
                            title={t('vaultSetup.vaultTransactionFeeLabel')}
                            icon={{
                              family: 'MaterialCommunityIcons',
                              name: 'pickaxe'
                            }}
                            text={t('createVault.zeroVaultTransactionFeeHelp')}
                            buttonContainerClassName=""
                          />
                        ) : undefined
                      }
                    />
                    <Text className="text-base">
                      {formatAmount(vaultFundingBreakdown.vaultTxFee)}
                    </Text>
                  </View>

                  <View>
                    <SummaryTitle
                      title={t('vaultSetup.backupFundingLabel')}
                      infoButton={
                        <ModalInfoButton
                          title={t('vaultSetup.backupFundingLabel')}
                          icon={{
                            family: 'MaterialCommunityIcons',
                            name: 'database-lock-outline'
                          }}
                          text={t('createVault.onChainBackupCostHelp')}
                          buttonContainerClassName=""
                        />
                      }
                    />
                    <Text className="text-base">
                      {formatAmount(vaultFundingBreakdown.backupTxCost)}
                    </Text>
                  </View>

                  <View>
                    <Text className="text-base font-bold mb-1">
                      {t('vaultSetup.totalTakenFromWalletNowLabel')}
                    </Text>
                    <Text className="text-base">
                      {formatAmount(
                        vaultFundingBreakdown.totalTakenFromWalletNow
                      )}
                    </Text>
                  </View>
                </>
              ) : null}

              {/* Transaction Label */}
              <View>
                <Text className="text-base font-bold mb-1">
                  {t('createVault.txLabel')}
                </Text>
                <LabelEditor
                  label={createVaultTxLabel}
                  placeholder={t('transaction.labelPlaceholder')}
                  disabled={!labels}
                  onSave={setCreateVaultTxLabelDraft}
                />
              </View>

              {/* Emergency Address */}
              <View>
                <SummaryTitle
                  title={t('createVault.emergencyAddress')}
                  infoButton={
                    <ModalInfoButton
                      title={t('addressInput.coldAddress.helpTitle')}
                      icon={{
                        family: 'FontAwesome6',
                        name: 'shield-halved'
                      }}
                      text={t('addressInput.coldAddress.helpText')}
                      buttonContainerClassName=""
                    />
                  }
                />
                <AddressActionRow
                  address={vault.coldAddress}
                  blockExplorerURL={blockExplorerURL}
                />
              </View>
            </View>
            <Text className="text-base mb-8">
              {
                //t('createVault.encryptionBackupExplain')
                t('createVault.explainConfirm')
              }
            </Text>

            <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center">
              <Button mode="secondary" onPress={goBack}>
                {t('cancelButton')}
              </Button>
              <Button onPress={confirm}>{t('submitButton')}</Button>
            </View>
          </>
        )}
      </View>
    </KeyboardAwareScrollView>
  );
}
