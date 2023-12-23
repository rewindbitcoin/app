import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import type { Wallet, Wallets, Signers } from '../../lib/wallets';
import { SERIALIZABLE } from '../../lib/storage';
import { useLocalStateStorage } from '../../hooks/useLocalStateStorage';
import { getNetworkId } from '../../lib/network';
import { networks } from 'bitcoinjs-lib';
import { defaultSettings } from '../../lib/settings';

const walletId = 0;

export default ({
  onWallet
}: {
  onWallet: (
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
      onWallet(wallet, [
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
    if (wallet) onWallet(wallet);
  }, [wallets]);

  return (
    <View>
      <Text>Wallets</Text>
    </View>
  );
};
