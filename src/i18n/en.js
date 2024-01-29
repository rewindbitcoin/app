//Treat this as a golrified json with comments & multi-line using string literals
export default {
  app: {
    networkError:
      'Oops! There was a network issue: {{message}}. Please check your connection and try again.',
    importWalletTitle: 'Wallet Recovery',
    thunderDenTitle: 'Thunder Den',
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
    importWalletButton: 'Import Wallet'
  },
  wallet: {
    requestPasswordTitle: 'Create a new Password',
    requestPasswordText: `Please set a new password (8-32 characters).

If you ever lose or forget your password, you can still recover your wallet\
 using your mnemonic phrase.`,
    advancedOptionsTitle: 'Advanced Options',
    usePasswordTitle: 'Use Password',
    biomatricEncryptionTitle: 'Biometric Encryption',
    encryptAppDataTitle: 'Encrypt App Data',
    importButton: 'Import'
  },
  help: {
    biometric: `This option enables biometric encryption to secure your\
 mnemonic. It uses your device's biometric features like fingerprint or\
 face recognition.

Please note, if your biometric data changes (like\
 adding a new fingerprint), the system will invalidate the encryption\
 key, making the mnemonic unreadable. In such cases, you'll need to\
 re-enter the mnemonic. This measure ensures that only you can access\
 your wallet.`,
    password: `Setting a password encrypts your mnemonic, providing a secure\
 layer of protection for your wallet. Each time you access the wallet, you will\
 need to enter this password to decrypt the mnemonic.

If you have biometric encryption enabled, a password may not be necessary as\
 biometrics already offer robust security. However, opting for a password in\
 addition to biometrics is available if you seek an even higher level of security.`
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
    securityLockTimeDescription: 'Accessible {{blocks}} after Unvaulting',
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
    importWalletText: 'Restore Access to Your Wallet',
    importWalletSubText:
      'Recover your wallet by entering the series of words you received during initial setup.',
    segmented12: '12 Words',
    segmented24: '24 Words',
    selectWordsLength: 'Number of words:',
    enterMnemonicText: 'Word #{{wordNumber}}:',
    importWalletButton: 'Import Wallet',
    invalidErrorMessage:
      'The word sequence you entered is not valid. Please double-check your words for any errors.'
  },
  amount: {
    maxLabel: 'All Funds'
  },
  units: {
    preferredUnitTitle: 'Preferred Unit'
  },
  continueButton: 'Continue',
  okButton: 'OK',
  confirmButton: 'Confirm',
  saveButton: 'Save',
  cancelButton: 'Cancel',
  closeButton: 'Close',
  understoodButton: 'Undestood',
  factoryResetButton: 'Factory Reset'
};
