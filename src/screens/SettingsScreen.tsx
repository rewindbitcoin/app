import React from 'react';
import { View, Button, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import styles from '../../styles/styles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
export default () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const mnemonic = 'TODO'; //TODO - only for BIP32 wallets
  return (
    <View
      style={{
        ...styles.container,
        // Paddings to handle safe area
        // https://reactnavigation.org/docs/handling-safe-area
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        paddingLeft: insets.left,
        paddingRight: insets.right,
        alignItems: 'center'
      }}
    >
      <Text style={internalStyles.mnemonic}>MNEMOMIC ✍: {mnemonic}</Text>
      <Button title={t('closeButton')} onPress={navigation.goBack} />
    </View>
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
