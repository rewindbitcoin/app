// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text } from 'react-native';
import { generateMnemonic } from 'bip39';
import { useTranslation } from 'react-i18next';
import Bip39, { validateMnemonic } from './Bip39';
import ConfirmBip39 from './ConfirmBip39';
import { Button, type IconType, Modal, useToast } from '../../common/ui';
import { networkMapping, type NetworkId } from '../lib/network';
import type { Signer } from '../lib/wallets';
import {
  createP2WPKHAddress,
  createSoftwareSignerFromMnemonic
} from '../lib/vaultDescriptors';

export type EphemeralWalletData = {
  signer: Signer;
  address: string;
};

type EphemeralWalletWizardProps = {
  networkId: NetworkId;
  /** Controls the wizard modal visibility. Closing resets generated/imported words. */
  isVisible: boolean;
  /** Called after a created or imported mnemonic has produced signer data. */
  onWallet: (walletData: EphemeralWalletData) => void | Promise<void>;
  /** Closes the wizard without creating/importing a wallet. */
  onClose: () => void;
  /** Modal title. */
  title: string;
  /** Modal icon. */
  icon: IconType;
  /** First-step explanation shown before create/import selection. */
  introText: string;
  /** Text shown above the generated mnemonic in the create flow. */
  bip39ProposalText: string;
  /** Text shown below the generated mnemonic in the create flow. */
  bip39ProposalPart2Text: string;
  /** Button text used to proceed from generated mnemonic display to verification. */
  confirmBip39ProposalButtonText: string;
  /** Optional toast shown after create succeeds. If omitted, no toast is shown. */
  successMessage?: string;
  /** BIP84 branch used for the derived funding/address output: 0 receive, 1 change. */
  addressChange: 0 | 1;
  /** BIP84 child index used for the derived funding/address output. */
  addressIndex: number;
  /** Enables an import path alongside the create path. Create-only by default. */
  allowImport?: boolean;
  /** Optional create button text for the intro step when import is enabled. */
  createButtonText?: string;
  /** Optional import button text for the intro step. */
  importButtonText?: string;
  /** Optional explanation shown above the mnemonic input in the import flow. */
  importText?: string;
  /** Optional import confirmation button text. */
  importConfirmButtonText?: string;
  /** Optional toast shown after import succeeds. If omitted, no toast is shown. */
  importSuccessMessage?: string;
  /**
   * Allows test wallets to skip BIP39 confirmation. ConfirmBip39 still limits
   * skipping to testnet/regtest; mainnet never shows the skip button.
   */
  allowSkipBip39Confirmation?: boolean;
};

