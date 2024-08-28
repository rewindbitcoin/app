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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default function CreateVaultScreen({
  vaultSettings,
  onVaultPushed
}: {
  vaultSettings: VaultSettings | undefined;
  onVaultPushed: () => void;
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
    pushVaultAndUpdateStates,
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
    !pushVaultAndUpdateStates ||
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
  const [vault, setVault] = useState<Vault>();
  const onProgress = useCallback((progress: number) => {
    setProgress(progress);
    return keepProgress.current;
  }, []);
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
  useEffect(() => {
    if (!apiReachable || !api2Reachable) goWalletHome();
  }, [apiReachable, api2Reachable, goWalletHome]);

  const isVaultCreated = useRef<boolean>(false);
  useEffect(() => {
    if (isVaultCreated.current === true) return;
    else isVaultCreated.current = true;

    //Leave some time so that the progress is rendered
    const createAndNotifyVault = async () => {
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

      const signer = signers[0];
      if (!signer) throw new Error('signer unavailable');

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
      if (!navigation.isFocused()) return; //Don't proceed if lost focus after await

      //TODO: ask for confirmation, then:
      if (typeof vault === 'object') {
        setVault(vault);
        //TODO: here now also show the progress, also it this fails then do
        //not proceed
        //TODO: Also there is a pushVaultAndUpdateStates that does stuff. integrate
        //both
        //TODO: this status must be checked to see if continue
        await netRequest({
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

        if (!navigation.isFocused()) return; //Don't proceed after async op if unmounted - TODO: here we backup up the vault but then never pushed it, shoudn't the push be done by Rewind servers?

        //Updates Vaults And VaultsStatuses local storage
        await pushVaultAndUpdateStates(vault); //TODO: netRequest this shit because the push may have failed - even if this failed, note that
        //TODO: if failed then run a modal (don't toas since this is important)
        //and explain that no sweats here since the backup worked fine and if the
        //tx is pushed you're just fine. If not, retry.
        //TODO: toast succesfully backup up and pushed.
        onVaultPushed();
      } else {
        if (vault !== 'USER_CANCEL') {
          const errorMessage = t('createVault.error', { message: vault });
          toast.show(errorMessage, { type: 'danger' });
        }
        goBack();
      }
    };
    createAndNotifyVault();
  }, [
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
    onVaultPushed,
    pushVaultAndUpdateStates,
    samples,
    vaultsAPI,
    vaultsSecondaryAPI,
    settings.SERVICE_FEE_RATE,
    signers,
    vaults,
    utxosData
  ]);

  return (
    <KeyboardAwareScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="flex-1"
    >
      <View className="self-center pt-5 max-w-lg w-full mx-4" style={mbStyle}>
        {vault ? (
          <>
            <Button
              onPress={() => {
                keepProgress.current = false;
              }}
            >
              {t('confirmButton')}
            </Button>
          </>
        ) : (
          <>
            <Text variant="headlineSmall" style={{ alignSelf: 'flex-start' }}>
              {t('createVault.subTitle')}
            </Text>
            <Text style={{ marginVertical: 20, alignSelf: 'flex-start' }}>
              {t('createVault.intro')}
            </Text>
            <View
              style={{
                flexGrow: 1,
                justifyContent: 'center',
                alignItems: 'center'
              }}
            >
              <Progress.Circle
                size={300}
                showsText={true}
                progress={progress}
              />
            </View>
            <Button
              onPress={() => {
                keepProgress.current = false;
              }}
            >
              {t('cancelButton')}
            </Button>
          </>
        )}
      </View>
    </KeyboardAwareScrollView>
  );
}
