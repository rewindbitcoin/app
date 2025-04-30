//Treat this as a glorified json with comments & multi-line using string literals

export default {
  app: {
    buildNumber: 'Build',
    unknownError: 'An unknown error occurred.',
    syncP2PVaultsError: `Unable to connect to the P2P backup network. This issue prevents syncing vaults created on other devices.

{{message}}`,
    watchtowerError: `Failed to connect to the Watchtower. This prevents detecting access to your vaults and sending alerts when they are accessed.

{{message}}`,
    syncNetworkError: `There was an issue during a network request while updating your wallet.

{{message}}`,
    syncUnexpectedError: `An unexpected issue has occurred while updating your wallet.

{{message}}`,
    pushError: `Oops! There was a problem submitting your transaction. Please check your connection and try again.

{{message}}`,
    newWalletTitle: 'New Wallet',
    mainTitle: 'Wallets',
    createVaultTitle: 'Creating Vault',

    walletTitle: 'Wallet',
    //settingsButton: 'Settings',
    settingsTitle: 'Settings',
    feeEstimatesError: `Unable to retrieve up-to-date fee estimates. Fee amounts may be slightly off.`,
    tipStatusError:
      'Unable to retrieve the latest blockchain block. The displayed data may not be up-to-date.',
    btcRatesError:
      'Unable to retrieve current BTC rates. The displayed amounts in {{currency}} may not be accurate.',
    //blockchainDataError:
    //  'Unable to retrieve up-to-date blockchain data. Transaction times and fee amounts may be slightly off. Please check your internet connection. Retrying in 60 seconds and will notify you if the problem persists.',
    secureStorageAuthenticationPrompt:
      "Please authenticate to access your wallet's sensitive data.",
    secureStorageCreationAuthenticationPrompt:
      'Please authenticate to securely create a new wallet and encrypt your sensitive data.'
  },
  netStatus: {
    internetNotReachableWarning:
      'No Internet connection detected. This prevents checking wallet status, managing vaults, and sending or receiving funds.',
    apiNotReachableWarning:
      'Unable to connect to our services. This affects Bitcoin price updates and prevents vault operations due to disrupted backups.',
    communityBackupsdNotReachableWarning:
      'Unable to connect to the Community Backups node. This prevents vault operations due to disrupted backups.',
    watchtowerNotReachableWarning: `Unable to connect to the Watchtower. This prevents alerts from being sent when your vaults are accessed.`,
    blockchainExplorerNotReachableWarning:
      'Unable to connect to the blockchain explorer. This prevents updating the status of your transactions and accessing up-to-date information on the Bitcoin network.',
    blockchainMainnetExplorerNotReachableWarning:
      'Unable to connect to the blockchain explorer. This prevents updating the status of your transactions and accessing up-to-date information on the Bitcoin network.',
    connectionRestoredInfo:
      'Connectivity restored. All wallet features are now fully operational.'
  },
  wallets: {
    addNew: 'Add New',
    //importWalletButton: 'Import Wallet',
    mainWallet: 'Main Wallet',
    testWallet: 'Test Wallet',
    noRealValue: 'No Real Value',
    notificationWarningTitle: 'Unauthorized Access Detected',
    notificationWarningMessage_one:
      'An unauthorized access attempt to one of your Vaults was detected. If this wasn’t you, open your wallet now and take action immediately.',
    notificationWarningMessage_other:
      'Unauthorized access attempts to multiple Vaults were detected. If this wasn’t you, open your wallets now and take action immediately.',
    //As in Created on January 19, 2010
    createdOn: 'Created on',
    walletId: 'Wallet {{id}}',
    orphanedWatchtowerWalletUUID_one:
      'An access attempt to one of your Vaults was detected and the app was notified. It belongs to a wallet that no longer exists on this device. You probably deleted this wallet or reinstalled the app. We can’t help further, but we wanted to let you know.',
    orphanedWatchtowerWalletUUID_other:
      'Access attempts to {{count}} of your Vaults were detected and the app was notified, but the wallets they belong to no longer exist on this device. You probably deleted those wallets or reinstalled the app. We can’t help further, but we wanted to let you know.'
  },
  wallet: {
    vaultTab: 'Vaults',
    historyTab: 'History',
    receive: 'Receive',
    send: 'Send',
    freeze: 'Freeze',
    optionalSetPasswordTitle: `Protect Wallet`,
    focedSetPasswordTitle: 'Set New Password',
    forcedSetPasswordText: `Please set a new password (8-32 chars).

If you ever forget your password, you can recover your wallet\
 using your mnemonic Recovery Phrase.`,
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

If you've forgotten the password for your wallet, you can create a new wallet using your Recovery Phrase to regain access.`,
    advancedOptionsTitle: 'Advanced Options',
    usePasswordTitle: 'Use Password',
    biometricEncryptionTitle: 'Biometric Encryption',
    passwordProtectionTitle: 'Password Protect',
    encryptAppDataTitle: 'Encrypt App Data',
    //networkTitle: 'Network',
    //importButton: 'Import',
    createNonRealBtcButton: 'Create Test Wallet',
    createRealBtcButton: 'Create Wallet',
    importNonRealBtcButton: 'Import Test Wallet',
    importRealBtcButton: 'Import Wallet',
    testingWalletInfo: 'This wallet will not use real Bitcoin.',
    realWalletWarning: 'Real Bitcoin wallets currently discouraged.',
    creatingWallet: `⚡ Building your Rewind Wallet...

Zapping bytes and lining up the bits. Hang tight!`,
    biometricsErrorTitle: 'Biometrics Error',
    new: {
      //Messages to show when accessing biometrics while setting up a new wallet
      biometricsRequestDeclined: `We couldn’t set up biometric security (facial recognition or fingerprint authentication) for your wallet.

This may be because you didn’t grant the necessary permissions, or your device doesn’t support biometrics.`,
      biometricsCurrentlyDisabledNonIOS: `Since biometrics cannot be used on this device, new wallets will default to non-biometric security until you grant permissions.

To re-enable biometrics, go to your device's Settings and ensure that biometric permissions are enabled.`,
      biometricsCurrentlyDisabledIOS: `Since biometrics cannot be used on this device, new wallets will default to non-biometric security until you grant permissions.

If you want to re-enable biometrics, go to Settings > RewindBitcoin and turn on Face ID or Touch ID (this may vary based on your OS version and device).`,
      biometricsHowDisable: `Please try again and grant the necessary permissions.

If you prefer not to use biometrics, you can disable this feature in the "Advanced Options" during the New Wallet setup process.`,
      //Old Samsung devices, repeated failures in authentication when creating wallet:
      biometricsReadWriteError: `The biometric implementation on your device has issues.

This may be due to incompatibilities with your device, recent updates to your biometric settings (such as adding a new fingerprint or updating facial recognition), or repeated authentication failures.

Since biometrics cannot be used, we recommend adjusting the wallet creation process. Please disable biometrics and select a password under 'Advanced Options' during the New Wallet setup.`
    },
    existing: {
      //Messages to show when accessing biometrics while accessing an existin wallet
      biometricsRequestDeclined:
        'Access to your wallet was canceled. To continue, please allow biometric authentication when prompted.',
      biometricsAccessFailureIOS: `We're having trouble accessing your wallet due to issues with biometric permissions.

This might be because biometric permissions were disabled or revoked, or due to repeated authentication failures.

Also, updating your device's biometric settings, such as adding a new fingerprint or updating facial recognition, can sometimes invalidate previous configurations.

If you declined biometric access, you can enable it by going to your device's Settings > RewindBitcoin and turning on Face ID or Touch ID (this may vary based on your OS version and device).

This error can also occur if the app was reinstalled and restored with old iCloud data from a previous install, as biometrics are not included. If so, delete this wallet using the Settings icon.

If the issue persists, you can recreate your wallet using your Recovery Phrase to regain access to your funds and vaults.`,
      biometricsAccessFailureNonIOS: `We're having trouble accessing your wallet due to issues with biometric permissions.

This might be because biometric permissions were disabled or revoked, or due to repeated authentication failures.

Also, updating your device's biometric settings, such as adding a new fingerprint or updating facial recognition, can sometimes invalidate previous configurations.

If you've recently changed any biometric settings, please try re-enabling biometrics in your device or restoring the app's permissions.

This error can also occur if the app was reinstalled and restored with old Google Drive data from a previous install, as biometrics are not included. If so, delete this wallet using the Settings icon.

If the issue persists, you can recreate your wallet using your Recovery Phrase to regain access to your funds and vaults.`
    },
    errors: {
      //storageTitle: 'Storage Error',
      storage: `There was an error reading from or writing to your device's\
 storage. This issue may be due to corrupt data, insufficient storage space,\
 or other storage-related problems. Please note that all your wallet data is\
 securely backed up in an encrypted format on Rewinds's P2P network.

To resolve this issue, please try accessing your wallet again. If the problem\
 persists, you can safely recreate your wallet using your mnemonic Recovery\
 Phrase. This will restore all your data securely from the backups.

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
      //frozenAmount: 'Amount Frozen: {{amount}}.',
      confirming: 'Confirming',
      //confirmed: 'Confirmed',

      //pushedTrigger: 'An unfreeze request was made on {{triggerPushDate}}.',
      pushedTriggerNotConfirmed: 'Unfreeze requested on {{triggerPushDate}}.',
      pushedTriggerNotConfirmedUnknownDate: 'Unfreeze recently requested.',
      //confirmedTrigger: 'Unfreeze countdown began on {{triggerConfirmedDate}}.',
      confirmedTrigger:
        '{{lockTime}} countdown started on {{triggerConfirmedDate}}.',
      //triggerWithEstimatedDate:
      //  'The estimated unfreeze date is {{estimatedUnfreezeDate}}.',
      triggerWithEstimatedDate:
        'Unfreeze estimated for {{estimatedUnfreezeDate}}.',
      triggerWithEstimatedDateButRescued:
        'Unfreeze planned for {{plannedUnfreezeButRescuedDate}}.',
      unfrozenDate: 'Unfrozen on {{unfrozenDate}}.',
      unfrozenOnNextBlock:
        'The vault just became virtually unfrozen. Funds can be spent in the next block.',
      timeRemaining: '{{timeRemaining}} remaining',
      untriggeredLockTime: 'Lock Time: {{timeRemaining}}',
      vaultNotFound:
        'This vault was never included in the blockchain. The fees might have been too low, it could have been replaced by another transaction, or there might have been a network error during submission.',
      //      notTriggeredUnconfirmed: `Funds freeze successfully requested.
      //Initiating unfreeze starts a {{lockTime}} countdown before funds are available.`,
      notTriggeredUnconfirmed: `Your funds are securely set aside, awaiting final blockchain confirmation (this may take a few minutes).
If you press 'Init Unfreeze', a waiting period of {{lockTime}} will begin, after which the funds will be available.`,
      //notTriggered:
      //  'Funds are safely frozen. Initiating unfreeze starts a {{lockTime}} countdown before funds are available.',
      notTriggered:
        "Funds are safely frozen. If you press 'Init Unfreeze', a waiting period of {{lockTime}} will begin, after which the funds will be available.",
      rescueNotConfirmed: `Rescue requested on {{rescuePushDate}}.`,
      rescueNotConfirmedUnknownPush: `Vault Rescue recently submitted.`,
      confirmedRescue: `Rescued on {{rescuedDate}}.`,
      rescueNotConfirmedAddress:
        'Rescue successfully requested (awaiting for confirmation). Funds are being moved to your safe address right now:',
      confirmedRescueAddress:
        'The vault was successfully rescued and funds were moved to your secure address:',
      unfrozenAndSpent:
        'The vault was successfully unfrozen. The unfrozen funds were spent on {{spentAsHotDate}} and are no longer available.',
      unfrozenAndSpentPushed:
        'The vault was successfully unfrozen. The unfrozen funds are in the process of being spent in a recent transaction.',
      unfrozenAndHotBalance:
        'The vault was successfully unfrozen and is now part of your available balance.',
      //triggerWithRemainingTime:
      //  "It's currently being unfrozen with {{remainingTime}} remaining.",

      //beingUnfrozen: 'This vault is currently being unfrozen.',
      //triggerLabel: 'Unfreeze Request Date',
      //rescueDateLabel: 'Rescue Date',
      //rescueAddressLabel: 'Rescue Address',
      //vaultSpendableDateLabel: 'Lock Period End Date',
      //frozenRemainingDateLabel: 'Funds Unlock Estimated Date',

      triggerUnfreeze: {
        intro: `You're about to start the process of unlocking your vault funds,\
 which will eventually be ready for spending.

This will start the unfreeze countdown. The funds will become unlocked and available\
 after {{timeLockTime}}.`,
        confirmationSpeedLabel: 'Mining Fee',
        feeSelectorExplanation:
          'Confirm the mining fee to request the start of the unfreeze countdown.',
        additionalExplanation: `The {{timeLockTime}} countdown will start as soon as the unfreeze is requested.`
      },
      rescue: {
        confirmationSpeedLabel: 'Mining Fee',
        intro: `You're about to initiate the rescue of your vault funds. This will move the funds to your pre-configured Emergency Address immediately:

{{panicAddress}}

This address will likely be difficult to access if you followed the recommended guidelines during Vault Setup. Ensure you can eventually access it. Once the funds are sent, this wallet will no longer have access to them.

This action is designed for extreme situations, such as theft or extortion, to ensure the safety of your Bitcoin. Make sure this is a deliberate decision.`,
        feeSelectorExplanation:
          'Confirm the mining fee for the rescue transaction to ensure prompt processing.',
        additionalExplanation: `Once the rescue request is confirmed, the funds will be moved to your Emergency Address instantly.`
      },
      delegate: {
        title: 'Delegation File',
        text: `You're about to generate a delegation file. This file can be shared with a trusted person who can help protect your Bitcoin.

In case of an emergency, the delegated person can use the file to send your funds to the Emergency Address you specified during Vault Setup. The file only contains the necessary info for this and does not include any keys to access your funds.

Delegates should visit rewindbitcoin.com and follow the straightforward instructions to complete the rescue operation easily. Bitcoin tech-savvy delegates can read the file and follow the instructions directly.

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
      },
      noFundsTile: 'No Funds Frozen Yet',
      noFundsBody:
        'Keep your savings secure by freezing the funds not needed daily in Vaults.',
      watchtower: {
        permissionTitle: 'Enable Vault Alerts?',
        allowButton: 'Allow Notifications',
        permissionExplanation: `Rewind needs permission to send critical security alerts about your Vaults.

We strongly recommend enabling them.

If someone gains access to your Recovery Phrase (e.g., through theft or loss) and attempts to unfreeze your Vaults, Rewind can instantly alert *this specific device*. This gives you a crucial window to secure your Bitcoin before it’s too late.

Tap 'Continue'. Your device will then prompt you to allow notifications.`,
        statusTitle: 'Vault Monitoring Status',
        registered:
          "This Vault is being monitored. You'll receive a push notification if unauthorized activity is detected.",
        registrationError:
          "Couldn't connect to the Vault monitoring service. Please check your internet connection and ensure the watchtower service is available. You can also try selecting a different watchtower in the app's settings.",
        unregistered:
          'To enable monitoring and receive alerts, please allow push notifications when prompted.',
        settings: {
          ios: "To receive alerts, go to your device's Settings > Notifications > RewindBitcoin and enable notifications.",
          android:
            "To receive alerts, go to your device's Settings > Apps > RewindBitcoin > Notifications and enable notifications."
        }
      }
    },
    password: {
      validation: {
        tooShort: 'Password must be at least 8 characters',
        tooLong: 'Password cannot be longer than 32 characters'
      }
    }
  },
  walletHome: {
    faucetStartMsg:
      "Hang tight! We're sending you some coins to get started. This takes just a few seconds.",
    faucetDetectedMsg:
      'Hooray! Your test coins have arrived. Why not try freezing them to see how it works?',
    faucetErrorMsg:
      "Oops! There was a glitch sending your coins. Tap 'Receive' to try getting your test coins again.",
    header: {
      checkNetwork: 'Check again',
      checkingNetwork: 'Checking',
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
    noTransactionsTitle: 'No Transactions Yet',
    noTransactionsBody:
      'Your transactions will show up here once you start making moves.',
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
      consolidated: 'Consolidated'
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
        'This transaction started the unfreeze countdown, which is still in progress. The funds, {{amount}} after this transaction fee, are still frozen.',
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
      'Experiment safely on test networks or proceed with real Bitcoin.',
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
 Recovery Phrase in this device. This ensures it is accessible only by you.

Please note, if your biometric data changes (like\
 adding a new fingerprint), the system will invalidate the encryption\
 key, making the mnemonic Recovery Phrase unreadable. In such cases, you'll need to\
 re-enter the mnemonic. This measure ensures that only you can access\
 your wallet.`,
    password: `Setting a password encrypts your mnemonic Recovery Phrase, providing a secure\
 layer of protection for your wallet.

Each time you access the wallet, you will\
 need to enter this password to decrypt the mnemonic phrase.`,
    passwordWithBiometric: `If you have biometric encryption enabled, a password\
 may not be necessary as biometrics already offer robust security.`,
    encryptAppData: `This option encrypts your non-mnemonic data, like vaults and transaction details,\
 shielding your transaction patterns and addresses from potential exposure, preserving your anonymity.

While leaking this data wouldn't compromise your funds, encrypting it\
 ensures that even if it is accessed by unauthorized parties, they won't be able\
 to discern how you use your wallet, such as your spending habits or whom you transact with.`,
    //The encryption uses the XChaCha20-Poly1305 algorithm, with a key that’s securely\
    // derived from your mnemonic Recovery Phrase.
    network: `Rewind provides a choice between testing environments and the real Bitcoin network (via Advanced Options).

The currently recommended option is the Tape Network, Rewind's own test network. Tape mirrors Bitcoin's real functionality and allows you to explore Send/Receive and Vaulting operations safely, offering free tokens for practice.

While the app is in early development, we advise against using real Bitcoin for any significant transactions.`
  },
  learnMoreAboutVaults: {
    link: 'Learn More About Vaults',
    title: 'Learn About Vaults',
    //    body_old_delete: `Wallet funds are secured by a Recovery Phrase, which acts as a password. If someone gains access to your phrase through extortion, theft, or misuse, they can access your funds. Rewind offers a solution by allowing you to freeze funds into Vaults.
    //
    //In Vaults, your funds are frozen for a few days, preventing both attackers and even yourself from making transactions. This time-lock gives you a window to rescue your Bitcoin if compromised. You can also delegate this task to a trusted person.
    //
    //Here's how it works: during the time-lock, while regular transactions are blocked, you can still move your funds instantly to a special Bitcoin mergency Address. This address is secured by an Emergency Recovery Phrase, distinct from the regular phrase, and should be stored in a separate, ultra-secure location out of daily reach.
    //
    //You'll find help icons next to each input field during the Vault Set Up with specific explanations.`,
    body: `Your wallet is secured with a Recovery Phrase, similar to a password. If someone else gains access to this phrase through extortion, theft, or misuse, they can access your funds. To prevent this, Rewind lets you freeze your money in Vaults.

When you freeze money, it remains locked until you choose to unfreeze it. Unfreezing doesn’t provide immediate access; instead, it initiates a countdown, giving you time to act if necessary.

Suppose an attacker gains access and tries to unfreeze your funds to steal them. During the countdown, you can cancel this unauthorized attempt by immediately moving the funds to an Emergency Address. Rewind offers a wizard to help you set up and secure this rescue address.

Also, you can delegate the rescue task to a trusted person in case you face extortion, duress or become incapacitated.

Help icons and tips are available during Vault setup to guide you through the process.`
  },
  vaultSetup: {
    title: 'Vault Set Up',
    //subTitle: 'Secure Your Bitcoin',
    fillInAll: 'Please fill in all the fields above to continue.',
    coldAddressMissing: 'Please fill in the Emergency Address to continue.',
    //intro: 'Set the amount to secure and protection time-lock.',
    intro: 'Secure funds not needed daily by freezing them.',
    prefilledAddress: 'Pre-filled with your last unused one.',
    prefilledAddressHelpTitle: 'Pre-filled Address',
    prefilledAddressHelp: `The Emergency Address of your most recent vault is pre-filled for convenience, so you don’t need to keep track of multiple Emergency Phrases. For privacy, an Emergency Address will not be used again once it has been utilized.

You can replace the pre-filled address or click "Create" to open a wizard and generate a new Emergency Address.

Verify the address carefully to ensure it corresponds to an Emergency Phrase under your control:
{{coldAddress}}.`,
    //notEnoughFundsTitle: 'Vault Minimum Requirement',

    //    notEnoughFunds: `<strong>Minimum Vault Amount Notice</strong>
    //
    //Rewind requires a minimum amount to be frozen to ensure it is financially worthwhile for you.
    //
    //Essentially, we want to make sure you will still have a significant amount of Bitcoin (more than {{minRecoverableRatioPct}}%) after unlocking or recovering your funds in the event of an emergency.
    //
    //This minimum amount is calculated based on the assumption that you may need rapid transaction confirmations and that future network fees could become extremely high ({{feeRateCeiling}} Ksats/vB).
    //
    //<strong>Suggested Action:</strong> Please add {{missingFunds}} to reach the minimum amount required for vaulting.`,
    notEnoughFunds: `<strong>Minimum Vault Amount Notice</strong>

Rewind requires a minimum amount to be frozen to ensure it is financially worthwhile for you.

We want to make sure you will be able to rescue your Vault in case of an emergency, regardless of future Bitcoin fees.

This minimum amount is calculated based on the assumption that you may need rapid transaction confirmations and that future network fees could become high ({{feeRateCeiling}} Ksats/vB).

<strong>Suggested Action:</strong> Please add {{missingFunds}} to reach the minimum amount required for vaulting.`,
    amountLabel: 'Amount to Freeze',
    securityLockTimeLabel: 'Theft-Protection Time-Lock',
    securityLockTimeDescription: 'Unlocks {{blocks}} after unfreeze',
    confirmationSpeedLabel: 'Mining Fee',
    //lockTimeError: 'Pick a valid Lock Time.',
    //feeRateError: 'Pick a valid Fee Rate.',
    //amountError: 'Pick a valid amount of Btc.',
    //invalidValues: 'Invalid Values.',
    //reduceVaultAmount:
    //  'Faster vault creation fees reduce maximum to {{amount}}',
    //days: 'days',
    //blocks: 'blocks',
    //feeRate: 'sats/vB',
    //vaultAllFundsShortBadge: 'All Funds',
    interrupt: `We've detected changes in your wallet while you were setting up a new vault.

For your security, please review these changes before proceeding.`
  },
  send: {
    title: 'Send Bitcoin',
    notEnoughFunds: 'Insufficient funds to create the transaction',
    lowerFeeRate: `Transaction not possible with the selected fee rate and your available funds.

Please lower the fee rate or add more funds.`,
    invalidFeeRate: `Please select a valid fee rate.`,
    amountLabel: 'Amount to Send',
    confirmationSpeedLabel: 'Mining Fee',
    txCalculateError:
      'The transaction could not be created. Sync your wallet and try again.',
    txPushError:
      "Connection issues. We're unsure if the transaction was sent to the blockchain. Refresh to check, and if it's missing, try again.",
    txSuccess:
      'Your transaction has been successfully created and sent to the blockchain.',
    confirm: `Your transaction is ready for submission. Please review the following values before proceeding:`,
    confirmModalTitle: 'Review and Confirm',
    interrupt: `We've detected changes in your wallet while you were setting up a new transaction.

For your security, please review these changes before proceeding.`,

    confirmLabels: {
      miningFee: 'Mining Fee',
      amountLabel: 'Amount',
      recipientAddress: 'Address'
    }
  },
  receive: {
    title: 'Receive Bitcoin',
    clipboard: 'Address copied to clipboard!',
    doneButton: 'Done',
    shareAddress: 'Share Address',
    copyAddress: 'Copy to Clipboard',
    intro: 'Share this address to receive Bitcoin',
    faucetIntro: 'Need test coins?',
    requestTokens: 'Request them here!',
    faucetNote:
      'Coins are provided for practice on the {{networkName}} test network. These test tokens have no real value.'
  },
  createVault: {
    intro: `We're setting up your vault, generating multiple combinations to minimize future unfreezing fees.

This may take around 30 seconds, slightly longer on older devices.

Next, you'll get to confirm everything.`,
    miningFee: 'Mining Fee',
    serviceFee: 'Vaulting Fee',
    allFees: 'Fees',
    timeLock: 'Time-Lock',
    amount: 'Amount to Vault',
    //Note to transalators: make this text below as short as possible. This is the
    //label for Emergency Address in the summary that users review before
    //final submission
    emergencyAddress: 'Emergency Address',
    //vaultedAmount: 'Amount to Freeze:',
    confirmBackupSendVault: `Your vault is ready for submission. Please review the following values before proceeding:`,
    explainConfirm: `Select 'Submit' to activate your vault.`,
    //    encryptionBackupExplain: `We will also encrypt and back up the vault settings on Rewind's P2P network for added security.
    //
    //If you lose this device, you can recover the vault using your Recovery Phrase.
    //
    //Select 'Submit' to activate your vault.`,
    //Each peer helps store these backups, but the vault details remain fully encrypted, so no one can access them. Only you can with your Recovery Phrase.
    //Anyone can easily run a peer to support the network. Learn more at rewindbitcoin.com.
    // The backup will be stored on one peer and retrieved from another to verify its integrity.
    backupInProgress: 'Backing up your vault and verifying the backup...',
    pushingVault: `Your vault has been successfully backed up and is securely stored.

Now, as the final step, we're sending your vault to the blockchain to activate it...`,
    fetchIssues: `Connection issues detected. The vault was not created. Please check your internet connection and try again.

{{message}}`,
    connectivityIssues:
      'Connection issues detected. The vault was not created. Please check your internet connection and try again.',
    vaultBackupError: `Error during backup. The vault was not created. Please check your connection and try again.

{{message}}`,
    vaultPushError: `Connection issues. Backup is complete, but we're unsure if the vault was sent to the blockchain. Refresh to check, and if it's missing, try again.

{{message}}`,
    vaultSuccess:
      'Your vault has been successfully created and sent to the blockchain.',
    unexpectedError:
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
  feeRate: {
    waitingForRates: 'Waiting for BTC/{{currency}} rates...',
    waitingForEstimates: 'Waiting for fee estimates...',
    fee: 'Fee: {{amount}}',
    confirmationTime: 'Confirms in ~{{blocks}}',
    mayNotConfirm: 'May Never Confirm',
    expressConfirmation: 'Express Confirmation'
  },
  bip39: {
    validWordsThatDontMatch: 'The entered Recovery Phrase does not match.',
    chooseImport: 'Want to import instead?',
    chooseNew: 'Need to create a new wallet?',
    //importWalletText: 'Restore Your Wallet',
    importWalletSubText:
      'Enter the mnemonic Recovery Phrase you saved when you first set up your wallet. This restores access to your existing wallet and its funds.',
    //createWalletText: 'Your New Wallet Awaits',
    createWalletSubText:
      "Below is your wallet's Recovery Phrase. Think of it as your password to the Bitcoin network. It's crucial for accessing your wallet if you switch devices or loose/damage your current one. Write it down and keep it somewhere safe.",
    segmented12: '12 Words',
    segmented24: '24 Words',
    //selectWordsLength: 'Number of words:',
    //enterMnemonicText: 'Word #{{wordNumber}}:',
    //importWalletButton: 'Import Wallet',
    invalidErrorMessage:
      'The word sequence you entered is not valid. Please double-check your words for any errors.',
    confirmTitle: 'Phrase Verification',
    //This will be rendered as subTitle in a Modal. In iphone 4 and small devices this should not go
    //over 3 lines of text:
    //    confirmText: `Enter the Recovery Phrase for verification.\
    // This confirms you've noted it correctly and your wallet can be recovered.`,
    confirmText: `Re-enter the Phrase to verify it and ensure wallet recoverability.`,
    testingWalletsCanSkip: 'Test wallets can skip this tedious step.'
  },
  amount: {
    //This should not be larger than 10~12 chars. Could also be Max or similar
    maxLabel: 'All Funds'
  },
  units: {
    preferredUnitTitle: 'Preferred Unit'
  },
  feeInput: {
    autoOptimal: 'Optimal Fee',
    helpTitle: 'Confirmation Speed',
    helpText: `You are creating a new Bitcoin transaction that will need to be processed by miners.

Miners prioritize transactions with higher fees due to limited space in each block.

The fee you choose determines how quickly your transaction will be processed, with higher fees resulting in faster confirmation.`
  },
  blocksInput: {
    days: 'days',
    blocks: 'blocks',
    coldAddress: {
      helpTitle: 'Time-Lock Protection',
      helpText: `Imagine a scenario where someone gains unauthorized access to your wallet and tries to move your funds. The Theft-Protection Time-Lock is designed to protect you in such situations.

When you create a Vault, your funds stay locked and cannot be moved by anyone. Not even you. If you initiate the unfreeze process, a Time-Lock countdown begins. During the countdown, your funds remain locked, with one exception: you can immediately transfer them to a secure Emergency Address if needed.

For example, if you set a time-lock of 7 days, your funds will remain locked for that period after the unfreeze process starts. However, if you are under attack and the unfreeze is unauthorized, you can secure your funds by transferring them to an Emergency Address. If everything is normal and there's no threat, your funds will become fully accessible once the countdown ends, enabling regular transactions afterward.`
    }
  },
  addressInput: {
    invalidAddress: 'Invalid {{network}} address',
    //textInputPlaceholder: 'Enter an Address',
    createNewButton: 'Create',
    coldAddress: {
      label: 'Emergency Address',
      textInputPlaceholderWithCreate: 'Bitcoin Address',
      createNewModalTitle: 'Emergency Address',
      intro: `Welcome to the Emergency Address creation wizard.

This process will set up a Bitcoin address where your funds can be safely sent in case of an emergency, such as extortion or theft.

This address will be generated with a new Recovery Phrase. Think of it as the password for the address. Store this phrase in a place that is very difficult to access, even for you. Keep it separate from your regular wallet's Recovery Phrase.

This address will be your last line of defense.`,
      bip39Proposal: `Below is your Emergency Recovery Phrase. This is your key to accessing your funds in an emergency.`,
      bip39ProposalPart2: `This phrase won't be retrievable later on since it's not stored in the app. It's crucial to save it now.`,
      confirmBip39ProposalButton: 'I have written it down',
      newColdAddressSuccessfullyCreated:
        'Your new Emergency Address has been successfully created.',
      helpTitle: 'Emergency Address',
      helpText: `Rewind gives you a few days to undo any theft attempt after an attack has occurred. During this time-lock, while your funds are frozen, you have the option to move the funds to an Emergency Bitcoin Address. This address is protected by a Recovery Phrase that is different from your regular one.

Store this Emergency Recovery Phrase in an extremely safe location that is not easily accessible, even for you. This is to ensure that, in case of extortion, you cannot be forced to reveal it to attackers. Examples include a safebox deposit abroad, buried in a secret remote location, or held by a trusted third-party custodian.

You can either use the 'Create' wizard to generate a new Emergency Address or use an existing secure address you already own.`
    },
    recipientAddress: {
      label: 'Recipient Address',
      textInputPlaceholder: 'Bitcoin Address'
    },
    scan: 'Scan',
    scanQRModalTitle: 'Scan Bitcoin QR',
    flipCam: 'Flip Camera',
    cameraPermissionDenied: `Access to the camera has been permanently denied for this app.

To use the camera, please go to your device's settings and manually enable camera permissions for this app.`,
    requestPermissionRationale: `We need your permission to access the camera.

The camera is used to scan QR codes containing Bitcoin addresses.`,
    triggerNativeRequestPermissionButton: 'Grant Camera Access',
    scanQRCall2Action:
      'Align the QR code within the frame to scan the Bitcoin address.'
  },
  settings: {
    defaultButton: 'Reset to Default',
    resetToDefaults: 'Reset All Settings to Defaults',
    resetToDefaultsTitle: 'Reset Settings',
    resetToDefaultsConfirm:
      'Are you sure you want to reset all settings to their default values? This cannot be undone.',
    resetButton: 'Reset',
    wallet: {
      name: 'Name',
      export: 'Export Wallet',
      exportProgress: 'Packaging...',
      recoveryPhrase: 'Recovery Phrase',
      showRecoveryPhrase: 'Show Recovery Phrase',
      exportInstructions: `This file contains the output descriptors for this wallet and
its associated vaults, where applicable.

Each vault includes a trigger transaction map (triggerMap).
In this map, each index corresponds to a Hex-formatted transaction
that can initiate the unvaulting process.

Multiple unvaulting transactions are provided for each vault, each
associated with a different fee rate, allowing you to choose
based on current network fee conditions.
See txMap for specific details on fees.

For each unvaulting transaction, an array of rescue transactions
is provided.
These can cancel the unvaulting and come with varying fee rates,
offering flexibility to respond to unauthorized access under
different network conditions.
Further details on these fee rates are also available in txMap.

Please handle this information with care as it contains
sensitive details crucial for the security of your funds.`,
      delete: 'Delete Wallet',
      deleteInfo: `Are you sure you want to delete this wallet? This action cannot be reversed.

Please ensure you have backed up your Recovery Phrase and exported your wallet. If you have not done so, you will lose access to your funds forever.

Type 'DELETE' below to confirm and proceed with the deletion.`,
      confirmDelete: 'Confirm Delete',
      deleteClosingNetwork: `Deletion in progress...

Finalizing network operations.
Please wait a few moments until completion.`,
      deletePlaceholder: 'Type DELETE to confirm',
      deleteText: 'DELETE',
      deleteError: `Deletion failed. Please try again or restart the app if the problem persists.`,
      gapLimitError: 'Gap Limit must be an integer between 1 and 100.',
      electrumError:
        'Invalid Electrum URL or server is down. Please check the URL and try again.',
      esploraError:
        'Invalid Esplora URL or server is down. Please check the URL and try again.',
      communityBackupsError:
        'Invalid Community Backups API Base. Please check the URL and try again.',
      regtestHostNameFormatError:
        'Invalid format. Please enter only a hostname or IP address without protocol (http://, ssl://, etc.), port (:8080), or path (/api).',
      regtestHttpError:
        'Invalid Regtest HTTP connection. Please check the host name and try again.',
      regtestElectrumError:
        'Invalid Regtest Electrum connection. Please check the host name and try again.',
      watchtowerError:
        'Invalid Watchtower API Base. Please check the URL and try again.'
    },
    general: {
      title: 'General',
      electrumBitcoin: 'Electrum Bitcoin',
      watchtowerApi: 'Watchtower Alerts',
      electrumTape: 'Electrum Tape',
      electrumTestnet: 'Electrum Testnet',
      electrumRegtest: 'Electrum Regtest',
      esploraBitcoin: 'Esplora Bitcoin',
      esploraTape: 'Esplora Tape',
      esploraTestnet: 'Esplora Testnet',
      communityBackups: 'Community Backups',
      regtestHostName: 'Regtest Host',
      gapLimit: 'Gap Limit',
      currency: 'Currency',
      language: 'Language',
      systemDefault: 'System Default',
      //These below must be set in their native language
      languageNames: {
        en: 'English',
        es: 'Español'
      }
    }
  },
  continueButton: 'Continue',
  imInDangerButton: "I'm in danger",
  //okButton: 'OK',
  loadMoreButton: 'Load More',
  dismissButton: 'Dismiss',
  goBack: 'Go Back',
  verifyButton: 'Verify',
  skipButton: 'Skip',
  confirmButton: 'Confirm',
  submitButton: 'Submit',
  saveButton: 'Save',
  savingButton: 'Saving...',
  cancelButton: 'Cancel',
  closeButton: 'Close',
  understoodButton: 'Understood',
  //factoryResetButton: 'Factory Reset',
  tryAgain: 'Try Again',
  learnMore: 'Learn More.',
  loading: 'Loading...',
  helpButton: 'Help',
  globalError: {
    general: `An unexpected error has occurred. Below you will find additional details that may help identify the issue. Some of this information is technical and intended for developers. There is no need for immediate concern.

Your wallet should still be secure. Please tap on 'Try Again' to reload the app. If the problem persists, consider restoring your wallet using your Recovery Phrase. Your vaults and related data will be retrieved from community backups online.

For further assistance or to report this issue, please contact RewindBitcoin support at rewindbitcoin.com or contact us at x.com/rewindbitcoin.`
  }
};
