import React, { useContext } from 'react';
import { ScrollView, RefreshControl, Button } from 'react-native';
import { WalletContext, WalletContextType } from '../contexts/WalletContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import styles from '../styles/styles';

//TODO the WalletProvider must also pass it's own refreshing state
const WalletHomeScreen = ({
  onSetUpVaultInit
}: {
  onSetUpVaultInit: () => void;
}) => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const context = useContext<WalletContextType | null>(WalletContext);

  if (context === null) {
    throw new Error('Context was not set');
  }
  const { btcFiat, signPsbt, syncBlockchain, syncingBlockchain } = context;

  console.log({ btcFiat, signPsbt, syncingBlockchain });

  // Use btcFiat, signPsbt, and any other data or functions provided by the context
  // ...

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={{
        ...styles.container,
        // Paddings to handle safe area
        // https://reactnavigation.org/docs/handling-safe-area
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        paddingLeft: insets.left,
        paddingRight: insets.right
      }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
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
    </ScrollView>
  );
};

export default WalletHomeScreen;
