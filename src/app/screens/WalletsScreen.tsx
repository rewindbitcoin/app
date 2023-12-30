import React from 'react';
import { ScrollView, Text, View, Button } from 'react-native';
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
  onWalletSelectOrCreate
}: {
  onWalletSelectOrCreate: (
    wallet: Wallet,
    /** pass back signers if this is a new wallet that must be created */
    newWalletSigners?: Signers
  ) => void;
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
        version: defaultSettings.WALLETS_DATA_VERSION,
        networkId: getNetworkId(networks.testnet),
        encryptionKeyInput: 'NONE'
      };
      setWallets({ [walletId]: wallet });
      onWalletSelectOrCreate(wallet, [
        {
          type: 'SOFTWARE',
          mnemonic:
            'goat oak pull seek know resemble hurt pistol head first board better'
        }
      ]);
    }
  };
  const handleImportWallet = () => navigation.navigate(IMPORT_WALLET);

  //TODO: do the translation of all the t() below:
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={
        //This is the "inner" style
        {
          flexGrow: 1, //grow vertically to 100% and center child
          justifyContent: 'center'
        }
      }
    >
      {wallets &&
        Object.entries(wallets).map(([walletId, wallet]) => (
          <View>
            <Text key={walletId} onPress={() => onWalletSelectOrCreate(wallet)}>
              {walletId}
            </Text>
          </View>
        ))}
      <Button title={t('wallets.newWalletButton')} onPress={handleNewWallet} />
      <Button
        title={t('wallets.importWalletButton')}
        onPress={handleImportWallet}
      />
    </ScrollView>
  );
};
