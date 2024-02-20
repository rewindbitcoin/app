import React, { useCallback, useContext } from 'react';
import { RefreshControl, Button, Platform } from 'react-native';
import { KeyboardAwareScrollView } from '../../common/ui';
import { WalletContext, WalletContextType } from '../contexts/WalletContext';
import { useTranslation } from 'react-i18next';
import {
  documentDirectory,
  writeAsStringAsync,
  deleteAsync,
  EncodingType
} from 'expo-file-system';
import { shareAsync } from 'expo-sharing';
import { compressData } from '../../common/lib/compress';

//TODO the WalletProvider must also pass it's own refreshing state
const WalletHomeScreen = ({
  onSetUpVaultInit
}: {
  onSetUpVaultInit: () => void;
}) => {
  const { t } = useTranslation();
  const context = useContext<WalletContextType | null>(WalletContext);

  if (context === null) {
    throw new Error('Context was not set');
  }
  const { getSerializedVaults, btcFiat, syncBlockchain, syncingBlockchain } =
    context;

  const onRequestVaultBackup = useCallback(() => {
    async function requestVault(): Promise<boolean> {
      const strVault = getSerializedVaults();

      const compressedVaults = compressData(
        strVault,
        256 * 1024, //chunks of 256 KB
        (progress: number) => {
          console.log({ progress });
          return false; //true if user wants to cancel
        }
      );
      if (!compressedVaults) {
        return false;
        //TODO: toast throw new Error('Impossible to compress vaults');
      }

      const fileName = `vaults.json.gz`;
      if (Platform.OS === 'web') {
        const blob = new Blob([compressedVaults], {
          type: 'application/octet-stream'
        });
        const url = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = fileName;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(url);
      } else {
        const filePath = `${documentDirectory}${fileName}`;
        await writeAsStringAsync(
          filePath,
          Buffer.from(compressedVaults).toString('base64'),
          {
            encoding: EncodingType.Base64
          }
        );
        await shareAsync(filePath);
        await deleteAsync(filePath);
      }
      return true;
    }
    requestVault();
  }, [getSerializedVaults]);

  console.log({ btcFiat, syncingBlockchain });

  // Use btcFiat, and any other data or functions provided by the context
  // ...

  return (
    <KeyboardAwareScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        flexGrow: 1, //grow vertically to 100% and center child
        justifyContent: 'center',
        alignItems: 'center'
      }}
      refreshControl={
        <RefreshControl
          refreshing={syncingBlockchain}
          onRefresh={syncBlockchain}
        />
      }
    >
      <Button
        title={
          //TODO: translate
          syncingBlockchain ? t('Refreshing Balance…') : t('Refresh Balance')
        }
        onPress={syncBlockchain}
        disabled={syncingBlockchain}
      />
      <Button
        title={
          //TODO: translate
          t('Vault Balance')
        }
        onPress={onSetUpVaultInit}
      />
      <Button
        title={
          //TODO: translate
          t('Backup Vaults')
        }
        onPress={onRequestVaultBackup}
      />
    </KeyboardAwareScrollView>
  );
};

export default WalletHomeScreen;
