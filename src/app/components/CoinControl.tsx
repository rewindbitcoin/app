// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import React, { useCallback, useMemo } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { Button, IconType, useToast } from '../../common/ui';
import { formatBtc } from '../lib/btcRates';
import { formatBlocks, formatDate, getShortOutpoint } from '../lib/format';
import { toNumber } from '../lib/sats';
import type { UtxoAvailability } from '../lib/utxoPolicy';
import { useLocalization } from '../hooks/useLocalization';
import { useSettings } from '../hooks/useSettings';
import type { HistoryDataItem, UtxosData } from '../lib/vaults';
import { useWallet } from '../hooks/useWallet';
import { getWalletLabelText } from '../lib/labels';
import { getOutputAddressNoteText } from '../lib/addressNoteLabels';
import { networkMapping } from '../lib/network';
import {
  getStandardAccountScriptDefinition,
  getStandardAccountScriptType
} from '../lib/vaultDescriptors';
import LabelEditor from './LabelEditor';

/**
 * Props for one coin-control picking session.
 *
 * The enclosing modal owns the transient selection so its fixed footer and
 * dismissal guard always reflect the same draft as these rows.
 */
type CoinControlPanelProps = {
  utxosAvailability: UtxoAvailability[];
  /**
   * Current draft, not the committed transaction selection.
   */
  pickedUtxosData: UtxosData;
  btcFiat: number | undefined;
  onChange: (pickedUtxosData: UtxosData) => void;
};

type UtxoDataWithDescriptor = UtxoAvailability['utxoData'] & {
  descriptor?: string;
};

const coinControlIcon: IconType = { family: 'FontAwesome5', name: 'sliders-h' };

const assertNever = (value: never): never => {
  throw new Error(`Unhandled coin control value: ${value}`);
};

const getUtxoValue = (utxoData: UtxoAvailability['utxoData']) => {
  const output = utxoData.tx.outs[utxoData.vout];
  if (!output) throw new Error('Invalid UTXO output');
  return toNumber(output.value);
};

const getOutpoint = (utxoData: UtxoAvailability['utxoData']) =>
  `${utxoData.tx.getId()}:${utxoData.vout}`;

const getDescriptor = (utxoData: UtxoAvailability['utxoData']) =>
  (utxoData as UtxoDataWithDescriptor).descriptor;

