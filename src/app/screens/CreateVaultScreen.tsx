import React, {
  useEffect,
  useState,
  useRef,
  useMemo,
  useCallback
} from 'react';
import { useWallet } from '../hooks/useWallet';
import { useTranslation } from 'react-i18next';
import { useWindowDimensions, View, Text } from 'react-native';
import * as Progress from 'react-native-progress';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createVault, type VaultSettings, type Vault } from '../lib/vaults';
import { useSettings } from '../hooks/useSettings';
import {
  Button,
  KeyboardAwareScrollView,
  useToast,
  ActivityIndicator
} from '../../common/ui';
import { p2pBackupVault, fetchP2PVaultIds } from '../lib/backup';
import { useNavigation } from '@react-navigation/native';
import { useNetStatus } from '../hooks/useNetStatus';
import { NavigationPropsByScreenId, WALLET_HOME } from '../screens';
import { batchedUpdates } from '~/common/lib/batchedUpdates';
import { formatBlocks } from '../lib/format';
import { createServiceOutput } from '../lib/vaultDescriptors';
import { networkMapping } from '../lib/network';
import { formatBtc } from '../lib/btcRates';
import { useLocalization } from '../hooks/useLocalization';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default function CreateVaultScreen({
  vaultSettings
}: {
  vaultSettings: VaultSettings | undefined;
}) {
  if (!vaultSettings) throw new Error('vaultSettings not set');
  const {
    vaultedAmount,
    serviceFee,
    coldAddress,
    feeRate,
    lockBlocks,

    accounts,
    btcFiat,
    utxosData
  } = vaultSettings;

  const height = useWindowDimensions().height;

  const insets = useSafeAreaInsets();
  const mbStyle = useMemo(() => ({ marginBottom: insets.bottom }), [insets]);
  const {
    fetchServiceAddress,
    getNextChangeDescriptorWithIndex,
    getUnvaultKey,
    signers,
    pushVaultRegisterWTAndUpdateStates,
    vaults,
    cBVaultsWriterAPI,
    cBVaultsReaderAPI,
    wallet,
    networkId
  } = useWallet();

  if (
    !wallet ||
    !networkId ||
    !signers ||
    !pushVaultRegisterWTAndUpdateStates ||
    !cBVaultsWriterAPI ||
    !cBVaultsReaderAPI
  )
    throw new Error('Missing data from context');
  const walletId = wallet.walletId;
  const {
    netRequest,
    netToast,
    apiReachable,
    cBVaultsReaderAPIReachable,
    permanentErrorMessage: nsErrorMessage
  } = useNetStatus();
  const toast = useToast();
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationPropsByScreenId['CREATE_VAULT']>();
  const keepProgress = useRef<boolean>(true);
  const { settings } = useSettings();
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );
  const networkTimeout = settings.NETWORK_TIMEOUT;
  const samples = settings.SAMPLES;
  const feeRateCeiling = settings.PRESIGNED_FEE_RATE_CEILING;
  const maxFeeRateCeiling = settings.MAX_PRESIGNED_FEE_RATE_CEILING;
  const { locale, currency } = useLocalization();
  // We know settings are the correct ones in this Component
  const [progress, setProgress] = useState<number>(0);
  const [confirmRequested, setConfirmRequested] = useState<boolean>(false);
  const [serviceAddressQuiet, setServiceAddressQuiet] = useState<
    boolean | undefined
  >(undefined);
  const [vault, setVault] = useState<Vault>();

  const backBlockerUnsubscriberRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    const preventGoBack = confirmRequested && progress === 1;
    //prevents going back with any other action
    //https://reactnavigation.org/docs/preventing-going-back/
    if (preventGoBack) {
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
  }, [confirmRequested, navigation, progress]);

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

  const stopProgress = useCallback(() => {
    keepProgress.current = false;
  }, []);
  useEffect(() => {
    if (!navigation.isFocused()) stopProgress();
  }, [navigation, stopProgress]);
  const onProgress = useCallback((progress: number) => {
    setProgress(progress);
    return keepProgress.current;
  }, []);

  const isVaultCreated = useRef<boolean>(false);

  const signer = signers[0];
  if (!signer) throw new Error('signer unavailable');

  const confirm = useCallback(async () => {
    //While the vault was being created, maybe the internet went down.
    //So recheck before confirm.
    if (nsErrorMessage && (!apiReachable || !cBVaultsReaderAPIReachable)) {
      netToast(false, t('createVault.connectivityIssues'));
      goBack();
      return;
    }
    if (!vault) throw new Error('Unset vault cannot be confirmed');

    batchedUpdates(() => {
      setProgress(0);
      setConfirmRequested(true);
    });

    const { result: backedUp, status: backupStatus } = await netRequest({
      whenToastErrors: 'ON_ANY_ERROR',
      errorMessage: message => t('createVault.vaultBackupError', { message }),
      func: () =>
        p2pBackupVault({
          networkTimeout,
          vault,
          signer,
          cBVaultsWriterAPI,
          cBVaultsReaderAPI,
          onProgress,
          networkId
        })
    });
    if (backupStatus !== 'SUCCESS') {
      goBack();
      return;
    }
    if (backedUp === false) {
      //This means the user cancelled the backup process by stopping the
      //compression using onProgress
      goBack();
      return;
    }
    //This means the screen is not focussed anymore!?!?!
    //Don't proceed.
    if (!navigation.isFocused()) return;

    setProgress(1);
    //Pushes the vault and then updates:
    //  - Vaults and VaultsStatuses, discoveryExport local storage and
    //  - also derived data: utxosData and historyData
    const { status: pushAndUpdateStatus } = await netRequest({
      whenToastErrors: 'ON_ANY_ERROR',
      errorMessage: message => t('createVault.vaultPushError', { message }),
      func: () => pushVaultRegisterWTAndUpdateStates(vault)
    });

    if (pushAndUpdateStatus !== 'SUCCESS') {
      //The toast with prev error message will have been shown.
      goBack();
    } else {
      toast.show(t('createVault.vaultSuccess'), {
        type: 'success',
        duration: 4000
      });
      goBackToWalletHome();
    }
  }, [
    networkTimeout,
    apiReachable,
    cBVaultsReaderAPIReachable,
    nsErrorMessage,
    goBackToWalletHome,
    toast,
    netToast,
    signer,
    netRequest,
    vault,
    cBVaultsWriterAPI,
    cBVaultsReaderAPI,
    onProgress,
    networkId,
    t,
    navigation,
    goBack,
    pushVaultRegisterWTAndUpdateStates
  ]);

  useEffect(() => {
    //Run this effect only once (when it mounts)
    if (isVaultCreated.current === true) return;
    else isVaultCreated.current = true;

    if (!apiReachable || !cBVaultsReaderAPIReachable) {
      netToast(false, t('createVault.connectivityIssues'));
      goBackToWalletHome();
      return;
    }

    const create = async () => {
      //Leave some time so that the progress is rendered
      await sleep(200);
      if (!navigation.isFocused()) return; //Don't proceed if lost focus after await

      const unvaultKey = await getUnvaultKey();
      const { result } = await netRequest({
        whenToastErrors: 'ON_ANY_ERROR',
        errorMessage: message => t('createVault.fetchIssues', { message }),
        func: fetchServiceAddress
      });
      if (!navigation.isFocused()) return; //Don't proceed if lost focus after await
      if (!result) {
        //The toast with prev error message will have been shown.
        goBack();
        return;
      }
      const { address: serviceAddress, quiet } = result;
      setServiceAddressQuiet(quiet);
      const changeDescriptorWithIndex =
        await getNextChangeDescriptorWithIndex(accounts);
      if (!navigation.isFocused()) return; //Don't proceed if lost focus after await

      const { result: nextVaultData } = await netRequest({
        whenToastErrors: 'ON_ANY_ERROR',
        errorMessage: message => t('createVault.fetchIssues', { message }),
        func: () =>
          fetchP2PVaultIds({
            networkTimeout,
            signer,
            networkId,
            vaults,
            cBVaultsReaderAPI
          })
      });
      if (!navigation.isFocused()) return; //Don't proceed if lost focus after await
      if (!nextVaultData) {
        //The toast with prev error message will have been shown.
        goBack();
        return;
      }

      const serviceOutput = createServiceOutput(
        serviceAddress,
        networkMapping[networkId]
      );
      //createVault does not throw. It returns errors as strings:
      const vault = await createVault({
        vaultedAmount,
        unvaultKey,
        samples,
        feeRate,
        serviceFee,
        feeRateCeiling,
        maxFeeRateCeiling,
        coldAddress,
        changeDescriptorWithIndex,
        serviceOutput,
        lockBlocks,
        signer,
        utxosData,
        networkId,
        nextVaultId: nextVaultData.nextVaultId,
        nextVaultPath: nextVaultData.nextVaultPath,
        onProgress
      });
      if (!navigation.isFocused()) return; //Don't proceed if lost focus after await

      if (typeof vault === 'object') {
        batchedUpdates(() => {
          setVault(vault);
          setProgress(1);
        });
      } else {
        if (vault !== 'USER_CANCEL') {
          const errorMessage = t('createVault.unexpectedError', {
            message: vault
          });
          toast.show(errorMessage, { type: 'danger' });
        }
        goBack();
      }
    };
    create();
  }, [
    networkTimeout,
    apiReachable,
    cBVaultsReaderAPIReachable,
    navigation,
    goBackToWalletHome,
    netRequest,
    goBack,
    t,
    toast,
    netToast,
    vaultedAmount,
    serviceFee,
    coldAddress,
    feeRate,
    feeRateCeiling,
    maxFeeRateCeiling,
    getNextChangeDescriptorWithIndex,
    fetchServiceAddress,
    getUnvaultKey,
    lockBlocks,
    networkId,
    onProgress,
    pushVaultRegisterWTAndUpdateStates,
    samples,
    cBVaultsWriterAPI,
    cBVaultsReaderAPI,
    signer,
    vaults,
    utxosData,
    accounts
  ]);

  let vaultTxInfo;
  if (vault) {
    vaultTxInfo = vault.txMap[vault.vaultTxHex];
    if (!vaultTxInfo)
      throw new Error(`Vault txMap entry not set for vault ${vault.vaultId}`);
  }

  const formatAmount = useCallback(
    (amount: number) => {
      return formatBtc({
        amount,
        subUnit: settings.SUB_UNIT,
        btcFiat,
        locale,
        currency
      });
    },
    [settings.SUB_UNIT, locale, currency, btcFiat]
  );

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
          <View className="flex-1 justify-between gap-8">
            <Text className="text-base self-start">
              {t('createVault.intro')}
            </Text>
            <View className="flex-grow justify-center items-center">
              <Progress.Circle
                size={height <= 667 /*iPhone SE*/ ? 200 : 300}
                showsText={true}
                progress={progress}
              />
            </View>
            <Button onPress={stopProgress}>{t('cancelButton')}</Button>
          </View>
        ) : (
          //After the vault has been created:
          <>
            {!confirmRequested ? (
              <>
                <Text className="text-base mb-4">
                  {t('createVault.confirmBackupSendVault')}
                </Text>
                <View className="bg-gray-50 p-4 rounded-lg mb-4 android:elevation ios:shadow web:shadow gap-5">
                  {/* Amount */}
                  <View>
                    <Text className="text-base font-bold mb-1">
                      {t('createVault.amount')}
                    </Text>
                    <Text className="text-base">
                      {formatAmount(vault.vaultedAmount)}
                    </Text>
                  </View>

                  {/* Time Lock */}
                  <View>
                    <Text className="text-base font-bold mb-1">
                      {t('createVault.timeLock')}
                    </Text>
                    <Text className="text-base">
                      {formatBlocks(vault.lockBlocks, t, locale, true)}
                    </Text>
                  </View>

                  {/* Fees */}
                  {/*don't show fees if quiet*/}
                  {serviceAddressQuiet === false && (
                    <>
                      <View>
                        <Text className="text-base font-bold mb-1">
                          {t('createVault.miningFee')}
                        </Text>
                        <Text className="text-base">
                          {formatAmount(vaultTxInfo.fee)}
                        </Text>
                      </View>
                      <View>
                        <Text className="text-base font-bold mb-1">
                          {t('createVault.serviceFee')}
                        </Text>
                        <Text className="text-base">
                          {formatAmount(vault.serviceFee)}
                        </Text>
                      </View>
                    </>
                  )}

                  {/* Emergency Address */}
                  <View>
                    <Text className="text-base font-bold mb-1">
                      {t('createVault.emergencyAddress')}
                    </Text>
                    <Text className="text-base break-words">
                      {vault.coldAddress}
                    </Text>
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
            ) : (
              <>
                {progress !== 1 ? (
                  //when progress is 1 this means the backups has been done
                  //and now it's pushing the vault. Don't let the user
                  //cancel at this stage!!!
                  <>
                    <Text className="text-base">
                      {t('createVault.backupInProgress')}
                    </Text>
                    <View className="flex-grow justify-center items-center">
                      <Progress.Circle
                        size={height < 667 /*iPhone SE*/ ? 200 : 300}
                        showsText={true}
                        progress={progress}
                      />
                    </View>
                    <Button onPress={stopProgress}>{t('cancelButton')}</Button>
                  </>
                ) : (
                  <>
                    <Text className="text-base mb-12">
                      {t('createVault.pushingVault')}
                    </Text>
                    <ActivityIndicator size="large" />
                  </>
                )}
              </>
            )}
          </>
        )}
      </View>
    </KeyboardAwareScrollView>
  );
}