const EphemeralWalletWizard = ({
  networkId,
  isVisible,
  onWallet,
  onClose,
  title,
  icon,
  introText,
  bip39ProposalText,
  bip39ProposalPart2Text,
  confirmBip39ProposalButtonText,
  successMessage,
  addressChange,
  addressIndex,
  allowImport = false,
  createButtonText,
  importButtonText,
  importText,
  importConfirmButtonText,
  importSuccessMessage,
  allowSkipBip39Confirmation = true
}: EphemeralWalletWizardProps) => {
  const { t } = useTranslation();
  const toast = useToast();
  const network = networkMapping[networkId];
  const [words, setWords] = useState<string[]>(generateMnemonic().split(' '));
  const [step, setStep] = useState<
    'intro' | 'createMnemonic' | 'confirmCreatedMnemonic' | 'importMnemonic'
  >('intro');

  // This avoids rendering the seed preview modal and ConfirmBip39 at the same
  // time, which react-native-modal does not support reliably.
  const [isPreviewModalHidden, setIsPreviewModalHidden] =
    useState<boolean>(true);
  const onPreviewModalHide = useCallback(
    () => setIsPreviewModalHidden(true),
    []
  );

  useEffect(() => {
    if (!isVisible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWords(generateMnemonic().split(' '));
      setStep('intro');
      setIsPreviewModalHidden(true);
    } else setIsPreviewModalHidden(false);
  }, [isVisible]);

  const onWords = useCallback((words: string[]) => setWords(words), []);
  const onImportRequested = useCallback(() => {
    setWords(Array(12).fill(''));
    setStep('importMnemonic');
  }, []);
  const onBip39ConfirmationIsRequested = useCallback(
    () => setStep('confirmCreatedMnemonic'),
    []
  );
  const onMnemonicReady = useCallback(
    async (mnemonic: string, message?: string) => {
      const signer = createSoftwareSignerFromMnemonic(mnemonic, network);
      const address = await createP2WPKHAddress({
        mnemonic,
        network,
        change: addressChange,
        index: addressIndex
      });
      await onWallet({ signer, address });
      if (message) toast.show(message, { type: 'success', duration: 2000 });
    },
    [addressChange, addressIndex, network, onWallet, toast]
  );
  const onBip39Confirmed = useCallback(async () => {
    await onMnemonicReady(words.join(' '), successMessage);
  }, [onMnemonicReady, successMessage, words]);
  const onImport = useCallback(async () => {
    const mnemonic = words.join(' ');
    if (!validateMnemonic(mnemonic)) return;
    await onMnemonicReady(mnemonic, importSuccessMessage);
  }, [importSuccessMessage, onMnemonicReady, words]);
  const importedMnemonicIsValid = validateMnemonic(words.join(' '));
  const introCreateButtonText = allowImport
    ? createButtonText || t('addressInput.createNewButton')
    : t('continueButton');
  const resolvedImportButtonText =
    importButtonText || t('wallet.importRealBtcButton');
  const resolvedImportText = importText || t('bip39.importWalletSubText');
  const resolvedImportConfirmButtonText =
    importConfirmButtonText || t('wallet.importRealBtcButton');

  return (
    <>
      <Modal
        onModalHide={onPreviewModalHide}
        headerMini={true}
        isVisible={isVisible && step !== 'confirmCreatedMnemonic'}
        title={title}
        icon={icon}
        onClose={onClose}
        customButtons={
          step === 'intro' ? (
            <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
              <Button mode="secondary" onPress={onClose}>
                {t('cancelButton')}
              </Button>
              {allowImport && (
                <Button mode="secondary" onPress={onImportRequested}>
                  {resolvedImportButtonText}
                </Button>
              )}
              <Button onPress={() => setStep('createMnemonic')}>
                {introCreateButtonText}
              </Button>
            </View>
          ) : step === 'createMnemonic' ? (
            <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
              <Button mode="secondary" onPress={onClose}>
                {t('cancelButton')}
              </Button>
              <Button onPress={onBip39ConfirmationIsRequested}>
                {confirmBip39ProposalButtonText}
              </Button>
            </View>
          ) : step === 'importMnemonic' ? (
            <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
              <Button mode="secondary" onPress={onClose}>
                {t('cancelButton')}
              </Button>
              <Button onPress={onImport} disabled={!importedMnemonicIsValid}>
                {resolvedImportConfirmButtonText}
              </Button>
            </View>
          ) : undefined
        }
      >
        {step === 'intro' ? (
          <View>
            <Text className="text-base text-slate-600 pb-2 px-2">
              {introText}
            </Text>
          </View>
        ) : step === 'importMnemonic' ? (
          <View>
            <Text className="native:text-sm web:text-xs text-slate-600 pb-4">
              {resolvedImportText}
            </Text>
            <Bip39 autoFocus onWords={onWords} words={words} />
          </View>
        ) : (
          <View>
            <Text className="native:text-sm web:text-xs text-slate-600 pb-4">
              {bip39ProposalText}
            </Text>
            <Bip39 readonly onWords={onWords} words={words} />
            <Text className="native:text-sm web:text-xs text-slate-600 pt-4">
              {bip39ProposalPart2Text}
            </Text>
          </View>
        )}
      </Modal>
      <ConfirmBip39
        allowSkip={allowSkipBip39Confirmation}
        network={network}
        isVisible={
          isVisible && step === 'confirmCreatedMnemonic' && isPreviewModalHidden
        }
        words={words}
        onConfirmedOrSkipped={onBip39Confirmed}
        onCancel={onClose}
      />
    </>
  );
};

export default EphemeralWalletWizard;
