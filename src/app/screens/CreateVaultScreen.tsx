//TODO: test what happens if the user disables wifi and then clicks on create vault
//  It shoudl fail for not being able to get servcieAddress and goHome after toas
//  Problem is i get the toast for the lack of connectivity plus the error:
//  errorMessage: app.fetchServiceAddressError
//TODO: test what happens if the user disables wifi and then clicks on confirm
import React, {
  useEffect,
  useState,
  useRef,
  useMemo,
  useCallback
} from 'react';
import { useWallet } from '../hooks/useWallet';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import * as Progress from 'react-native-progress';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createVault, type VaultSettings, type Vault } from '../lib/vaults';
import { useSettings } from '../hooks/useSettings';
import {
  Button,
  Text,
  KeyboardAwareScrollView,
  useToast
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
  const { amount, feeRate, lockBlocks, coldAddress } = vaultSettings;

  const insets = useSafeAreaInsets();
  const mbStyle = useMemo(
    () => ({ marginBottom: 16 + insets.bottom }),
    [insets]
  );
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
  const { netRequest, apiReachable, api2Reachable } = useNetStatus();
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
  const onProgress = useCallback(
    (progress: number) => {
      setProgress(progress);
      if (!navigation.isFocused()) keepProgress.current = false;
      return keepProgress.current;
    },
    [navigation]
  );
  const samples = settings.SAMPLES;
  const feeRateCeiling = settings.PRESIGNED_FEE_RATE_CEILING;

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation]);
  const goWalletHome = useCallback(() => {
    //navigation.navigate beahves as if doing a navigation.pop(2)
    //So goBack from WALLET_HOME agter goWalletHome will still go to
    //WALLETS
    navigation.navigate(WALLET_HOME, { walletId });
  }, [navigation, walletId]);

  //TODO: this below is a problem if the internet suddenly disconnects
  //while doing some vault progress. the user is completelly disoriened
  //useEffect(() => {
  //  if (!apiReachable || !api2Reachable) goWalletHome();
  //}, [apiReachable, api2Reachable, goWalletHome]);

  const isVaultCreated = useRef<boolean>(false);

  const signer = signers[0];
  if (!signer) throw new Error('signer unavailable');

  const confirm = useCallback(async () => {
    setConfirmRequested(true);
    if (!vault) throw new Error('Unset vault cannot be confirmed');
    //TODO: here now also show the progress, also it this fails then do
    //not proceed
    //TODO: Also there is a vaultPushAndUpdateStates that does stuff. integrate
    //both
    //TODO: this status must be checked to see if continue
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
      requirements: { apiReachable: true, api2Reachable: true },
      errorMessage: t('createVault.p2pBackupVaultError')
    });
    if (backupStatus !== 'SUCCESS') {
      //requirements not met or failure. Errors are toasted already.
      //TODO: when !requirements is not met then the toast may be shown in a
      //completelly different moment... maybe i should toast even more
      goBack();
      return;
    }
    if (backedUp === false && backupStatus === 'SUCCESS') {
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
      requirements: { apiReachable: true },
      //TODO: en.js update with createVault.p2pPushVaultError - explain that no
      //sweats here since the backup worked fine and if the
      //tx is pushed you're just fine. If not, retry.
      errorMessage: t('createVault.p2pPushVaultError')
    });

    if (pushAndUpdateStatus === 'SUCCESS') {
      toast.show(t('createVault.vaultSuccess'), { type: 'success' });
      goWalletHome();
    } else {
      //requirements not met or failure. Errors are toasted already.
      //TODO: when !requirements is not met then the toast may be shown in a
      //completelly different moment... maybe i should toast even more
      goBack();
    }
  }, [
    goWalletHome,
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
    if (isVaultCreated.current === true) return;
    else isVaultCreated.current = true;

    if (!apiReachable || !api2Reachable) {
      goWalletHome();
      return;
    }

    //Leave some time so that the progress is rendered
    const create = async () => {
      await sleep(200);
      if (!navigation.isFocused()) return; //Don't proceed if lost focus after await

      const unvaultKey = await getUnvaultKey();
      const { result: serviceAddress } = await netRequest({
        func: fetchServiceAddress,
        requirements: { apiReachable: true },
        errorMessage: t('app.fetchServiceAddressError')
      });
      if (!navigation.isFocused()) return; //Don't proceed if lost focus after await
      if (!serviceAddress) {
        goWalletHome();
        return;
      }
      const changeDescriptor = await getChangeDescriptor();
      if (!navigation.isFocused()) return; //Don't proceed if lost focus after await

      //TODO:: fetchP2PVaultIds should not be in a netRequest??? its a fetch!
      const { nextVaultId, nextVaultPath } = await fetchP2PVaultIds({
        signer,
        networkId,
        vaults,
        vaultsAPI
      });
      if (!navigation.isFocused()) return; //Don't proceed if lost focus after await

      const vault = await createVault({
        amount,
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
        nextVaultId,
        nextVaultPath,
        onProgress
      });
      //Don't proceed if lost focus after await
      if (navigation.isFocused()) {
        if (typeof vault === 'object') {
          batchedUpdates(() => {
            setVault(vault);
            setProgress(0);
          });
        } else {
          if (vault !== 'USER_CANCEL') {
            //TODO: does this toast make sense goven the other notifications??
            const errorMessage = t('createVault.error', { message: vault });
            toast.show(errorMessage, { type: 'danger' });
          }
          //TODO: goBack here? i think so but make surem this is for usercancel
          goBack();
        }
      }
    };
    create();
  }, [
    apiReachable,
    api2Reachable,
    navigation,
    goWalletHome,
    netRequest,
    goBack,
    t,
    toast,
    amount,
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

  const stopProgress = useCallback(() => {
    keepProgress.current = false;
  }, []);

  return (
    <KeyboardAwareScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="flex-1"
    >
      <View className="self-center pt-5 max-w-lg w-full mx-4" style={mbStyle}>
        {vault ? (
          <>
            {progress !== 1 ? (
              <>
                <Text>
                  TODO: backing up the vault and checlking the backup is ok
                </Text>
                <View className="flex-grow justify-center items-center">
                  <Progress.Circle
                    size={300}
                    showsText={true}
                    progress={progress}
                  />
                </View>
              </>
            ) : (
              <Text>TODO: hold on a bit more here. pushing the vault...</Text>
            )}
            {!confirmRequested ? (
              <>
                <Button onPress={goBack}>{t('cancelButton')}</Button>
                <Button onPress={confirm}>{t('confirmButton')}</Button>
              </>
            ) : (
              progress !== 1 && (
                //when progress is 1 this means the backups has been done
                //and now it's pushing the vault. Don't let the user
                //cancel at this stage!!!
                <Button onPress={stopProgress}>{t('cancelButton')}</Button>
              )
            )}
          </>
        ) : (
          <>
            <Text variant="headlineSmall" style={{ alignSelf: 'flex-start' }}>
              {t('createVault.subTitle')}
            </Text>
            <Text style={{ marginVertical: 20, alignSelf: 'flex-start' }}>
              {t('createVault.intro')}
            </Text>
            <View className="flex-grow justify-center items-center">
              <Progress.Circle
                size={300}
                showsText={true}
                progress={progress}
              />
            </View>
            <Button onPress={stopProgress}>{t('cancelButton')}</Button>
          </>
        )}
      </View>
    </KeyboardAwareScrollView>
  );
}
