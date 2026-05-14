// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { type IconType } from '../../../../common/ui';
import EphemeralWalletWizard, {
  type EphemeralWalletData
} from '../../EphemeralWalletWizard';
import type { NetworkId } from '../../../lib/network';

const RescueReserveWalletWizard = ({
  networkId,
  vaultMode,
  isVisible,
  onWallet,
  onClose,
  onModalHide
}: {
  networkId: NetworkId;
  vaultMode: 'P2A_TRUC' | 'P2A_NON_TRUC';
  isVisible: boolean;
  onWallet: (walletData: EphemeralWalletData) => void | Promise<void>;
  onClose: () => void;
  onModalHide?: () => void;
}) => {
  const { t } = useTranslation();
  const icon = useMemo<IconType>(
    () => ({ family: 'MaterialCommunityIcons', name: 'lifebuoy' }),
    []
  );
  const introText =
    vaultMode === 'P2A_TRUC'
      ? t('wallet.vault.rescueReserveWallet.intro_TRUC')
      : t('wallet.vault.rescueReserveWallet.intro_NON_TRUC');
  const bip39ProposalPart2Text =
    vaultMode === 'P2A_TRUC'
      ? t('wallet.vault.rescueReserveWallet.bip39ProposalPart2_TRUC')
      : t('wallet.vault.rescueReserveWallet.bip39ProposalPart2_NON_TRUC');

  return (
    <EphemeralWalletWizard
      networkId={networkId}
      isVisible={isVisible}
      onWallet={onWallet}
      onClose={onClose}
      {...(onModalHide ? { onModalHide } : {})}
      title={t('wallet.vault.rescueReserveWallet.modalTitle')}
      icon={icon}
      introText={introText}
      allowImport
      createButtonText={t('wallet.vault.rescueReserveWallet.createButton')}
      importButtonText={t('wallet.vault.rescueReserveWallet.importButton')}
      importText={t('wallet.vault.rescueReserveWallet.importText')}
      importConfirmButtonText={t(
        'wallet.vault.rescueReserveWallet.importConfirmButton'
      )}
      bip39ProposalText={t('wallet.vault.rescueReserveWallet.bip39Proposal')}
      bip39ProposalPart2Text={bip39ProposalPart2Text}
      confirmBip39ProposalButtonText={t(
        'wallet.vault.rescueReserveWallet.confirmBip39ProposalButton'
      )}
      successMessage={t('wallet.vault.rescueReserveWallet.created')}
      importSuccessMessage={t('wallet.vault.rescueReserveWallet.imported')}
      addressChange={0}
      addressIndex={0}
    />
  );
};

export default RescueReserveWalletWizard;
