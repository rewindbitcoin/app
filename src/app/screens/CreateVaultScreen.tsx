//TODO: when generating a new address there is a time lapse too long on the
//Modal. Check what's going on.
import React, {
  useEffect,
  useState,
  useRef,
  useMemo,
  useCallback
} from 'react';
import { useWallet } from '../hooks/useWallet';
import { useTranslation } from 'react-i18next';
import { useWindowDimensions, View } from 'react-native';
import * as Progress from 'react-native-progress';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createVault, type VaultSettings, type Vault } from '../lib/vaults';
import { useSettings } from '../hooks/useSettings';
import {
  Button,
  Text,
  KeyboardAwareScrollView,
  useToast,
  ActivityIndicator
} from '../../common/ui';
import { p2pBackupVault, fetchP2PVaultIds } from '../lib/backup';
import { useNavigation } from '@react-navigation/native';
import { useNetStatus } from '../hooks/useNetStatus';
import { NavigationPropsByScreenId, WALLET_HOME } from '../screens';
import { batchedUpdates } from '~/common/lib/batchedUpdates';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default function CreateVaultScreen({
  vaultSettings
}: {
  vaultSettings: VaultSettings | undefined;
}) {
  if (!vaultSettings) throw new Error('vaultSettings not set');
  const { vaultedAmount, feeRate, lockBlocks, coldAddress } = vaultSettings;

  const height = useWindowDimensions().height;

  const insets = useSafeAreaInsets();
  const mbStyle = useMemo(() => ({ marginBottom: insets.bottom }), [insets]);
  const {
    utxosData,
    networkId,
    fetchServiceAddress,
    getChangeDescriptor,
    getUnvaultKey,
    signers,
    vaultPushAndUpdateStates,
    vaults,
    vaultsAPI,
    vaultsSecondaryAPI,
    wallet
  } = useWallet();

  if (
    !wallet ||
    !utxosData ||
    !networkId ||
    !signers ||
    !vaultPushAndUpdateStates ||
    !vaultsAPI ||
    !vaultsSecondaryAPI
  )
    throw new Error('Missing data from context');
  const walletId = wallet.walletId;
  const {
    netRequest,
    apiReachable,
    api2Reachable,
    errorMessage: nsErrorMessage
  } = useNetStatus();
  const { t } = useTranslation();
  const toast = useToast();
  const navigation = useNavigation<NavigationPropsByScreenId['CREATE_VAULT']>();
  const keepProgress = useRef<boolean>(true);
  const { settings } = useSettings();
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );
  // We know settings are the correct ones in this Component
  const [progress, setProgress] = useState<number>(0);
  const [confirmRequested, setConfirmRequested] = useState<boolean>(false);
  const [vault, setVault] = useState<Vault>();

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

  const samples = settings.SAMPLES;
  const feeRateCeiling = settings.PRESIGNED_FEE_RATE_CEILING;

  const goBack = useCallback(() => {
    //goBack will unmount this screen as per react-navigation docs.
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation]);
  const goBackToWalletHome = useCallback(() => {
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

  const isVaultCreated = useRef<boolean>(false);

  const signer = signers[0];
  if (!signer) throw new Error('signer unavailable');

  const confirm = useCallback(async () => {
    //While the vault was being created, maybe the internet went down.
    //So recheck before confirm.
    if (nsErrorMessage && (!apiReachable || !api2Reachable)) {
      toast.show(t('createVault.connectivityIssues'), { type: 'warning' });
      goBack();
      return;
    }
    if (!vault) throw new Error('Unset vault cannot be confirmed');

    batchedUpdates(() => {
      setProgress(0);
      setConfirmRequested(true);
    });

    const { result: backedUp, status: backupStatus } = await netRequest({
      func: () =>
        p2pBackupVault({
          vault,
          signer,
          vaultsAPI,
          vaultsSecondaryAPI,
          onProgress,
          networkId
        }),
      errorMessage: t('createVault.vaultBackupError')
    });
    if (backupStatus !== 'SUCCESS') {
      //The toast with prev error message will have been shown.
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
      func: () => vaultPushAndUpdateStates(vault),
      errorMessage: t('createVault.vaultPushError')
    });

    if (pushAndUpdateStatus !== 'SUCCESS') {
      //The toast with prev error message will have been shown.
      goBack();
    } else {
      toast.show(t('createVault.vaultSuccess'), { type: 'success' });
      goBackToWalletHome();
    }
  }, [
    apiReachable,
    api2Reachable,
    nsErrorMessage,
    goBackToWalletHome,
    toast,
    signer,
    netRequest,
    vault,
    vaultsAPI,
    vaultsSecondaryAPI,
    onProgress,
    networkId,
    t,
    navigation,
    goBack,
    vaultPushAndUpdateStates
  ]);

  useEffect(() => {
    //Run this effect only once (when it mounts)
    if (isVaultCreated.current === true) return;
    else isVaultCreated.current = true;

    if (!apiReachable || !api2Reachable) {
      toast.show(t('createVault.connectivityIssues'), { type: 'warning' });
      goBackToWalletHome();
      return;
    }

    const create = async () => {
      //Leave some time so that the progress is rendered
      await sleep(200);
      if (!navigation.isFocused()) return; //Don't proceed if lost focus after await

      const unvaultKey = await getUnvaultKey();
      const { result: serviceAddress } = await netRequest({
        func: fetchServiceAddress,
        errorMessage: t('createVault.connectivityIssues')
      });
      if (!navigation.isFocused()) return; //Don't proceed if lost focus after await
      if (!serviceAddress) {
        //The toast with prev error message will have been shown.
        goBack();
        return;
      }
      const changeDescriptor = await getChangeDescriptor();
      if (!navigation.isFocused()) return; //Don't proceed if lost focus after await

      const { result: nextVaultData } = await netRequest({
        func: () =>
          fetchP2PVaultIds({
            signer,
            networkId,
            vaults,
            vaultsAPI
          }),
        errorMessage: t('createVault.connectivityIssues')
      });
      if (!navigation.isFocused()) return; //Don't proceed if lost focus after await
      if (!nextVaultData) {
        //The toast with prev error message will have been shown.
        goBack();
        return;
      }

      //createVault does not throw. It returns errors as strings:
      const vault = await createVault({
        vaultedAmount,
        unvaultKey,
        samples,
        feeRate,
        serviceFeeRate: settings.SERVICE_FEE_RATE,
        feeRateCeiling,
        coldAddress,
        changeDescriptor,
        serviceAddress,
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
          const errorMessage = t('createVault.error', { message: vault });
          toast.show(errorMessage, { type: 'danger' });
        }
        goBack();
      }
    };
    create();
  }, [
    apiReachable,
    api2Reachable,
    navigation,
    goBackToWalletHome,
    netRequest,
    goBack,
    t,
    toast,
    vaultedAmount,
    coldAddress,
    feeRate,
    feeRateCeiling,
    getChangeDescriptor,
    fetchServiceAddress,
    getUnvaultKey,
    lockBlocks,
    networkId,
    onProgress,
    vaultPushAndUpdateStates,
    samples,
    vaultsAPI,
    vaultsSecondaryAPI,
    settings.SERVICE_FEE_RATE,
    signer,
    vaults,
    utxosData
  ]);

  return (
    <KeyboardAwareScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="flex-1"
    >
      <View
        className="flex-1 self-center max-w-lg w-full px-4 py-4 mobmed:py-8"
        style={mbStyle}
      >
        {!vault ? (
          //Initial view:
          <View className="flex-1 justify-between">
            <Text className="self-start">{t('createVault.intro')}</Text>
            <View className="flex-grow justify-center items-center">
              <Progress.Circle
                size={height < 667 /*iPhone SE*/ ? 200 : 300}
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
                <Text className="mb-8 mobmed:mb-12">
                  {t('createVault.confirmBackupSendVault')}
                </Text>
                <Text className="mb-8 mobmed:mb-12">
                  {t(
                    `TODO: mining fee: ${vault.vaultFee} - serviceFee: ${vault.serviceFee}`
                  )}
                </Text>
                <View className="items-center gap-6 flex-row justify-center">
                  <Button onPress={goBack}>{t('cancelButton')}</Button>
                  <Button onPress={confirm}>{t('confirmButton')}</Button>
                </View>
              </>
            ) : (
              <>
                {progress !== 1 ? (
                  //when progress is 1 this means the backups has been done
                  //and now it's pushing the vault. Don't let the user
                  //cancel at this stage!!!
                  <>
                    <Text>{t('createVault.backupInProgress')}</Text>
                    <View className="flex-grow justify-center items-center">
                      <Progress.Circle
                        size={300}
                        showsText={true}
                        progress={progress}
                      />
                    </View>
                    <Button onPress={stopProgress}>{t('cancelButton')}</Button>
                  </>
                ) : (
                  <>
                    <Text className="mb-12">
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
