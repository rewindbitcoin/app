// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, IconType, Modal } from '../../common/ui';
import { formatBtc } from '../lib/btcRates';
import { toNumber } from '../lib/sats';
import type { UtxoAvailability } from '../lib/utxoPolicy';
import { useLocalization } from '../hooks/useLocalization';
import { useSettings } from '../hooks/useSettings';

type CoinControlModalProps = {
  isVisible: boolean;
  utxosAvailability: UtxoAvailability[];
  btcFiat: number | undefined;
  onClose: () => void;
  onModalHide?: () => void;
};

type UtxoDataWithDescriptor = UtxoAvailability['utxoData'] & {
  descriptor?: string;
};

const getUtxoValue = (utxoData: UtxoAvailability['utxoData']) => {
  const output = utxoData.tx.outs[utxoData.vout];
  if (!output) throw new Error('Invalid UTXO output');
  return toNumber(output.value);
};

const getShortOutpoint = (utxoData: UtxoAvailability['utxoData']) =>
  `${utxoData.tx.getId().slice(0, 8)}:${utxoData.vout}`;

const getDescriptor = (utxoData: UtxoAvailability['utxoData']) =>
  (utxoData as UtxoDataWithDescriptor).descriptor;

const getAccountNumber = (descriptor: string) =>
  descriptor.match(/\/(\d+)'\]/)?.[1];

const CoinControlModal = ({
  isVisible,
  utxosAvailability,
  btcFiat,
  onClose,
  onModalHide
}: CoinControlModalProps) => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { locale, currency } = useLocalization();
  const [step, setStep] = useState<'intro' | 'coinselect'>('intro');

  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );

  useEffect(() => {
    if (!isVisible) setStep('intro');
  }, [isVisible]);

  const icon = useMemo<IconType>(
    () => ({ family: 'FontAwesome5', name: 'coins' }),
    []
  );
  const handleContinue = useCallback(() => setStep('coinselect'), []);

  const onlyDefaultAccount = useMemo(() => {
    const accountNumbers = new Set(
      utxosAvailability
        .map(availability => getDescriptor(availability.utxoData))
        .map(descriptor =>
          descriptor ? getAccountNumber(descriptor) : undefined
        )
        .filter(
          (accountNumber): accountNumber is string =>
            accountNumber !== undefined
        )
    );
    return accountNumbers.size === 1 && accountNumbers.has('0');
  }, [utxosAvailability]);

  const getGroupLabel = useCallback(
    (utxoData: UtxoAvailability['utxoData']) => {
      const descriptor = getDescriptor(utxoData);
      const baseLabel = !descriptor
        ? t('coinControl.groups.wallet')
        : descriptor.startsWith('wpkh(')
          ? t('coinControl.groups.nativeSegwit')
          : descriptor.startsWith('sh(wpkh(')
            ? t('coinControl.groups.wrappedSegwit')
            : descriptor.startsWith('pkh(')
              ? t('coinControl.groups.legacy')
              : descriptor.startsWith('wsh(andor(')
                ? t('coinControl.groups.vault')
                : t('coinControl.groups.wallet');
      const accountNumber = descriptor
        ? getAccountNumber(descriptor)
        : undefined;
      return accountNumber !== undefined && !onlyDefaultAccount
        ? `${baseLabel} - ${t('coinControl.groups.account', {
            account: accountNumber
          })}`
        : baseLabel;
    },
    [onlyDefaultAccount, t]
  );
  const utxoGroups = useMemo(() => {
    const groups: Array<{ label: string; items: UtxoAvailability[] }> = [];
    utxosAvailability.forEach(availability => {
      const label = getGroupLabel(availability.utxoData);
      const group = groups.find(group => group.label === label);
      if (group) group.items.push(availability);
      else groups.push({ label, items: [availability] });
    });
    return groups;
  }, [getGroupLabel, utxosAvailability]);

  const formatAmount = useCallback(
    (amount: number) =>
      formatBtc({
        amount,
        subUnit: settings.SUB_UNIT,
        btcFiat,
        locale,
        currency
      }),
    [btcFiat, currency, locale, settings.SUB_UNIT]
  );

  return (
    <Modal
      headerMini={true}
      isVisible={isVisible}
      title={t('coinControl.title')}
      icon={icon}
      onClose={onClose}
      {...(onModalHide ? { onModalHide } : {})}
      customButtons={
        step === 'intro' ? (
          <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
            <Button mode="secondary" onPress={onClose}>
              {t('cancelButton')}
            </Button>
            <Button onPress={handleContinue}>{t('continueButton')}</Button>
          </View>
        ) : (
          <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
            <Button mode="secondary" onPress={onClose}>
              {t('cancelButton')}
            </Button>
          </View>
        )
      }
    >
      {step === 'intro' ? (
        <Text className="text-base text-slate-600 px-2 pb-4">
          {t('coinControl.intro')}
        </Text>
      ) : utxoGroups.length ? (
        <View className="gap-4 px-2 pb-4">
          {utxoGroups.map(group => (
            <View key={group.label} className="gap-2">
              <Text className="text-sm font-medium text-card-secondary uppercase">
                {group.label}
              </Text>
              {group.items.map(availability => {
                const disabled = availability.status !== 'selectable';
                const txId = availability.utxoData.tx.getId();
                const outpoint = `${txId}:${availability.utxoData.vout}`;
                return (
                  <View
                    key={outpoint}
                    className={`rounded-xl border border-slate-200 bg-white p-3 ${disabled ? 'opacity-50' : ''}`}
                  >
                    <View className="flex-row items-start justify-between gap-3">
                      <Text className="shrink text-base font-medium text-slate-900">
                        {formatAmount(getUtxoValue(availability.utxoData))}
                      </Text>
                      <Text className="text-xs text-slate-500">
                        {getShortOutpoint(availability.utxoData)}
                      </Text>
                    </View>
                    {availability.status === 'temporarilyUnavailable' ? (
                      <Text className="pt-1 text-xs text-slate-500">
                        {t(
                          `coinControl.disabledReasons.${availability.reason}`
                        )}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      ) : (
        <Text className="text-base text-slate-600 px-2 pb-4">
          {t('coinControl.noUtxos')}
        </Text>
      )}
    </Modal>
  );
};

export default React.memo(CoinControlModal);
