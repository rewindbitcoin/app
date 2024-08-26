import React from 'react';
import { Button, Text, StyleSheet } from 'react-native';
import { KeyboardAwareScrollView } from '../../common/ui';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
export default () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const mnemonic = 'TODO'; //TODO: - only for BIP32 wallets
  return (
    <KeyboardAwareScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        flexGrow: 1, //grow vertically to 100% and center child
        justifyContent: 'center',
        alignItems: 'center'
      }}
    >
      <Text style={internalStyles.mnemonic}>MNEMOMIC ✍: {mnemonic}</Text>
      <Button title={t('closeButton')} onPress={navigation.goBack} />
    </KeyboardAwareScrollView>
  );
};

const internalStyles = StyleSheet.create({
  mnemonic: {
    marginTop: 40,
    marginBottom: 40,
    marginRight: 20,
    marginLeft: 20,
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DADADA',
    backgroundColor: '#F5F5F5',
    textAlign: 'center',
    fontSize: 16,
    color: '#333'
  }
});
