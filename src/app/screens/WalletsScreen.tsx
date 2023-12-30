import React, { useEffect } from 'react';
import { ScrollView, Text } from 'react-native';
import type { Wallet, Wallets, Signers } from '../lib/wallets';
import { SERIALIZABLE } from '../../common/lib/storage';
import { useLocalStateStorage } from '../../common/hooks/useLocalStateStorage';
import { getNetworkId } from '../lib/network';
import { networks } from 'bitcoinjs-lib';
import { defaultSettings } from '../lib/settings';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const [wallets, setWallets, isWalletsSynchd] = useLocalStateStorage<Wallets>(
    `WALLETS`,
    SERIALIZABLE
  );
  //TODO: Only do this ONCE while building the app and debuggin to init stuff
  useEffect(() => {
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
  }, [isWalletsSynchd, wallets]);
  //TODO: This is a hacky way to assume only one wallet (this is ok for the
  //moment while having not developped the multi-wallet version)
  useEffect(() => {
    const wallet = wallets && wallets[0];
    if (wallet) onWalletSelectOrCreate(wallet);
  }, [wallets]);

  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={
        //This is the outer style
        { paddingBottom: insets.bottom }
      }
      contentContainerStyle={
        //This is the "inner" style
        {
          flexGrow: 1, //grow vertically to 100% and center child
          justifyContent: 'center'
        }
      }
    >
      <Text>Wallets</Text>
    </ScrollView>
  );
};
