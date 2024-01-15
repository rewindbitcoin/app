import React, { useState } from 'react';

import { View, StyleSheet, Pressable, ViewStyle } from 'react-native';
import { Switch, Text, theme, HorLineSep } from '../../common/components/ui';
import { LayoutAnimation } from 'react-native';
import AntDesign from '@expo/vector-icons/AntDesign';
import { useToast } from '../../common/components/Toast';

export default ({ style }: { style: ViewStyle }) => {
  const [advanced, setAdvanced] = useState<boolean>(false);
  const toast = useToast();
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
                    toast.show(
                      "This option enables biometric encryption to secure your mnemonic. It uses your device's biometric features like fingerprint or (strong) face recognition. Please note, if your biometric data changes (like adding a new fingerprint), the system will invalidate the encryption key, making the mnemonic unreadable. In such cases, you'll need to re-enter the mnemonic. This measure ensures that only you can access your wallet.",
                      {
                        duration: 0
                      }
                    );
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
                <AntDesign name="infocirlce" style={styles.icon} />
                <Text>Set Password</Text>
              </View>
              <Switch />
            </View>
            <HorLineSep style={styles.lineSeparator} />
            <View style={styles.row}>
              <View style={styles.textContainer}>
                <AntDesign name="infocirlce" style={styles.icon} />
                <Text>Encrypt App Data</Text>
              </View>
              <Switch />
            </View>
          </>
        )}
      </View>
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

/*
 *
 * This option enables biometric encryption to secure your mnemonic. It uses your device's biometric features like fingerprint or (strong) face recognition. Please note, if your biometric data changes (like adding a new fingerprint), the system will invalidate
the encryption key, making the mnemonic unreadable. In such cases, you'll need to re-enter the mnemonic. This measure ensures that only you can access your wallet.
 */
/*
 * With this feature, you can add a password to your mnemonic. Every time you access this wallet, you'll need to enter this password. This feature uses the XChaCha20-Poly1305 cipher, known for its robust protection. This extra step is particularly useful if you're not using biometric encryption, or if you want an additional security layer. If you're already using biometric encryption, this additional step might not be necessary.
 */
/*
 * This option secures your non-mnemonic app data, like vaults and UTXOs, using the XChaCha20-Poly1305 encryption algorithm with a special key. This key is created in a secure and deterministic way from your mnemonic. While leaking this app data won't compromise your funds, it could potentially expose your transaction patterns and addresses, affecting your anonymity. Bad actors could initiate operations like unvaulting or sending funds to a panic address. Encrypting this data ensures that even if it is accessed by unauthorized parties, they cannot read or misuse it.
 * It's a recommended step for protecting your transactional privacy and preventing unwanted operations.
 */
