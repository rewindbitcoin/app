// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import React, { useCallback } from 'react';
import { View, Text } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Button,
  Modal,
  useToast
} from '../../../../common/ui';
import QRCode from 'react-native-qrcode-svg';
import type { ReserveBumpPlan } from '../useReserveBumpPlans';
import { useLocalization } from '../../../hooks/useLocalization';
import { useSettings } from '../../../hooks/useSettings';
import { useWallet } from '../../../hooks/useWallet';
import { formatBtc } from '../../../lib/btcRates';

const AddReserve = ({
  role,
  vaultMode,
  address,
  additionalSats,
  targetFeeRate,
  plan,
  isRefreshing,
  onRefresh,
  isVisible,
  onClose,
  onModalHide
}: {
  role: 'TRIGGER' | 'RESCUE';
  vaultMode: 'P2A_TRUC' | 'P2A_NON_TRUC';
  address: string | undefined;
  additionalSats: number | undefined;
  targetFeeRate: number;
  plan: ReserveBumpPlan;
  isRefreshing: boolean;
  onRefresh: () => void;
  isVisible: boolean;
  onClose: () => void;
  onModalHide: () => void;
}) => {
  const { t } = useTranslation();
  const toast = useToast();
  const { locale, currency } = useLocalization();
  const { settings } = useSettings();
  const { btcFiat } = useWallet();
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );
  const onClipboard = useCallback(() => {
    if (!address) return;
    Clipboard.setStringAsync(address);
    toast.show(t('receive.clipboard'), { type: 'success', duration: 2000 });
  }, [address, t, toast]);

  const title =
    role === 'TRIGGER'
      ? t('wallet.vault.addReserve.triggerTitle')
      : t('wallet.vault.addReserve.rescueTitle');
  const formattedAmount =
    additionalSats === undefined
      ? ''
      : formatBtc({
          amount: additionalSats,
          subUnit: settings.SUB_UNIT,
          btcFiat,
          locale,
          currency
        });
  const intro =
    role === 'TRIGGER'
      ? t('wallet.vault.addReserve.triggerIntro', { amount: formattedAmount })
      : t('wallet.vault.addReserve.rescueIntro', { amount: formattedAmount });
  const pending =
    typeof plan === 'object' &&
    plan.hasUnconfirmedUtxos &&
    vaultMode === 'P2A_TRUC';
  const loading =
    plan === 'loading' ||
    (plan !== 'error' &&
      (address === undefined || additionalSats === undefined));
  const funded = additionalSats === 0;

  return (
    <Modal
      headerMini
      title={title}
      icon={{ family: 'FontAwesome5', name: 'coins' }}
      isVisible={isVisible}
      onClose={onClose}
      onModalHide={onModalHide}
      closeButtonText={t('wallet.vault.addReserve.backToRescue')}
    >
      <View>
        <Text className="text-base text-slate-600 pb-4 px-2">
          {t('wallet.vault.addReserve.target', { feeRate: targetFeeRate })}
        </Text>
        {plan === 'error' ? (
          <Text className="text-base text-notification pb-4 px-2">
            {t('wallet.vault.rescue.reserveScanError')}
          </Text>
        ) : loading ? (
          <ActivityIndicator />
        ) : pending ? (
          <Text className="text-base text-slate-600 pb-4 px-2">
            {t('wallet.vault.rescue.reserveUnconfirmed')}
          </Text>
        ) : funded ? (
          <Text className="text-base text-slate-600 pb-4 px-2">
            {t('wallet.vault.addReserve.funded')}
          </Text>
        ) : (
          <>
            <Text className="text-base text-slate-600 pb-4 px-2">{intro}</Text>
            {vaultMode === 'P2A_TRUC' && (
              <Text className="text-base text-slate-600 pb-4 px-2">
                {t('wallet.vault.addReserve.trucConfirmationNote')}
              </Text>
            )}
            <Text className="native:text-sm web:text-xs uppercase text-slate-500 pb-4 px-2 font-semibold">
              {t('wallet.vault.addReserve.addressLabel')}
            </Text>
            <View className="items-center pb-4">
              <QRCode
                value={`bitcoin:${address}?amount=${((additionalSats ?? 0) / 1e8).toFixed(8)}`}
                size={200}
              />
            </View>
            <Button
              mode="text"
              containerClassName="w-full justify-center px-2"
              textClassName="text-base break-words"
              iconRight={{ family: 'FontAwesome6', name: 'copy' }}
              onPress={onClipboard}
            >
              {address}
            </Button>
          </>
        )}
        <View className="items-center py-4">
          <Button mode="secondary" onPress={onRefresh} loading={isRefreshing}>
            {t('wallet.vault.addReserve.checkFunds')}
          </Button>
        </View>
      </View>
    </Modal>
  );
};

export default AddReserve;
