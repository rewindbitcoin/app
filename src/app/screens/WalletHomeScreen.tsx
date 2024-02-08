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
import { gzipSync } from 'fflate';
import { utf8ToBytes } from '@noble/ciphers/utils';
import { getManagedChacha } from '../../common/lib/cipher';

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
  const {
    getSerializedVaults,
    getCipherKey,
    btcFiat,
    signPsbt,
    syncBlockchain,
    syncingBlockchain
  } = context;

  const onRequestVaultsBackup = useCallback(() => {
    async function requestVault() {
      const strVaults = getSerializedVaults();
      const { cipherAddress, cipherKey } = await getCipherKey();
      const chacha = getManagedChacha(cipherKey);
      console.log({ cipherAddress, cipherKey });
      const cipheredVaults = chacha.encrypt(utf8ToBytes(strVaults));
      const compressedVaults = gzipSync(cipheredVaults);
      const fileName = `vaults-${Date.now()}.json.gz`;

      try {
        const response = await fetch('http://localhost:3000', {
          method: 'POST',
          body: compressedVaults,
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Data-ThunderDenID-V0': cipherAddress
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        console.log('Vaults data posted successfully');
      } catch (error) {
        console.error('Error posting vaults data:', error);
        return; // Stop execution if POST fails
      }

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
    }
    requestVault();
  }, [getSerializedVaults, getCipherKey]);

  console.log({ btcFiat, signPsbt, syncingBlockchain });

  // Use btcFiat, signPsbt, and any other data or functions provided by the context
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
        onPress={onRequestVaultsBackup}
      />
    </KeyboardAwareScrollView>
  );
};

export default WalletHomeScreen;
