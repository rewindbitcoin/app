import React from 'react';
import { Text, View, Button } from 'react-native';
import { KeyboardAwareScrollView } from '../../common/components/KeyboardAwareScrollView';
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

  const handleNewWallet = () => {
    console.log('handleNewWallet', 'TODO');
    if (isWalletsSynchd && !wallets?.[0]) {
      const wallet: Wallet = {
        walletId,
        creationEpoch: Math.floor(Date.now() / 1000),
        version: defaultSettings.WALLETS_DATA_VERSION,
        networkId: getNetworkId(networks.testnet),
        signersEncryption: 'NONE',
        encryption: 'NONE'
      };
      setWallets({ [walletId]: wallet });
      const signerId = 0;
      onWallet(wallet, {
        [signerId]: {
          signerId: signerId,
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
      contentContainerStyle={
        //This is the "inner" style
        {
          flexGrow: 1, //grow vertically to 100% and center child
          justifyContent: 'center',
          backgroundColor: 'transparent'
        }
      }
      style={{ backgroundColor: 'transparent' }}
    >
      {wallets &&
        Object.entries(wallets).map(([walletId, wallet]) => (
          <View key={walletId}>
            <Text onPress={() => onWallet(wallet)}>{walletId}</Text>
          </View>
        ))}
      <Button title={t('wallets.newWalletButton')} onPress={handleNewWallet} />
      <Button
        title={t('wallets.importWalletButton')}
        onPress={handleImportWallet}
      />
    </KeyboardAwareScrollView>
  );
};
