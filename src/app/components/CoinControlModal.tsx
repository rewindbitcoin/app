// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, IconType, Modal } from '../../common/ui';
import { formatBtc } from '../lib/btcRates';
import { toNumber } from '../lib/sats';
import type { UtxoAvailability } from '../lib/utxoPolicy';
import { useLocalization } from '../hooks/useLocalization';
import { useSettings } from '../hooks/useSettings';
import type { UtxosData } from '../lib/vaults';

type CoinControlModalProps = {
  isVisible: boolean;
  utxosAvailability: UtxoAvailability[];
  /**
   * UTXOs manually picked by the user before opening the modal.
   * These are preselected in the picker; auto coin-selection candidates are not passed here.
   */
  pickedUtxosData: UtxosData;
  btcFiat: number | undefined;
  onClose: () => void;
  onConfirm: (pickedUtxosData: UtxosData) => void;
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

const getOutpoint = (utxoData: UtxoAvailability['utxoData']) =>
  `${utxoData.tx.getId()}:${utxoData.vout}`;

const getDescriptor = (utxoData: UtxoAvailability['utxoData']) =>
  (utxoData as UtxoDataWithDescriptor).descriptor;

const getAccountNumber = (descriptor: string) =>
  descriptor.match(/\/(\d+)'\]/)?.[1];

const CoinControlModal = ({
  isVisible,
  utxosAvailability,
  pickedUtxosData,
  btcFiat,
  onClose,
  onConfirm,
  onModalHide
}: CoinControlModalProps) => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { locale, currency } = useLocalization();
  const [step, setStep] = useState<'intro' | 'coinselect'>('intro');
  const [pickedOutpoints, setPickedOutpoints] = useState<Set<string>>(
    () => new Set()
  );

  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );

  useEffect(() => {
    if (isVisible)
      setPickedOutpoints(
        new Set(pickedUtxosData.map(utxoData => getOutpoint(utxoData)))
      );
    else setStep('intro');
  }, [isVisible, pickedUtxosData]);

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

  const pickedModalUtxosData = useMemo(
    () =>
      utxosAvailability
        .filter(
          availability =>
            availability.status === 'selectable' &&
            pickedOutpoints.has(getOutpoint(availability.utxoData))
        )
        .map(availability => availability.utxoData),
    [pickedOutpoints, utxosAvailability]
  );
  const handleToggleUtxo = useCallback((outpoint: string) => {
    setPickedOutpoints(pickedOutpoints => {
      const nextPickedOutpoints = new Set(pickedOutpoints);
      if (nextPickedOutpoints.has(outpoint)) nextPickedOutpoints.delete(outpoint);
      else nextPickedOutpoints.add(outpoint);
      return nextPickedOutpoints;
    });
  }, []);
  const handleConfirm = useCallback(() => {
    onConfirm(pickedModalUtxosData);
  }, [onConfirm, pickedModalUtxosData]);

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
            <Button
              onPress={handleConfirm}
              disabled={pickedModalUtxosData.length === 0}
            >
              {t('continueButton')}
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
                const outpoint = getOutpoint(availability.utxoData);
                const picked = pickedOutpoints.has(outpoint);
                const Row = disabled ? View : Pressable;
                return (
                  <Row
                    key={outpoint}
                    {...(!disabled
                      ? { onPress: () => handleToggleUtxo(outpoint) }
                      : {})}
                    className={`rounded-xl border bg-white p-3 ${picked ? 'border-primary' : 'border-slate-200'} ${disabled ? 'opacity-50' : ''}`}
                  >
                    <View className="flex-row items-start justify-between gap-3">
                      <View className="shrink flex-row items-start gap-3">
                        <View
                          className={`mt-1 h-4 w-4 items-center justify-center rounded-full border ${picked ? 'border-primary' : 'border-slate-300'}`}
                        >
                          {picked ? (
                            <View className="h-2 w-2 rounded-full bg-primary" />
                          ) : null}
                        </View>
                        <Text className="shrink text-base font-medium text-slate-900">
                          {formatAmount(getUtxoValue(availability.utxoData))}
                        </Text>
                      </View>
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
                  </Row>
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
