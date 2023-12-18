import React from 'react';
import type { Props } from '../../screens';
import { View, Button, Text } from 'react-native';
import { clearAllAsync, STRING } from '../../lib/storage';
import { useLocalStateStorage } from '../../hooks/useLocalStateStorage';
import styles from '../../../styles/styles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
export default ({ navigation }: Props) => {
  const [mnemonic] = useLocalStateStorage<string>('mnemonic', STRING);
  const insets = useSafeAreaInsets();
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
      <Text style={styles.mnemonic}>MNEMOMIC ✍: {mnemonic}</Text>
      <View style={styles.factoryReset}>
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
