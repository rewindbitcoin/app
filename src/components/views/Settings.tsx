import React from 'react';
import { View, Button, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { clearAllAsync, STRING } from '../../lib/storage';
import { useLocalStateStorage } from '../../hooks/useLocalStateStorage';
import styles from '../../../styles/styles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
export default () => {
  const [mnemonic] = useLocalStateStorage<string>('mnemonic', STRING);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { t } = useTranslation();
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
      <View style={internalStyles.factoryReset}>
        <Button
          title={t('factoryResetButton')}
          onPress={async () => {
            await clearAllAsync();
            //TODO: Home should be reset somehow now just by getting all cleared
            //if (discovery) await discovery.getExplorer().close();
            //await init();
          }}
        />
      </View>
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
  },
  factoryReset: { marginTop: 20, marginBottom: 40 },
  wrapper: {
    width: '100%'
  }
});
