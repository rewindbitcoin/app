import React from 'react';

import { Text, Switch } from 'react-native';

export default () => {
  return (
    <>
      <Text>Enable Biometric Encryption for Mnemonic</Text>
      <Switch />
      <Text>Protect Mnemonic with a Password</Text>
      <Switch />
      <Text>Encrypt App Data from Mnemonic</Text>
      <Switch />
    </>
  );
};

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
