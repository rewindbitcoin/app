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
import { getManagedChacha } from '../../common/lib/cipher';
import { gunzipSync, strFromU8 } from 'fflate';

const submitServer = Platform.select({
  android: 'http://10.0.2.2:3000',
  default: 'http://localhost:3000'
});

const verifyServer = Platform.select({
  android: 'http://10.0.2.2:4000',
  default: 'http://localhost:4000'
});

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
      const { cipherId, cipherKey } = await getCipherKey();

      console.log({ cipherId, cipherKey: cipherKey.toString('hex') });

      const gzipStartTime = Date.now();

      const compressedVaults = compressData(
        strVaults,
        256 * 1024, //chunks of 256 KB
        (progress: number) => {
          console.log({ progress });
          return false; //true if user wants to cancel
        }
      );
      if (!compressedVaults) throw new Error('Impossible to compress vaults');
      console.log(
        `compressedVaults size ${compressedVaults.length / 1024 / 1024} MB`
      );
      console.log(`strVaults size ${strVaults.length / 1024 / 1024} MB`);

      console.log('Gzip Time:', Date.now() - gzipStartTime, 'ms');

      const chacha = getManagedChacha(cipherKey);

      const cipheredCompressedVaults = chacha.encrypt(compressedVaults);
      console.log(
        `cipheredCompressedVaults size ${cipheredCompressedVaults.length / 1024 / 1024} MB`
      );

      console.log(
        `Sending ${cipheredCompressedVaults.byteLength / 1024 / 1024} MB`
      );
      try {
        const response = await fetch(submitServer, {
          method: 'POST',
          body: cipheredCompressedVaults,
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Data-ThunderDen-BackupId': cipherId
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        console.log('Vaults data posted successfully');

        console.log(`Verifying backup on: ${verifyServer}/data/${cipherId}`);
        const verify = await fetch(`${verifyServer}/data/${cipherId}`);
        if (!verify.ok)
          throw new Error(
            `HTTP error! cannot verify backup status: ${verify.status}`
          );
        const verifyCompressedVaults = chacha.decrypt(
          new Uint8Array(await verify.arrayBuffer())
        );
        console.log(
          `verifyCompressedVaults size ${verifyCompressedVaults.length / 1024 / 1024} MB`
        );
        const verifyVaults = gunzipSync(verifyCompressedVaults);
        console.log(
          `verifyVaults size ${verifyVaults.length / 1024 / 1024} MB`
        );
        console.log(
          `verifyVaults === strVaults: ${strFromU8(verifyVaults) === strVaults}`
        );
      } catch (error) {
        console.error('Error posting vaults data:', error);
        return; // Stop execution if POST fails
      }

      const fileName = `${cipherId}.json.gz`;
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
        console.log(`Deleting ${filePath}`);
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
