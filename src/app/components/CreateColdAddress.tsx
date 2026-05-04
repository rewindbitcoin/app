// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import React, { useCallback, useMemo } from 'react';
import { type IconType } from '../../common/ui';
import { useTranslation } from 'react-i18next';
import { type NetworkId } from '../lib/network';
import EphemeralWalletWizard, {
  type EphemeralWalletData
} from './EphemeralWalletWizard';

const CreateColdAddress = ({
  networkId,
  isVisible,
  onAddress,
  onClose
}: {
  networkId: NetworkId;
  onAddress: (address: string) => void;
  isVisible: boolean;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const onWallet = useCallback(
    ({ address }: EphemeralWalletData) => onAddress(address),
    [onAddress]
  );

  const icon = useMemo<IconType>(
    () => ({ family: 'Ionicons', name: 'wallet' }),
    []
  );

  return (
    <EphemeralWalletWizard
      networkId={networkId}
      isVisible={isVisible}
      onWallet={onWallet}
      onClose={onClose}
      title={t('addressInput.coldAddress.createNewModalTitle')}
      icon={icon}
      introText={t('addressInput.coldAddress.intro')}
      bip39ProposalText={t('addressInput.coldAddress.bip39Proposal')}
      bip39ProposalPart2Text={t('addressInput.coldAddress.bip39ProposalPart2')}
      confirmBip39ProposalButtonText={t(
        'addressInput.coldAddress.confirmBip39ProposalButton'
      )}
      successMessage={t(
        'addressInput.coldAddress.newColdAddressSuccessfullyCreated'
      )}
      addressChange={1}
      addressIndex={0}
    />
  );
};

export default CreateColdAddress;
