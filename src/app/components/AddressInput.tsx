import React, { useState, useMemo, useCallback } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import {
  TextInput,
  Text,
  useTheme,
  Theme,
  IconButton,
  InfoButton,
  Modal
} from '../../common/ui';
import { useTranslation } from 'react-i18next';
import Bip39 from './Bip39';

function AddressInput() {
  const [address, setAddress] = useState<string>('');
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);
  const [showNewAddress, setShowNewAddress] = useState<boolean>(false);
  const handleNewAddress = useCallback(() => setShowNewAddress(true), []);
  const handleCloseNewAddress = useCallback(() => setShowNewAddress(false), []);
  const [words, setWords] = useState<string[]>([
    'december',
    'abandon',
    'abandon',
    'abandon',
    'abandon',
    'abandon',
    'abandon',
    'abandon',
    'abandon',
    'abandon',
    'abandon',
    'about'
  ]);
  const onWords = useCallback((words: Array<string>) => {
    setWords(words);
  }, []);
  return (
    <View>
      <View style={styles.cardHeader}>
        <Text variant="cardTitle" className="px-2 text-left">
          {t('addressInput.coldAddress.label')}
        </Text>
        <InfoButton />
      </View>
      <View style={styles.inputWrapper}>
        <TextInput
          enablesReturnKeyAutomatically
          placeholder={t('addressInput.coldAddress.textInputPlaceholder')}
          autoComplete="off"
          spellCheck={false}
          autoCorrect={false}
          autoCapitalize="none"
          maxLength={100}
          onChangeText={address => setAddress(address)}
          value={address}
          style={styles.input}
        />
        <View className="py-1 ml-4">
          <IconButton
            text={t('addressInput.scan')}
            iconFamily="MaterialCommunityIcons"
            iconName="qrcode-scan"
          />
        </View>
        <View className="py-1 ml-4">
          <IconButton
            text={t('addressInput.coldAddress.createNewButton')}
            onPress={handleNewAddress}
            iconFamily="MaterialCommunityIcons"
            iconName="wallet-plus-outline"
          />
        </View>
      </View>
      <Modal
        isVisible={showNewAddress}
        title={t('addressInput.coldAddress.createNewModalTitle')}
        icon={{
          family: 'Ionicons',
          name: 'wallet'
        }}
        onClose={handleCloseNewAddress}
      >
        <Text>{t('addressInput.coldAddress.createNewModalText')}</Text>
        <Bip39 readonly onWords={onWords} words={words} />
      </Modal>
    </View>
  );
}

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    cardHeader: {
      marginBottom: theme.screenMargin / 2,
      flexDirection: 'row',
      alignItems: 'center'
    },
    inputWrapper: {
      paddingVertical: 4,
      borderRadius: 5,
      flexDirection: 'row',
      paddingHorizontal: 8,
      paddingLeft: 16,
      alignItems: 'center',
      backgroundColor: theme.colors.card
    },
    input: {
      flex: 1,
      ...Platform.select({
        //clean style for web browsers
        web: {
          outlineStyle: 'none'
        }
      }),
      borderWidth: 0,
      padding: 8,
      paddingLeft: 0,
      borderRadius: 5
    }
  });
export default React.memo(AddressInput);