const getAccountNumber = (descriptor: string) =>
  descriptor.match(/\/(\d+)'\]/)?.[1];

/**
 * Shell-free coin-control picker used inside advanced transaction options and
 * flows that are already inside a native modal.
 */
const RawCoinControlPanel = ({
  utxosAvailability,
  pickedUtxosData,
  btcFiat,
  onChange
}: CoinControlPanelProps) => {
  const { t } = useTranslation();
  const toast = useToast();
  const { settings } = useSettings();
  const {
    labels,
    setWalletLabelText,
    blockExplorerURL,
    historyData,
    networkId
  } = useWallet();
  const { locale, currency } = useLocalization();
  const pickedOutpoints = useMemo(
    () => new Set(pickedUtxosData.map(getOutpoint)),
    [pickedUtxosData]
  );

  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );

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
      const scriptType = descriptor
        ? getStandardAccountScriptType(descriptor)
        : undefined;
      const baseLabel = !descriptor
        ? t('coinControl.groups.wallet')
        : scriptType
          ? getStandardAccountScriptDefinition(
              scriptType
            ).getCoinControlGroupLabel(t)
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

  const historyByTxId = useMemo(
    () => new Map(historyData?.map(item => [item.txId, item])),
    [historyData]
  );

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

  const formatOriginTime = useCallback(
    (historyItem: HistoryDataItem | undefined) => {
      if (!historyItem) return;
      if (historyItem.blockHeight === 0)
        return 'pushTime' in historyItem && historyItem.pushTime
          ? t('coinControl.originSubmittedOn', {
              date: formatDate(historyItem.pushTime, locale)
            })
          : t('coinControl.originConfirming');
      const blockTime =
        'blockTime' in historyItem ? historyItem.blockTime : undefined;
      return blockTime
        ? t('coinControl.originConfirmedOn', {
            date: formatDate(blockTime, locale)
          })
        : t('coinControl.originConfirmedBlock', {
            block: historyItem.blockHeight
          });
    },
    [locale, t]
  );
  const getDisabledReasonLabel = useCallback(
    (
      availability: Extract<
        UtxoAvailability,
        { status: 'temporarilyUnavailable' }
      >
    ) => {
      switch (availability.reason) {
        case 'unconfirmedAcceleratableOutput':
          return t(
            'coinControl.disabledReasons.unconfirmedAcceleratableOutput'
          );
        case 'unconfirmedV3Output':
          return t('coinControl.disabledReasons.unconfirmedV3Output');
        case 'trucRequiresConfirmedInput':
          return t('coinControl.disabledReasons.trucRequiresConfirmedInput');
        case 'frozenVaultOutput':
          return t('coinControl.disabledReasons.frozenVaultOutput', {
            timeRemaining: formatBlocks(
              availability.remainingBlocks,
              t,
              locale,
              true
            )
          });
        default:
          return assertNever(availability);
      }
    },
    [locale, t]
  );

  const handleToggleUtxo = useCallback(
    (outpoint: string) => {
      const nextPickedOutpoints = new Set(pickedOutpoints);
      if (nextPickedOutpoints.has(outpoint))
        nextPickedOutpoints.delete(outpoint);
      else nextPickedOutpoints.add(outpoint);
      onChange(
        utxosAvailability
          .filter(
            availability =>
              availability.status === 'selectable' &&
              nextPickedOutpoints.has(getOutpoint(availability.utxoData))
          )
          .map(availability => availability.utxoData)
      );
    },
    [onChange, pickedOutpoints, utxosAvailability]
  );
  const handleCopyOutpoint = useCallback(
    (outpoint: string) => {
      Clipboard.setStringAsync(outpoint);
      toast.show(t('coinControl.copyOutpointSuccess'), {
        type: 'success',
        duration: 2000
      });
    },
    [t, toast]
  );

  return (
    <View>
      {utxoGroups.length ? (
        <View className="gap-4 px-2 pb-4">
          {utxoGroups.map(group => (
            <View key={group.label} className="gap-2">
              <Text className="text-sm font-medium text-card-secondary uppercase">
                {group.label}
              </Text>
              {group.items.map(availability => {
                const disabled = availability.status !== 'selectable';
                const outpoint = getOutpoint(availability.utxoData);
                const txId = availability.utxoData.tx.getId();
                const label = getWalletLabelText(labels, 'output', outpoint);
                const txLabel = getWalletLabelText(labels, 'tx', txId);
                const network = networkId
                  ? networkMapping[networkId]
                  : undefined;
                const addressNoteLabel = network
                  ? getOutputAddressNoteText({
                      labels,
                      tx: availability.utxoData.tx,
                      vout: availability.utxoData.vout,
                      network
                    })
                  : '';
                const originTime = formatOriginTime(historyByTxId.get(txId));
                const originSummary = originTime ?? group.label;
                const picked = pickedOutpoints.has(outpoint);
                const disabledReason =
                  availability.status === 'temporarilyUnavailable'
                    ? getDisabledReasonLabel(availability)
                    : null;
                return (
                  <View
                    key={outpoint}
                    className={`rounded-xl border bg-white p-3 ${picked ? 'border-primary' : 'border-slate-200'} ${disabled ? 'opacity-50' : ''}`}
                  >
                    <Pressable
                      disabled={disabled}
                      onPress={() => handleToggleUtxo(outpoint)}
                      className="flex-row items-start gap-3"
                    >
                      <View className="pt-1">
                        <View
                          className={`h-4 w-4 items-center justify-center rounded-full border ${picked ? 'border-primary' : 'border-slate-300'}`}
                        >
                          {picked ? (
                            <View className="h-2 w-2 rounded-full bg-primary" />
                          ) : null}
                        </View>
                      </View>
                      <View className="flex-1 gap-1">
                        <Text className="text-base font-medium text-slate-900">
                          {formatAmount(getUtxoValue(availability.utxoData))}
                        </Text>
                        <Text className="text-xs text-slate-500">
                          {originSummary}
                        </Text>
                        {txLabel ? (
                          <Text className="text-xs text-slate-500">
                            {t('coinControl.parentTxLabel', { label: txLabel })}
                          </Text>
                        ) : null}
                        {!label && addressNoteLabel ? (
                          <Text className="text-xs text-slate-500">
                            {t('coinControl.addressNoteContext', {
                              label: addressNoteLabel
                            })}
                          </Text>
                        ) : null}
                      </View>
                    </Pressable>
                    {disabledReason ? (
                      <Text className="pt-1 text-xs text-slate-500">
                        {disabledReason}
                      </Text>
                    ) : null}
                    <LabelEditor
                      className="pt-3"
                      label={label}
                      placeholder={t('coinControl.labelPlaceholder')}
                      disabled={!labels}
                      onSave={label =>
                        setWalletLabelText({
                          type: 'output',
                          ref: outpoint,
                          label
                        })
                      }
                    />
                    <View className="mt-2 flex-row flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <Text className="shrink text-xs text-slate-500">
                        {t('coinControl.outpointId', {
                          outpoint: getShortOutpoint(
                            txId,
                            availability.utxoData.vout
                          )
                        })}
                      </Text>
                      <View className="flex-row flex-wrap items-center justify-end gap-x-4 gap-y-1">
                        {blockExplorerURL ? (
                          <Button
                            mode="text"
                            containerClassName="!min-w-0"
                            textClassName="!text-xs"
                            iconRight={{
                              family: 'FontAwesome5',
                              name: 'external-link-alt'
                            }}
                            onPress={() =>
                              Linking.openURL(`${blockExplorerURL}/${txId}`)
                            }
                          >
                            {t('viewButton')}
                          </Button>
                        ) : null}
                        <Button
                          mode="text"
                          containerClassName="!min-w-0"
                          textClassName="!text-xs"
                          iconRight={{ family: 'FontAwesome6', name: 'copy' }}
                          onPress={() => handleCopyOutpoint(outpoint)}
                        >
                          {t('copyButton')}
                        </Button>
                      </View>
                    </View>
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
    </View>
  );
};

export const CoinControlPanel = React.memo(RawCoinControlPanel);
export { coinControlIcon };
