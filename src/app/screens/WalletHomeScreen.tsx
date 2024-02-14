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
//import { gzipSync, strFromU8 } from 'fflate';

const THUNDER_DEN_CIPHER_ADDITIONAL_DATA = 'Thunder Den Vault Backup';

//This works:
import sodium from 'react-native-libsodium';
//plugins need: ["react-native-libsodium", {}],

//Alternative: https://sodium-friends.github.io/docs/docs/getstarted
//const sodium = require('sodium-native');

//https://doc.libsodium.org/secret-key_cryptography/aead/chacha20-poly1305/xchacha20-poly1305_construction
//
//https://github.com/ammarahm-ed/react-native-gzip
//and gzip Async for web
//https://github.com/hayr-hotoca/react-native-chacha20-poly1305

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
      //const chacha = getManagedChacha(cipherKey);
      console.log({ cipherAddress, cipherKey });

      //TODO: get rid of noble ciphers if libsodium works - UNINSTALL
      //Uses /dev/urandom in iOS and Android:
      //https://libsodium.gitbook.io/doc/generating_random_data
      //https://stackoverflow.com/a/13055641
      const cipherStartTime = Date.now();

      const nonce = sodium.randombytes_buf(
        sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
      );
      //const nonce = Buffer.alloc(
      //  sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
      //);
      //sodium.randombytes_buf(nonce);

      if (
        cipherKey.length !== sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES
      )
        throw new Error(
          `cipherKey length is ${cipherKey.length} != ${sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES}`
        );

      const rawCipheredVaults =
        sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
          strVaults,
          THUNDER_DEN_CIPHER_ADDITIONAL_DATA, //additional data that can be verified (this is not encoded)
          null, //secret nonce
          nonce, //public nonce
          cipherKey,
          'uint8array' //Result type
        );

      //const message = Buffer.from(strVaults);
      //const rawCipheredVaults = Buffer.alloc(
      //  message.length + sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES
      //);

      //sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      //  rawCipheredVaults,
      //  message,
      //  Buffer.from(THUNDER_DEN_CIPHER_ADDITIONAL_DATA), //additional data that can be verified (this is not encoded)
      //  null, //secret nonce
      //  nonce, //public nonce
      //  cipherKey
      //);
      // Prepend the nonce to the rawCipheredVaults
      const cipheredVaults = new Uint8Array(
        nonce.length + rawCipheredVaults.length
      );
      cipheredVaults.set(nonce, 0);
      cipheredVaults.set(rawCipheredVaults, nonce.length);
      //https://github.com/serenity-kit/react-native-libsodium/blob/main/example/src/tests/crypto_aead_xchacha20poly1305_ietf_decrypt_test.ts

      //const cipheredVaults = chacha.encrypt(utf8ToBytes(strVaults));
      console.log('Cipher Time:', Date.now() - cipherStartTime, 'ms');

      //let compressedVaults;
      //const gzipStartTime = Date.now();
      //if (Platform.OS === 'android' || Platform.OS === 'ios') {
      //  compressedVaults = gzipSync(cipheredVaults); //This works
      //} else {
      //  compressedVaults = gzipSync(cipheredVaults);
      //}
      //console.log('Gzip Time:', Date.now() - gzipStartTime, 'ms');

      const fileName = `vaults-${Date.now()}.json.xch20`;

      console.log(`Sending ${cipheredVaults.byteLength / 1024 / 1024} MB`);
      try {
        const response = await fetch(
          Platform.select({
            android: 'http://10.0.2.2:3000',
            default: 'http://localhost:3000'
          }),
          {
            method: 'POST',
            body: cipheredVaults,
            headers: {
              'Content-Type': 'application/octet-stream',
              'X-Data-ThunderDenID-V0': cipherAddress
            }
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        console.log('Vaults data posted successfully');
      } catch (error) {
        console.error('Error posting vaults data:', error);
        return; // Stop execution if POST fails
      }

      if (Platform.OS === 'web') {
        const blob = new Blob([cipheredVaults], {
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
          Buffer.from(cipheredVaults).toString('base64'),
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
