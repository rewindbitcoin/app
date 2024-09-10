//Treat this as a golrified json with comments & multi-line using string literals
//TODO: Emergency Addres <-> Rewind Address?
//TODO: recovery phrase or Recovery Phrase - be consistent
export default {
  app: {
    unknownError: 'An unknown error occurred.',
    networkError: `Oops! There was a network issue: {{message}}.
Please check your connection and try again.`,
    syncError: `Oops! There was a problem updating your Wallet: {{message}}.
Please check your connection and tap on refresh to try again.`,
    pushError: `Oops! There was a problem submitting your transaction. Please check your connection and try again.


Technical error: {{message}}`,
    pushTimeoutError:
      'Oops! It seems the recently submitted transaction is taking longer to be detected. Please check your connection and refresh your wallet. If it does not show up, try submitting it again.',
    newWalletTitle: 'New Wallet',
    mainTitle: 'Wallets',
    createVaultTitle: 'Creating Vault',

    walletTitle: 'Wallet',
    settingsButton: 'Settings',
    settingsTitle: 'Settings',
    feeEstimatesError: `Unable to retrieve up-to-date fee estimates. Fee amounts may be slightly off.`,
    tipStatusError:
      'Unable to retrieve the latest blockchain block. The displayed data may not be up-to-date.',
    btcRatesError:
      'Unable to retrieve current BTC rates. The displayed amounts in {{currency}} may not be accurate.',
    //blockchainDataError:
    //  'Unable to retrieve up-to-date blockchain data. Transaction times and fee amounts may be slightly off. Please check your internet connection. Retrying in 60 seconds and will notify you if the problem persists.',
    secureStorageAuthenticationPrompt:
      "Please authenticate to access your wallet's sensitive data."
  },
  netStatus: {
    internetNotReachableWarning:
      'No Internet connection detected. This prevents checking wallet status, managing vaults, and sending or receiving funds.',
    apiNotReachableWarning:
      'Unable to connect to our services. This affects Bitcoin price updates and prevents vault operations due to disrupted backups.',
    blockchainExplorerNotReachableWarning:
      'Unable to connect to the blockchain explorer. This prevents updating the status of your transactions and accessing up-to-date information on the Bitcoin network.',
    blockchainMainnetExplorerNotReachableWarning:
      'Unable to connect to the blockchain explorer. This prevents updating the status of your transactions and accessing up-to-date information on the Bitcoin network.',
    connectionRestoredInfo:
      'Connectivity restored. All wallet features are now fully operational.'
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
    receive: 'Receive',
    send: 'Send',
    freeze: 'Freeze',
    optionalSetPasswordTitle: `Protect Wallet`,
    focedSetPasswordTitle: 'Set New Password',
    forcedSetPasswordText: `Please set a new password (8-32 characters).

If you ever forget your password, you can recover your wallet\
 using your mnemonic recovery phrase.`,
    optionalSetPasswordText: `We suggest setting a password to boost your wallet's security.

Though optional, a password safeguards your assets,\
 especially on platforms where biometric encryption cannot be used.`,
    //Important: skipOptionalSetPasswordButton + setPasswordButton should not use
    //more than ~30 chars combined
    skipOptionalSetPasswordButton: `Don't Use Password`,
    setPasswordButton: 'Set Password',

    requestPasswordTitle: `Enter Password`,
    requestPasswordButton: `Enter Password`,
    requestPasswordText: `Please enter the wallet's password to continue.

If you've forgotten the password for your wallet, you can create a new wallet using your recovery phrase to regain access.`,
    advancedOptionsTitle: 'Advanced Options',
    usePasswordTitle: 'Use Password',
    biometricEncryptionTitle: 'Biometric Encryption',
    passwordProtectionTitle: 'Password Protection',
    encryptAppDataTitle: 'Encrypt App Data',
    networkTitle: 'Network',
    importButton: 'Import',
    createNonRealBtcButton: 'Create Test Wallet',
    createRealBtcButton: 'Create Wallet',
    importNonRealBtcButton: 'Import Test Wallet',
    importRealBtcButton: 'Import Wallet',
    testingWalletInfo: 'This wallet will not use real Bitcoin.',
    realWalletWarning: 'Real Bitcoin wallets currently discouraged.',
    creatingWallet: `⚡ Building your Rewind Wallet...

Zapping bytes and lining up the bits. Hang tight!`,
    errors: {
      biometricsUncapableTitle: 'Wallet Setup Issue',
      biometricsUncapable: `The biometric implementation on your device has\
 issues, which are particularly common in Samsung models but can also occur in\
 other brands. To help us improve, please report your device model to Rewind\
 Support.

Since biometrics cannot be used, the wallet creation process needs to be adjusted.\
 We recommend recreating your wallet using a password instead. To do this,\
 please disable biometrics and select a password under Advanced Options when\
 setting up your wallet.`,
      storageTitle: 'Storage Access Error',
      storage: `There was an error reading from or writing to your device's\
 storage. This issue may be due to corrupt data, insufficient storage space,\
 or other storage-related problems. Please note that all your wallet data is\
 securely backed up in an encrypted format on Rewinds's P2P network.

To resolve this issue, please try accessing your wallet again. If the problem\
 persists, you can safely recreate your wallet using your mnemonic recovery\
 phrase. This will restore all your data securely from the backups.

If you need further assistance, please contact Rewind Support.`
    },
    vault: {
      hideButton: 'Hide',
      rescueButton: 'Rescue',
      delegateButton: 'Delegate',
      triggerUnfreezeButton: 'Init Unfreeze',
      vaultTitle: 'Vault {{vaultNumber}}',
      vaultDate: 'Created on {{date}}',
      amountFrozen: 'Amount Frozen',
      amountBeingUnfrozen: 'Amount Being Unfrozen',
      unfrozenAmount: 'Unfrozen Amount',
      rescuedAmount: 'Rescued Amount',
      frozenAmount: 'Amount Frozen: {{amount}}.',
      confirming: 'Confirming',
      confirmed: 'Confirmed',

      //pushedTrigger: 'An unfreeze request was made on {{triggerPushDate}}.',
      pushedTriggerNotConfirmed: 'Unfreeze requested on {{triggerPushDate}}.',
      //confirmedTrigger: 'Unfreeze countdown began on {{triggerConfirmedDate}}.',
      confirmedTrigger:
        'The {{lockTime}} countdown began on {{triggerConfirmedDate}}.',
      //triggerWithEstimatedDate:
      //  'The estimated unfreeze date is {{estimatedUnfreezeDate}}.',
      triggerWithEstimatedDate:
        'Unfreeze estimated for {{estimatedUnfreezeDate}}.',
      triggerWithEstimatedDateButRescued:
        'Unfreeze was planned for {{plannedUnfreezeDateButRescued}}.',
      unfrozenDate: 'Unfrozen on {{unfrozenDate}}.',
      unfrozenOnNextBlock:
        'The vault just became virtually unfrozen. Funds can be spent in the next block.',
      timeRemaining: '{{timeRemaining}} remaining',
      untriggeredLockTime: 'Lock Time: {{timeRemaining}}',
      vaultNotFound:
        'This vault was never included in the blockchain. The fees might have been too low, it could have been replaced by another transaction, or there might have been a network error during submission.',
      notTriggeredUnconfirmed: `Funds freeze successfully requested.
Initiating unfreeze starts a {{lockTime}} countdown before funds are available.`,
      notTriggered:
        'Funds are safely frozen. Initiating unfreeze starts a {{lockTime}} countdown before funds are available.',
      rescueNotConfirmed: `Rescue requested on {{rescuePushDate}}.`,
      confirmedRescue: `Rescued on {{rescuedDate}}.`,
      rescueNotConfirmedAddress:
        'Rescue successfully requested. Funds are being moved to your safe address right now:',
      confirmedRescueAddress:
        'The vault was successfully rescued and funds were moved to your secure address:',
      unfrozenAndSpent:
        'The vault was successfully unfrozen. The unfrozen funds were spent on {{spentAsHotDate}} and are no longer available.',
      unfrozenAndSpentPushed:
        'The vault was successfully unfrozen. The unfrozen funds are in the process of being spent in a recent transaction.',
      unfrozenAndHotBalance:
        'The vault was successfully unfrozen and is now part of your available balance.',
      triggerWithRemainingTime:
        "It's currently being unfrozen with {{remainingTime}} remaining.",

      beingUnfrozen: 'This vault is currently being unfrozen.',
      triggerLabel: 'Unfreeze Request Date',
      rescueDateLabel: 'Rescue Date',
      rescueAddressLabel: 'Rescue Address',
      vaultSpendableDateLabel: 'Lock Period End Date',
      frozenRemainingDateLabel: 'Funds Unlock Estimated Date',

      triggerUnfreeze: {
        intro: `You're about to start the process of unlocking your vault funds,\
 which will eventually be ready for spending.

This will start the unfreeze countdown. The funds will become unlocked and available\
 after {{timeLockTime}}.

Tap "Continue" to choose the mining fee and start the unfreeze countdown.`,
        confirmationSpeedLabel: 'Unfreeze Countdown Fee',
        feeSelectorExplanation:
          'Select a mining fee to request the start of the unfreeze countdown.',
        additionalExplanation: `The {{timeLockTime}} countdown will start once the\
 unfreeze request is confirmed.

Tap "Init Unfreeze" to request the start of the unfreeze countdown.`
      },
      rescue: {
        confirmationSpeedLabel: 'Rescue Transaction Fee',
        intro: `You're about to initiate the rescue of your vault funds. This will move the funds to your pre-configured Emergency Address immediately:

{{panicAddress}}

This address will likely be difficult to access if you followed the recommended guidelines during Vault Setup. Ensure you can eventually access it. Once sent, this wallet will no longer have access to them.

This action is designed for extreme situations, such as theft or extortion, to ensure the safety of your Bitcoin. Make sure this is a deliberate decision.`,
        feeSelectorExplanation:
          'Select a mining fee for the rescue transaction to ensure prompt processing.',
        additionalExplanation: `Once the rescue request is confirmed, the funds will be moved to your Emergency Address instantly.

Tap 'Rescue' to initiate the rescue process.`
      },
      delegate: {
        title: 'Delegation File',
        texr: `You're about to generate a delegation file. This file can be shared with a trusted person who can help protect your Bitcoin.

In case of an emergency, the delegated person can use the file to send your funds to the Emergency Address you specified during Vault Setup. They should visit rewindbitcoin.com and follow the straightforward instructions to complete the rescue operation easily.

Bitcoin tech-savvy contacts can read the file and follow the instructions directly.

Tap "Delegate" to generate and share the delegation file.`,
        text: `You're about to generate a delegation file. This file can be shared with a trusted person who can help protect your Bitcoin.

In case of an emergency, the delegated person can use the file to send your funds to the Emergency Address you specified during Vault Setup. The file only contains the necessary info for this and does not include any keys to access your funds.

Contacts should visit rewindbitcoin.com and follow the straightforward instructions to complete the rescue operation easily. Bitcoin tech-savvy contacts can read the file and follow the instructions directly.

Tap "Delegate" to generate and share the delegation file.`
      },
      help: {
        delegate: {
          title: 'Delegate Control',
          text: `The 'Delegate' action allows you to prepare in advance by assigning a trusted person to help during emergencies.

If you're physically unable to access your wallet due to circumstances like incapacitation or coercion, the delegated person can secure your funds by moving them to your Emergency Address.

The delegate cannot access or spend the funds; they can only send the funds to the Emergency Address you specified during Setup. The delegate never has access to any of your keys and only handles pre-signed transactions, ensuring it's safe to pass on this responsibility.`
        },
        rescue: {
          title: 'Rescue Funds',
          text: `The 'Rescue' action allows you to immediately move your vault funds to the Emergency Address you set up during the Vault Setup. This action is designed for extreme situations, such as theft or extortion, to ensure the safety of your Bitcoin.

Once the rescue is initiated, the funds will be sent to the Emergency Address, and this wallet will no longer have access to them. This process is irreversible.`
        },
        initUnfreeze: {
          title: 'Initiate Unfreeze',
          text: `The 'Init Unfreeze' action starts the countdown to unfreeze your vault. During this countdown period, your funds remain locked and cannot be accessed by anyone, including you.

Once the countdown ends, your funds will be unlocked and accessible.`
        }
      }
    }
  },
  walletHome: {
    faucetStartMsg: "Hang tight! We're sending you some coins to get started.",
    faucetDetectedMsg:
      'Hooray! Your test coins have arrived. Why not try freezing them to see how it works?',
    faucetErrorMsg:
      "Oops! There was a glitch sending your coins. Tap 'Receive' to try getting your test coins again.",
    header: {
      checkNetwork: 'Check again.',
      checkingNetwork: 'Checking...',
      hotSubTitle: 'Hot Balance: Ready for immediate use',
      frozenSubTitle: 'Frozen Balance: Safeguarded in vaults',
      testWalletWarning:
        'Test Wallet: Prices displayed as real Bitcoin for realism but hold no real value.',
      tapeWalletPlusWarning: 'Fees mimic real ones for realism, too.'
    },
    delegateReadme: `For immediate action, open this file at:
https://rescue.rewindbitcoin.com

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
   For a simplified process, visit https://rescue.rewindbitcoin.com.

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
     online tool at https://rescue.rewindbitcoin.com, which simplifies
     the identification and cancellation process`
  },
  transaction: {
    pushedMinsAgo_zero: 'Confirming... Submitted less than a minute ago',
    pushedMinsAgo_one: 'Confirming... Submitted {{count}} minute ago',
    pushedMinsAgo_other: 'Confirming... Submitted {{count}} minutes ago',
    pushedOnDate: 'Confirming... Submitted on {{date}}',
    recentlyPushed: 'Confirming... Recently submitted',

    confirmedMinsAgo_zero: 'Less than a minute ago',
    confirmedMinsAgo_one: '{{count}} minute ago',
    confirmedMinsAgo_other: '{{count}} minutes ago',
    confirmedOnDate: '{{date}}',
    confirmedOnBlock: 'Confirmed on block {{block}}',

    header: {
      vault: 'Vault {{vaultNumber}} Creation',
      trigger: 'Vault {{vaultNumber}} Unfreeze',
      rescue: 'Vault {{vaultNumber}} Rescue',
      received: 'Received',
      sent: 'Sent',
      receivedAndSent: 'Received and Sent',
      consolidated: 'Consilidated'
    },
    details: {
      vault: 'Frozen amount after fees: {{amount}}.',
      //Old text is correct but too complex in the UI:
      //triggerConfirmingPanic:
      //  'Rescuing the {{amount}} received in this transaction after fees. Confirming...',
      triggerConfirmingPanic:
        'This transaction started the unfreeze countdown. A rescue process has been detected, and the countdown is being interrupted. The rescue is still confirming. Please hold on for final confirmation...',
      //Old text is correct but too complex in the UI:
      //triggerConfirmedPanic: 'This transaction started the unfreeze countdown, but it was interrupted, and the {{amount}} transferred in this transaction, after fees, was rescued.',
      triggerConfirmedPanic:
        'This transaction started the unfreeze countdown, but it was interrupted because the funds were rescued.',
      triggerWaiting:
        'This transaction started the unfreeze countdown, which is still in progress. The funds, {{amount}} after this transaction fees, are still frozen.',
      triggerHotWallet:
        'This transaction started the unfreeze countdown. The countdown completed, and the funds, after fees, became part of your hot wallet.',
      rescued: 'Rescued amount after fees: {{amount}}.',
      rescuedConfirming:
        'Rescuing your vault. The final rescued amount after fees will be {{amount}}. Awaiting final confirmation...',
      openBlockExplorer: 'View on Block Explorer'
    }
  },
  network: {
    testOn: 'Test on {{networkId}}',
    realBitcoin: 'Use real Bitcoin',
    testOrRealTitle: 'Test or Real Bitcoin',
    testOrRealSubTitle:
      'Select your network: experiment safely on test networks or proceed with real Bitcoin.',
    help: {
      tapeNetworkBrief:
        "Test risk-free on Tape, Rewind's own test network that mirrors real Bitcoin. Receive tokens at setup and request more as needed.",
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
    network: `Rewind provides a choice between testing environments and the real Bitcoin network (via Advanced Options).

The currently recommended option is the Tape Network, Rewind's own test network. Tape mirrors Bitcoin's real functionality and allows you to explore Send/Receive and Vaulting operations safely, offering free tokens for practice.

While the app is in early development, we advise against using real Bitcoin for any significant transactions.`
  },
  vaultSetup: {
    title: 'Vault Set Up',
    subTitle: 'Secure Your Bitcoin',
    fillInAll: 'Please fill in all the fields above to continue.',
    coldAddressMissing: 'Please fill in the Emergency Address to continue.',
    intro:
      'Customize your Vault. Select the amount to secure and your preferred protection timelock.',
    notEnoughFundsTitle: 'Vault Minimum Requirement',
    introMoreHelp: 'Learn More About Vaults',
    helpTitle: 'Learn About Vaults',
    helpText: `Wallet funds are secured by a Recovery Phrase, which acts as a password. If someone gains access to your phrase through extortion, theft, or misuse, they can access your funds. Rewind offers a solution by allowing you to freeze funds into Vaults.

In Vaults, your funds are frozen for a few days, preventing both attackers and even yourself from making transactions. This time-lock gives you a window to rescue your Bitcoin if compromised. You can also delegate this task to a trusted person.

Here's how it works: during the time-lock, while regular transactions are blocked, you can still move your funds instantly to a special Bitcoin Emergency Address. This address is secured by an Emergency Recovery Phrase, distinct from the regular phrase, and should be stored in a separate, ultra-secure location out of daily reach.

You'll find help icons next to each input field during the Vault Set Up with specific explanations.`,

    //    notEnoughFunds: `<strong>Minimum Vault Amount Notice</strong>
    //
    //Rewind requires a minimum amount to be frozen to ensure it is financially worthwhile for you.
    //
    //Essentially, we want to make sure you will still have a significant amount of Bitcoin (more than {{minRecoverableRatioPct}}%) after unlocking or recovering your funds in the event of an emergency.
    //
    //This minimum amount is calculated based on the assumption that you may need rapid transaction confirmations and that future network fees could become extremely high ({{feeRateCeilingK}} Ksats/vB).
    //
    //<strong>Suggested Action:</strong> Please add {{missingFunds}} to reach the minimum amount required for vaulting.`,
    notEnoughFunds: `<strong>Minimum Vault Amount Notice</strong>

Rewind requires a minimum amount to be frozen to ensure it is financially worthwhile for you.

We want to make sure you will be able to rescue your Vault in case of an emergency, regardless of future Bitcoin fees.

This minimum amount is calculated based on the assumption that you may need rapid transaction confirmations and that future network fees could become extremely high ({{feeRateCeilingK}} Ksats/vB).

<strong>Suggested Action:</strong> Please add {{missingFunds}} to reach the minimum amount required for vaulting.`,
    amountLabel: 'Amount to Freeze',
    securityLockTimeLabel: 'Theft-Protection Time-Lock',
    securityLockTimeDescription: 'Available {{blocks}} after unfreeze',
    confirmationSpeedLabel: 'Vault Confirmation Speed',
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
    intro: `We're setting up your vault, generating multiple combinations to minimize future unfreezing fees.

This may take around 30 seconds, longer on older devices.

Next, you'll get to confirm everything.`,
    miningFee: 'Mining Fee:',
    serviceFee: 'Vaulting Fee:',
    timeLock: 'Time-Lock:',
    vaultedAmount: 'Amount to Freeze:',
    confirmBackupSendVault: `Your vault is ready for submission. Please review the following values before proceeding:`,
    encryptionBackupExplain: `We will also encrypt and back up the vault settings on Rewind's P2P network for added security.

If you lose this device, you can recover the vault using just your Recovery Phrase.

Select 'Submit' to activate your vault.`,
    //Each peer helps store these backups, but the vault details remain fully encrypted, so no one can access them. Only you can with your Recovery Phrase.
    //Anyone can easily run a peer to support the network. Learn more at rewindbitcoin.com.
    // The backup will be stored on one peer and retrieved from another to verify its integrity.
    backupInProgress: 'Backing up your vault and verifying the backup...',
    pushingVault: `Your vault has been successfully backed up and is securely stored.

Now, as the final step, we're sending your vault to the blockchain to activate it...`,
    connectivityIssues:
      'Connection issues detected. The vault was not created. Please check your internet connection and try again.',
    vaultBackupError:
      'Error during backup. The vault was not created. Please check your connection and try again.',
    vaultPushError:
      "Connection issues. Backup is complete, but we're unsure if the vault was sent to the blockchain. Refresh to check, and if it's missing, try again.",
    vaultSuccess:
      'Your vault has been successfully created and sent to the blockchain.',
    error:
      'The vault could not be created due to an unexpected error. Please try again and notify the RewindBitcoin team about the following error: {{message}}.'
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
    validWordsThatDontMatch: 'The entered recovery phrase does not match.',
    chooseImport: 'Want to import instead?',
    chooseNew: 'Need to create a new wallet?',
    importWalletText: 'Restore Your Wallet',
    importWalletSubText:
      'Enter the mnemonic recovery phrase you saved when you first set up your wallet. This restores access to your existing wallet and its funds.',
    createWalletText: 'Your New Wallet Awaits',
    createWalletSubText:
      "Below is your wallet's Recovery Phrase. Think of it as your password to the Bitcoin network. It's crucial for accessing your wallet if you switch devices or loose/damage your current one. Write it down and keep it somewhere safe.",
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
    confirmText: `Re-enter the recovery phrase to verify you've recorded it accurately, ensuring wallet recoverability.`,
    testingWalletsCanSkip: 'Test wallets can skip this tedious step.'
  },
  amount: {
    maxLabel: 'All Funds'
  },
  units: {
    preferredUnitTitle: 'Preferred Unit'
  },
  blocksInput: {
    coldAddress: {
      helpTitle: 'Time-Lock Protection',
      helpText: `Imagine a scenario where someone gains unauthorized access to your wallet and tries to move your funds. The Theft-Protection Time-Lock is designed to protect you in such situations.

When you set a time-lock, you specify a period during which your funds are completely locked and cannot be moved by anyone. This lock gives you (or anyone you delegate) the necessary time to react to unauthorized access by moving the funds to a secure Emergency Address.

For example, if you set the time-lock to 7 days, your funds will be locked for that period, meaning they cannot be moved to any regular address. However, during this time, you can still secure your funds by transferring them to an Emergency Address. If everything is normal and there's no threat, your funds will become fully accessible again after the 7-day period, allowing normal transactions.`
    }
  },
  addressInput: {
    invalidAddress: 'Invalid {{network}} address',

    textInputPlaceholderWithCreate: 'Enter or Create an Address',
    textInputPlaceholder: 'Enter an Address',
    createNewButton: 'Create',
    coldAddress: {
      label: 'Emergency Address',
      createNewModalTitle: 'Emergency Address',
      intro: `Welcome to the Emergency Address creation wizard.

This process will set up a Bitcoin address where your funds can be safely sent in case of an emergency, such as extortion or theft.

This address will be generated with a new recovery phrase. Think of it as the password for the address. Store this phrase in a place that is very difficult to access, even for you. Keep it separate from your regular wallet's recovery phrase.

This address will be your ultimate safety net.`,
      bip39Proposal: `Below is your Emergency Recovery Phrase. This is your key to accessing your funds in an emergency.`,
      bip39ProposalPart2: `This phrase won't be retrievable later on since it's not stored in the app. It's crucial to save it now.`,
      confirmBip39ProposalButton: 'I have written it down',
      newColdAddressSuccessfullyCreated:
        'Your new Emergency Address has been successfully created.',
      helpTitle: 'Emergency Address',
      helpText: `Rewind gives you a few days to undo any theft attempt after an attack has occurred. During this time-lock, while your funds are frozen, you have the option to move the funds to an Emergency Bitcoin Address. This address should be protected by a Recovery Phrase that is different from your regular one.

Store this Emergency Recovery Phrase in an extremely safe location that is not easily accessible, even for you. This is to ensure that, in case of extortion, you cannot be forced to reveal it to attackers. Examples include a safebox deposit abroad, buried in a secret remote location, or held by a trusted third-party custodian.

You can either use the 'Create' wizard to generate a new Emergency Address or use an existing address you already own.`
    },
    recipientAddress: {
      label: 'Recipient Address',
      textInputPlaceholder: "Enter recipient's address"
    },
    scan: 'Scan',
    scanQRModalTitle: 'Scan Bitcoin QR Code',
    flipCam: 'Flip Camera',
    requestPermissionRationale:
      'We need your permission to access the camera. The camera is used to scan QR codes containing Bitcoin addresses.',
    triggerNativeRequestPermissionButton: 'Grant Camera Access',
    scanQRCall2Action:
      'Align the QR code within the frame to scan the Bitcoin address.'
  },
  continueButton: 'Continue',
  imInDangerButton: "I'm in danger",
  okButton: 'OK',
  goBack: 'Go Back',
  verifyButton: 'Verify',
  skipButton: 'Skip',
  confirmButton: 'Confirm',
  submitButton: 'Submit',
  saveButton: 'Save',
  cancelButton: 'Cancel',
  closeButton: 'Close',
  understoodButton: 'Undestood',
  factoryResetButton: 'Factory Reset',
  learnMore: 'Learn More.'
};
