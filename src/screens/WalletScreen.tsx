import React, { useContext } from 'react';
import { Text } from 'react-native';
import { WalletContext, WalletContextType } from '../contexts/WalletContext';

const WalletScreen = () => {
  const context = useContext<WalletContextType | null>(WalletContext);

  if (context === null) {
    throw new Error('Context was not set');
  }
  const { btcFiat, signPsbt } = context;

  console.log({ btcFiat, signPsbt });

  // Use btcFiat, signPsbt, and any other data or functions provided by the context
  // ...

  return <Text>WalletScreen</Text>;
};

export default WalletScreen;
