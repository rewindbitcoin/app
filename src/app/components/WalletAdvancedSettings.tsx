import React, { useState } from 'react';

import { View, StyleSheet, Pressable, ViewStyle } from 'react-native';
import {
  Modal,
  Switch,
  Text,
  theme,
  HorLineSep
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
  return (
    <View style={{ ...style, ...styles.container }}>
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
        <View style={[styles.header]}>
          <Text>Advanced Options</Text>
          <AntDesign
            color={
              advanced ? theme.colors.primary : theme.colors.listsSecondary
            }
            name={advanced ? 'close' : 'right'}
          />
        </View>
      </Pressable>
      <View style={{ overflow: 'hidden' }}>
        {advanced && (
          <>
            <View style={{ ...styles.row, marginTop: 15 }}>
              <View style={styles.textContainer}>
                <Pressable
                  onPress={() => {
                    showBiometricalHelp(true);
                  }}
                >
                  <AntDesign name="infocirlce" style={styles.icon} />
                </Pressable>
                <Text>Biometric Protection</Text>
              </View>
              <Switch />
            </View>
            <HorLineSep style={styles.lineSeparator} />
            <View style={styles.row}>
              <View style={styles.textContainer}>
                <Pressable
                  onPress={() => {
                    showPasswordHelp(true);
                  }}
                >
                  <AntDesign name="infocirlce" style={styles.icon} />
                </Pressable>
                <Text>Use Password</Text>
              </View>
              <Switch
                value={password !== undefined}
                onValueChange={value => {
                  value ? setPasswordRequest(value) : setPassword(undefined);
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
                    password !== undefined && setPassword(password);
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
                  <AntDesign name="infocirlce" style={styles.icon} />
                </Pressable>
                <Text>Encrypt App Data</Text>
              </View>
              <Switch />
            </View>
            <HorLineSep style={styles.lineSeparator} />
            <View style={styles.row}>
              <View style={styles.textContainer}>
                <AntDesign name="infocirlce" style={styles.icon} />
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
        title={'Biometric Encryption'}
        icon={{ family: 'Ionicons', name: 'finger-print' }}
        isVisible={biometricalHelp}
        onClose={() => showBiometricalHelp(false)}
        closeButtonText="Understood"
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
        closeButtonText="Understood"
      >
        <Text>
          With this feature, you can add a password to your mnemonic. Every time
          you access this wallet, you'll need to enter this password. This
          feature uses the XChaCha20-Poly1305 cipher, known for its robust
          protection. This extra step is particularly useful if you're not using
          biometric encryption, or if you want an additional security layer. If
          you're already using biometric encryption, this additional step might
          not be necessary.
        </Text>
      </Modal>
      <Modal
        title={'Encrypt App Data'}
        icon={{
          family: 'FontAwesome5',
          name: 'database'
        }}
        isVisible={dataEncryptionHelp}
        onClose={() => showDataEncryptionHelp(false)}
        closeButtonText="Understood"
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

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    padding: 10,
    borderRadius: 5
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  textContainer: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  icon: {
    marginRight: 10,
    fontSize: 16,
    color: theme.colors.primary
  },
  lineSeparator: { marginLeft: 26 }
});
