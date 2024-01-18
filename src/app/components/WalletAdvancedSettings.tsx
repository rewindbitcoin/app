import React, { useState } from 'react';

import { View, StyleSheet, Pressable, ViewStyle } from 'react-native';
import {
  Modal,
  Text,
  HorLineSep,
  Theme,
  Switch,
  useTheme
} from '../../common/components/ui';
import Password from './Password';
import { useTranslation } from 'react-i18next';
import { LayoutAnimation } from 'react-native';
import AntDesign from '@expo/vector-icons/AntDesign';

export default ({ style }: { style: ViewStyle }) => {
  const { t } = useTranslation();
  const [passwordRequest, setPasswordRequest] = useState<boolean>(false);
  const [password, setPassword] = useState<string>();
  const [advanced, setAdvanced] = useState<boolean>(false);
  const [biometricalHelp, showBiometricalHelp] = useState<boolean>(false);
  const [passwordHelp, showPasswordHelp] = useState<boolean>(false);
  const [dataEncryptionHelp, showDataEncryptionHelp] = useState<boolean>(false);
  const theme: Theme = useTheme();
  const styles = getStyles(theme);
  const [value, setValue] = useState<boolean>(false);
  return (
    <View style={style}>
      <Pressable
        onPress={() => {
          setAdvanced(!advanced);
          //LayoutAnimation.spring();
          LayoutAnimation.configureNext({
            duration: 150,
            update: {
              type: LayoutAnimation.Types.linear,
              property: LayoutAnimation.Properties.opacity
            }
          });
        }}
      >
        <View style={[styles.header, advanced ? styles.title : styles.card]}>
          <Text style={advanced ? styles.titleText : {}}>
            {advanced
              ? t('wallet.advancedOptionsTitle').toUpperCase()
              : t('wallet.advancedOptionsTitle')}
          </Text>
          <AntDesign
            style={{
              ...styles.titleText,
              color: advanced
                ? theme.colors.primary
                : theme.colors.cardSecondary
            }}
            name={advanced ? 'close' : 'right'}
          />
        </View>
      </Pressable>
      <View style={advanced ? { ...styles.card } : {}}>
        {advanced && (
          <>
            <View style={{ ...styles.row }}>
              <View style={styles.textContainer}>
                <Text>{t('wallet.biomatricEncryptionTitle')}</Text>
                <Pressable
                  onPress={() => {
                    showBiometricalHelp(true);
                  }}
                >
                  <AntDesign name="infocirlceo" style={styles.icon} />
                </Pressable>
              </View>
              <Switch value={value} onValueChange={value => setValue(value)} />
            </View>
            <HorLineSep style={styles.lineSeparator} />
            <View style={styles.row}>
              <View style={styles.textContainer}>
                <Text>{t('wallet.usePasswordTitle')}</Text>
                <Pressable
                  onPress={() => {
                    showPasswordHelp(true);
                  }}
                >
                  <AntDesign name="infocirlceo" style={styles.icon} />
                </Pressable>
              </View>
              <Switch
                value={password !== undefined || passwordRequest}
                onValueChange={value => {
                  setPassword(undefined); //Reset the password
                  if (value)
                    //requestAnimationFrame: We allow the Switch element to
                    //transition from false to true.
                    //This is useful in android to prevent
                    //a glitch showing "greenish" default color in the switches
                    //for a fraction of a second. Don't show the modal in this
                    //same execution context because React Native will not call
                    //the inner Switch with the new color props we set in the
                    //internal Switch
                    //Also this helps with the autoFocus in the TextInput of
                    //the password. It was sometimes not poping the keyboard
                    //automatically before requestAnimationFrame
                    requestAnimationFrame(() => setPasswordRequest(true));
                }}
              />
              <Modal
                title={t('wallet.requestPasswordTitle')}
                closeButtonText={t('cancelButton')}
                icon={{ family: 'AntDesign', name: 'form' }}
                isVisible={passwordRequest}
                onClose={() => setPasswordRequest(false)}
              >
                <Password
                  onPassword={password => {
                    if (password !== undefined) {
                      console.log({ setPassword: password });
                      setPassword(password);
                    }
                  }}
                />
              </Modal>
            </View>
            <HorLineSep style={styles.lineSeparator} />
            <View style={styles.row}>
              <View style={styles.textContainer}>
                <Pressable
                  onPress={() => {
                    showDataEncryptionHelp(true);
                  }}
                >
                  <AntDesign name="infocirlceo" style={styles.icon} />
                </Pressable>
                <Text>{t('wallet.encryptAppDataTitle')}</Text>
              </View>
              <Switch />
            </View>
            <HorLineSep style={styles.lineSeparator} />
            <View style={styles.row}>
              <View style={styles.textContainer}>
                <AntDesign name="infocirlceo" style={styles.icon} />
                <Text>Network</Text>
              </View>
              <View>
                <Text>Bitcoin</Text>
              </View>
            </View>
          </>
        )}
      </View>
      <Modal
        title={t('wallet.biomatricEncryptionTitle')}
        icon={{ family: 'Ionicons', name: 'finger-print' }}
        isVisible={biometricalHelp}
        onClose={() => showBiometricalHelp(false)}
        closeButtonText={t('understoodButton')}
      >
        <Text>{t('help.biometric')}</Text>
      </Modal>
      <Modal
        title={'Password Protection'}
        icon={{
          family: 'MaterialCommunityIcons',
          name: 'form-textbox-password'
        }}
        isVisible={passwordHelp}
        onClose={() => showPasswordHelp(false)}
        closeButtonText={t('understoodButton')}
      >
        <Text>{t('help.password')}</Text>
      </Modal>
      <Modal
        title={t('wallet.encryptAppDataTitle')}
        icon={{
          family: 'FontAwesome5',
          name: 'database'
        }}
        isVisible={dataEncryptionHelp}
        onClose={() => showDataEncryptionHelp(false)}
        closeButtonText={t('understoodButton')}
      >
        <Text>
          This option secures your non-mnemonic app data, like vaults and UTXOs,
          using the XChaCha20-Poly1305 encryption algorithm with a special key.
          This key is created in a secure and deterministic way from your
          mnemonic. While leaking this app data won't compromise your funds, it
          could potentially expose your transaction patterns and addresses,
          affecting your anonymity. Bad actors could initiate operations like
          unvaulting or sending funds to a panic address. Encrypting this data
          ensures that even if it is accessed by unauthorized parties, they
          cannot read or misuse it. It's a recommended step for protecting your
          transactional privacy and preventing unwanted operations.
        </Text>
      </Modal>
    </View>
  );
};

const getStyles = (theme: Theme) => {
  const styles = StyleSheet.create({
    card: {
      overflow: 'hidden',
      borderRadius: 5,
      padding: 10,
      backgroundColor: theme.colors.card
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center'
    },
    title: {
      overflow: 'hidden',
      justifyContent: 'flex-start',
      padding: 10
    },
    titleText: {
      color: theme.colors.cardSecondary,
      marginLeft: 10,
      fontSize: 12,
      paddingVertical: 2
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center'
    },
    textContainer: {
      marginLeft: 20,
      flexDirection: 'row',
      alignItems: 'center'
    },
    icon: {
      marginLeft: 10,
      fontSize: 16,
      color: theme.colors.primary
    },
    lineSeparator: { marginLeft: 20 }
  });
  return styles;
};
