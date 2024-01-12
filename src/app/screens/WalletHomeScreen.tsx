import React, { useContext } from 'react';
import { RefreshControl, Button } from 'react-native';
import { KeyboardAwareScrollView } from '../../common/components/KeyboardAwareScrollView';
import { WalletContext, WalletContextType } from '../contexts/WalletContext';
import { useTranslation } from 'react-i18next';

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
  const { btcFiat, signPsbt, syncBlockchain, syncingBlockchain } = context;

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
    </KeyboardAwareScrollView>
  );
};

export default WalletHomeScreen;
