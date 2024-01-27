import React from 'react';
import { View, Platform } from 'react-native';
import { Text, Button, KeyboardAwareScrollView } from '../../common/ui';
import type { Wallet, Wallets, Signers } from '../lib/wallets';
import { SERIALIZABLE } from '../../common/lib/storage';
import { useLocalStateStorage } from '../../common/hooks/useLocalStateStorage';
import { getNetworkId } from '../lib/network';
import { networks } from 'bitcoinjs-lib';
import { defaultSettings } from '../lib/settings';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { IMPORT_WALLET } from '../screens';

const walletId = 0;

export default ({
  onWallet
}: {
  /** pass back signers if this is a new wallet that must be created */
  onWallet: (wallet: Wallet, newWalletSigners?: Signers) => void;
}) => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const [wallets, setWallets, isWalletsSynchd] = useLocalStateStorage<Wallets>(
    `WALLETS`,
    SERIALIZABLE
  );

  //TODO: here i need to make sure the signersStorageEngine read or created
  //matches this system specs
  //if it does not, then create a new signersStorageEngine and ask the user
  //to provide new signers
  //I will have: ImportWalletScreen, NewWalletScreen, RecoverSignersWalletScreen

  const handleNewTestingWallet = () => {
    console.log('handleNewTestingWallet', 'TODO');
    const masterFingerprint = 'TODO';
    if (isWalletsSynchd && !wallets?.[0]) {
      const wallet: Wallet = {
        creationEpoch: Math.floor(Date.now() / 1000),
        walletId,
        version: defaultSettings.WALLETS_DATA_VERSION,
        networkId: getNetworkId(networks.testnet),
        signersEncryption: 'NONE',
        signersStorageEngine: Platform.OS === 'web' ? 'IDB' : 'SECURESTORE',
        encryption: 'NONE'
      };
      setWallets({ [walletId]: wallet });
      const signerId = 0; //ThunderDen v1.0 has Only 1 signer anyway
      onWallet(wallet, {
        [signerId]: {
          masterFingerprint,
          type: 'SOFTWARE',
          mnemonic:
            'goat oak pull seek know resemble hurt pistol head first board better'
        }
      });
    }
  };
  const handleImportWallet = () => navigation.navigate(IMPORT_WALLET);

  //TODO: do the translation of all the t() below:
  return (
    <KeyboardAwareScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        //grow vertically to 100% and center child
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center'
      }}
    >
      {wallets &&
        Object.entries(wallets).map(([walletId, wallet]) => (
          <View
            style={{ borderWidth: 1, margin: 20, padding: 20 }}
            key={walletId}
          >
            <Text onPress={() => onWallet(wallet)}>
              {JSON.stringify(wallet, null, 2)}
            </Text>
          </View>
        ))}
      {isWalletsSynchd && !wallets?.[0] && (
        <Button mode="contained" onPress={handleNewTestingWallet}>
          {'Create Test Wallet'}
        </Button>
      )}
      <Button mode="native" onPress={handleImportWallet}>
        {t('wallets.importWalletButton')}
      </Button>
    </KeyboardAwareScrollView>
  );
};
