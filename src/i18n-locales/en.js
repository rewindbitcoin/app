//Treat this as a golrified json with comments & multi-line using string literals
export default {
  app: {
    networkError:
      'Oops! There was a network issue: {{message}}. Please check your connection and try again.',
    newWalletTitle: 'New Wallet',
    thunderDenTitle: 'Thunder Den',
    mainTitle: 'Wallets',
    createVaultTitle: 'Creating Vault',

    walletTitle: 'Wallet',
    settingsButton: 'Settings',
    settingsTitle: 'Settings',
    btcRatesError:
      'Unable to retrieve current BTC rates. The displayed amounts in {{currency}} may not be accurate.',
    feeEstimatesError:
      'Unable to retrieve accurate fee estimates. Displayed transaction target times and fee amounts may be incorrect.',
    secureStorageAuthenticationPrompt:
      "Please authenticate to access your wallet's sensitive data."
  },
  wallets: {
    addNew: 'Add New',
    importWalletButton: 'Import Wallet',
    mainWallet: 'Main Wallet',
    testWallet: 'Test Wallet',
    noRealValue: 'No Real Value',
    //As in Created on January 19, 2010
    createdOn: 'Created on',
    walletId: 'Wallet {{id}}'
  },
  wallet: {
    optionalSetPasswordTitle: `Enhance Your Wallet's Security`,
    focedSetPasswordTitle: 'Create a new Password',
    forcedSetPasswordText: `Please set a new password (8-32 characters).

If you ever lose or forget your password, you can still recover your wallet\
 using your mnemonic recovery phrase.`,
    optionalSetPasswordText: `Your environment does not support biometric encryption,\
 such as fingerprint or face recognition. To enhance the security of your wallet, we recommend setting a password.

This is optional, but it will help protect your assets in case your device is lost or compromised.\
 You can choose to skip this step, but remember, securing your wallet is crucial for your peace of mind and asset safety.`,
    skipOptionalSetPasswordButton: 'Continue Without Password',
    setPasswordButton: 'Set Password',

    requestPasswordTitle: `Enter Wallet's Password`,
    requestPasswordButton: `Enter Password`,
    requestPasswordText: `Please enter the wallet's password to continue.

If you've forgotten the password for your wallet, you can create a new wallet using your recovery phrase to regain access.`,
    advancedOptionsTitle: 'Advanced Options',
    usePasswordTitle: 'Use Password',
    biometricEncryptionTitle: 'Biometric Encryption',
    encryptAppDataTitle: 'Encrypt App Data',
    networkTitle: 'Network',
    importButton: 'Import',
    createNonRealBtcButton: 'Create Test Wallet',
    createRealBtcButton: 'Create Wallet',
    importNonRealBtcButton: 'Import Test Wallet',
    importRealBtcButton: 'Import Wallet',
    testingWalletInfo: 'This wallet will not use real Bitcoin.',
    realWalletWarning: 'Real Bitcoin wallets currently discouraged.'
  },
  walletHome: {
    delegateReadme: `For immediate action, open this file at:
https://rescue.thunderden.com

Introduction:
You have been given this file because you are trusted to assist in
the event of unauthorized vault access, aiming to protect the owner’s
Bitcoin funds from theft or extortion. Use it wisely and verify the
threat before proceeding.

Recovery Steps:
If unauthorized transactions are threatening the assets, this document
allows you to cancel those transactions, ensuring the security of the funds.

VERIFY OWNER’S RISK STATUS BEFORE ACTING.

Usage Instructions:
1. Automated Recovery:
   For a simplified process, visit https://rescue.thunderden.com.

2. Manual Recovery:
   This file contains a recovery transaction map. Each index in this map
   corresponds to a transaction ID that might have initiated the
   unauthorized vault release. Your task is to identify which transaction ID
   started the unvaulting process.
   Associated with each transaction ID, you will find an array of possible
   transactions that can cancel this unvaulting, effectively reversing the
   unauthorized access.
   - To manually cancel an unauthorized release, locate the initiating
     transaction ID, then select and push one of the provided cancellation
     transactions using a blockchain explorer with an appropriate fee rate
     for the current network conditions.
   - Remember, all these steps can be handled automatically by using the
     online tool at https://rescue.thunderden.com, which simplifies
     the identification and cancellation process`
  },
  network: {
    testOn: 'Test on {{networkId}}',
    realBitcoin: 'Use real Bitcoin',
    testOrRealTitle: 'Test or Real Bitcoin',
    testOrRealSubTitle:
      'Select your network: experiment safely on test networks or proceed with real Bitcoin.',
    help: {
      stormNetworkBrief:
        "Test risk-free on ThunderDen's own test network, mirroring real Bitcoin. Receive tokens at setup and more on request.",
      testnetNetworkBrief:
        'A public network for Bitcoin testing. Obtaining Testnet tokens can be challenging.',
      bitcoinNetworkBrief:
        'The real Bitcoin network. Not recommended for use while this App is in early phases.',
      regtestNetworkBrief: 'Specifically for developer use.'
    }
  },
  help: {
    biometric: `Utilizes biometric features,\
 like fingerprint or facial recognition, to encrypt and securely store your\
 recovery phrase in this device. This ensures it is accessible only by you.

Please note, if your biometric data changes (like\
 adding a new fingerprint), the system will invalidate the encryption\
 key, making the mnemonic recovery phrase unreadable. In such cases, you'll need to\
 re-enter the mnemonic. This measure ensures that only you can access\
 your wallet.`,
    password: `Setting a password encrypts your mnemonic recovery phrase, providing a secure\
 layer of protection for your wallet.

Each time you access the wallet, you will\
 need to enter this password to decrypt the mnemonic phrase.`,
    passwordWithBiometric: `If you have biometric encryption enabled, a password\
 may not be necessary as biometrics already offer robust security.`,
    encryptAppData: `This option encrypts your non-mnemonic data, like vaults and transaction details,\
 shielding your transaction patterns and addresses from potential exposure, preserving your anonymity.

While leaking this data wouldn't compromise your funds, encrypting it\
 ensures that even if it is accessed by unauthorized parties, they won't be able\
 to discern how you use your wallet, such as your spending habits or whom you transact with.

The encryption uses the XChaCha20-Poly1305 algorithm, with a key that’s securely\
 derived from your mnemonic recovery phrase.`,
    network: `ThunderDen provides a choice between testing environments and the real Bitcoin network (via Advanced Settings).

The currently recommended option is Storm, ThunderDen's own test network. Storm mirrors Bitcoin's real functionality and allows you to explore Send/Receive and Vaulting operations safely, offering free tokens for practice.

While the app is in early development, we advise against using real Bitcoin for any significant transactions.`
  },
  vaultSetup: {
    title: 'Vault Set Up',
    subTitle: 'Secure Your Bitcoin',
    intro:
      'Customize your Vault. Select the amount to secure and your preferred protection timelock.',
    notEnoughFundsTitle: 'Vault Minimum Requirement',
    introMoreHelp: 'Learn More About Vaults',
    notEnoughFunds:
      '<group>ThunderDen establishes a minimum vaulting amount.\nThis assumes express transaction confirmations and the possibility of ultra-high network fees when unvaulting.</group><group><strong>Suggested Addition:</strong> Add about {{missingFunds}} to reach the vaulting minimum.\nNote that the exact vaultable amount might slightly differ due to changes in network fee conditions.</group>',
    amountLabel: 'Vault Amount',
    securityLockTimeLabel: 'Theft Protection Time Lock',
    securityLockTimeDescription: 'Available {{blocks}} after Unvault',
    confirmationSpeedLabel: 'Vault Creation Speed',
    lockTimeError: 'Pick a valid Lock Time.',
    feeRateError: 'Pick a valid Fee Rate.',
    amountError: 'Pick a valid amount of Btc.',
    invalidValues: 'Invalid Values.',
    reduceVaultAmount:
      'Faster vault creation fees reduce maximum to {{amount}}',
    days: 'days',
    blocks: 'blocks',
    feeRate: 'sats/vB',
    vaultAllFundsShortBadge: 'All Funds'
  },
  createVault: {
    subTitle: 'Finalizing Your Vault',
    intro: `We're now generating tailored transactions to minimize future fees.\
 It may take around 30 secs, slightly longer on older devices.\


 Next, you'll get to review and confirm everything.`
  },
  editableSlider: {
    maxValueError: 'Maximum is {{maximumValue}}',
    minValueError: 'Minimum is {{minimumValue}}',
    invalidValue: 'Invalid Value'
  },
  timeEstimate: {
    minutes_one: '{{formattedCount}} min',
    minutes_other: '{{formattedCount}} mins',
    hours_one: '{{formattedCount}} hour',
    hours_other: '{{formattedCount}} hours',
    days_one: '{{formattedCount}} day',
    days_other: '{{formattedCount}} days'
  },
  btcFormat: {
    btc: '{{value}} BTC',
    sats_one: '{{value}} sat',
    sats_other: '{{value}} sats',
    mbtc: '{{value}} mBTC',
    bits_one: '{{value}} bit',
    bits_other: '{{value}} bits'
  },
  feeRate: {
    waitingForRates: 'Waiting for BTC/{{currency}} rates...',
    waitingForEstimates: 'Waiting for fee estimates...',
    fee: 'Fee: {{amount}}',
    confirmationTime: 'Confirms in ~{{blocks}}',
    mayNotConfirm: 'May Never Confirm',
    expressConfirmation: 'Express Confirmation'
  },
  bip39: {
    chooseImport: 'Want to import instead?',
    chooseNew: 'Need to create a new wallet?',
    importWalletText: 'Restore Your Wallet',
    importWalletSubText:
      'Enter the mnemonic recovery phrase you saved when you first set up your wallet. This restores access to your existing wallet and its funds.',
    createWalletText: 'Your New Wallet Awaits',
    createWalletSubText:
      "Below is your wallet's recovery phrase. Think of it as your password to the Bitcoin network. It's crucial for accessing your wallet if you switch devices or loose/damage your current one. Write it down and keep it somewhere safe.",
    segmented12: '12 Words',
    segmented24: '24 Words',
    selectWordsLength: 'Number of words:',
    enterMnemonicText: 'Word #{{wordNumber}}:',
    importWalletButton: 'Import Wallet',
    invalidErrorMessage:
      'The word sequence you entered is not valid. Please double-check your words for any errors.',
    confirmTitle: 'Phrase Verification',
    //This will be rendered as subTitle in a Modal. In iphone 4 and small devices this should not go
    //over 3 lines of text:
    //    confirmText: `Enter the recovery phrase for verification.\
    // This confirms you've noted it correctly and your wallet can be recovered.`,
    confirmText: `Re-enter your recovery phrase to verify you've recorded it accurately, ensuring wallet recoverability.`,
    testingWalletsCanSkip: 'Non-real Bitcoin wallets can skip this step.'
  },
  amount: {
    maxLabel: 'All Funds'
  },
  units: {
    preferredUnitTitle: 'Preferred Unit'
  },
  addressInput: {
    coldAddress: {
      label: 'Emergency Address',
      createNewButton: 'Create',
      createNewModalTitle: 'Create new Address',
      createNewModalText: '',
      textInputPlaceholder: 'Enter or Create an Address'
    },
    recipientAddress: {
      label: 'Recipient Address',
      textInputPlaceholder: "Enter recipient's address"
    },
    scan: 'Scan'
  },
  continueButton: 'Continue',
  okButton: 'OK',
  verifyButton: 'Verify',
  skipButton: 'Skip',
  confirmButton: 'Confirm',
  saveButton: 'Save',
  cancelButton: 'Cancel',
  closeButton: 'Close',
  understoodButton: 'Undestood',
  factoryResetButton: 'Factory Reset',
  learnMore: 'Learn More.'
};
