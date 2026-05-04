// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text } from 'react-native';
import { generateMnemonic } from 'bip39';
import { useTranslation } from 'react-i18next';
import Bip39 from './Bip39';
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
  isVisible: boolean;
  onWallet: (walletData: EphemeralWalletData) => void | Promise<void>;
  onClose: () => void;
  title: string;
  icon: IconType;
  introText: string;
  bip39ProposalText: string;
  bip39ProposalPart2Text: string;
  confirmBip39ProposalButtonText: string;
  successMessage?: string;
  addressChange: 0 | 1;
  addressIndex: number;
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
  allowSkipBip39Confirmation = true
}: EphemeralWalletWizardProps) => {
  const { t } = useTranslation();
  const toast = useToast();
  const network = networkMapping[networkId];
  const [words, setWords] = useState<string[]>(generateMnemonic().split(' '));
  const [step, setStep] = useState<'intro' | 'bip39' | 'bip39confirm'>('intro');

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
  const onBip39ConfirmationIsRequested = useCallback(
    () => setStep('bip39confirm'),
    []
  );
  const onBip39Confirmed = useCallback(async () => {
    const mnemonic = words.join(' ');
    const signer = createSoftwareSignerFromMnemonic(mnemonic, network);
    const address = await createP2WPKHAddress({
      mnemonic,
      network,
      change: addressChange,
      index: addressIndex
    });
    await onWallet({ signer, address });
    if (successMessage)
      toast.show(successMessage, { type: 'success', duration: 2000 });
  }, [
    addressChange,
    addressIndex,
    network,
    onWallet,
    successMessage,
    toast,
    words
  ]);

  return (
    <>
      <Modal
        onModalHide={onPreviewModalHide}
        headerMini={true}
        isVisible={isVisible && step !== 'bip39confirm'}
        title={title}
        icon={icon}
        onClose={onClose}
        customButtons={
          step === 'intro' ? (
            <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
              <Button mode="secondary" onPress={onClose}>
                {t('cancelButton')}
              </Button>
              <Button onPress={() => setStep('bip39')}>
                {t('continueButton')}
              </Button>
            </View>
          ) : step === 'bip39' ? (
            <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
              <Button mode="secondary" onPress={onClose}>
                {t('cancelButton')}
              </Button>
              <Button onPress={onBip39ConfirmationIsRequested}>
                {confirmBip39ProposalButtonText}
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
        isVisible={isVisible && step === 'bip39confirm' && isPreviewModalHidden}
        words={words}
        onConfirmedOrSkipped={onBip39Confirmed}
        onCancel={onClose}
      />
    </>
  );
};

export default EphemeralWalletWizard;
