//TODO: get some style stuff for the color
import React, {
  useContext,
  useEffect,
  useState,
  useRef,
  useMemo,
  useCallback
} from 'react';
import { WalletContext, WalletContextType } from '../contexts/WalletContext';
import { useTranslation } from 'react-i18next';
import { View, StyleSheet } from 'react-native';
import * as Progress from 'react-native-progress';
import { EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context';
import { createVault, type VaultSettings, type Vault } from '../lib/vaults';
import {
  defaultSettings,
  Settings,
  SETTINGS_GLOBAL_STORAGE
} from '../lib/settings';
import { useGlobalStateStorage } from '../../common/contexts/StorageContext';
import { SERIALIZABLE } from '../../common/lib/storage';
import {
  Button,
  Text,
  KeyboardAwareScrollView,
  Theme,
  useTheme
} from '../../common/ui';
import { p2pBackupVault } from '../lib/backup';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default function VaultCreate({
  vaultSettings,
  onVaultPushed
}: {
  vaultSettings: VaultSettings | undefined;
  onVaultPushed: (result: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = useMemo(() => getStyles(insets, theme), [insets, theme]);
  //TODO Use a proper Cancellable Modal
  const context = useContext<WalletContextType | null>(WalletContext);
  if (context === null) throw new Error('Context was not set');

  if (!vaultSettings) throw new Error('vaultSettings not set');
  const { amount, feeRate, lockBlocks, coldAddress } = vaultSettings;

  const {
    utxosData,
    network,
    getServiceAddress,
    getChangeDescriptor,
    getUnvaultKey,
    signers,
    processCreatedVault
  } = context;
  if (!utxosData || !network || !signers || !processCreatedVault)
    throw new Error('Missing data from context');
  const { t } = useTranslation();
  const keepProgress = useRef<boolean>(true);
  const [settings] = useGlobalStateStorage<Settings>(
    SETTINGS_GLOBAL_STORAGE,
    SERIALIZABLE,
    defaultSettings
  );
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

  const isVaultCreated = useRef<boolean>(false);
  useEffect(() => {
    if (isVaultCreated.current === true) return;
    else isVaultCreated.current = true;

    let isMounted = true;
    //Leave some time so that the progress is rendered
    const createAndNotifyVault = async () => {
      await sleep(200);

      const unvaultKey = await getUnvaultKey();
      const serviceAddress = await getServiceAddress(); //TODO: show error if network error
      const changeDescriptor = await getChangeDescriptor();

      console.log('TRACE createVault', {
        unvaultKey,
        serviceAddress,
        changeDescriptor
      });
      const signer = signers[0];
      if (!signer) throw new Error('signer unavailable');

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
        network,
        vaultCheckUrlTemplate: settings.CHECK_VAULT_URL_TEMPLATE,
        onProgress
      });

      if (typeof vault === 'object') {
        setVault(vault);
        //TODO: here now also show the progress, also it fhis fails then do
        //not proceed
        //TODO: Also there is a processCreatedVault that does stuff. integrate
        //both
        const backupResult = await p2pBackupVault({
          vault,
          signer,
          pushVaultUrlTemplate: settings.PUSH_VAULT_URL_TEMPLATE,
          fetchVaultUrlTemplate: settings.GET_VAULT_URL_TEMPLATE,
          onProgress,
          network
        });
        if (!backupResult)
          throw new Error("Could not backup the vault, won't proceed");

        //TODO: now this must do the backup on the server using holepunch!
        //It must pass the serviceAddress as an authorization (and for anti-spam)
        //The server must check in the mempool?
        if (isMounted) {
          //This updates Vaults And VaultsStatuses local
          //storage
          const result = await processCreatedVault(vault);
          //TODO: ask for confirmation, then:
          onVaultPushed(result);
        }
      }
    };
    createAndNotifyVault();
    return () => {
      isMounted = false;
    };
  }, [
    amount,
    coldAddress,
    feeRate,
    feeRateCeiling,
    getChangeDescriptor,
    getServiceAddress,
    getUnvaultKey,
    lockBlocks,
    network,
    onProgress,
    onVaultPushed,
    processCreatedVault,
    samples,
    settings.CHECK_VAULT_URL_TEMPLATE,
    settings.GET_VAULT_URL_TEMPLATE,
    settings.PUSH_VAULT_URL_TEMPLATE,
    settings.SERVICE_FEE_RATE,
    signers,
    utxosData
  ]);

  return (
    <KeyboardAwareScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.contentContainer}
    >
      <View style={styles.content}>
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
                style={styles.progressCircle}
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

const getStyles = (insets: EdgeInsets, theme: Theme) =>
  StyleSheet.create({
    contentContainer: { alignItems: 'center', paddingTop: 20 },
    content: {
      maxWidth: 500,
      marginHorizontal: theme.screenMargin,
      marginBottom: theme.screenMargin + insets.bottom
    },
    progressCircle: {}
  });
