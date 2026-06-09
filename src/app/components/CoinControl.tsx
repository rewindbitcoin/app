// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { Button, IconType, Modal, useToast } from '../../common/ui';
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
import LabelEditor from './LabelEditor';

/**
 * Props for one coin-control picking session.
 *
 * The panel intentionally owns transient draft state: intro-vs-picker step and
 * currently toggled rows. Mount it when the user enters coin control, and
 * unmount it when the user leaves. That keeps the panel API simpler than
 * pushing a parent visibility flag into the picker.
 */
type CoinControlPanelProps = {
  utxosAvailability: UtxoAvailability[];
  /**
   * UTXOs manually picked by the user before opening this panel.
   * These are preselected in the picker; auto coin-selection candidates are not passed here.
   * Null means the user has not confirmed any manual picks yet.
   */
  pickedUtxosData: UtxosData | null;
  btcFiat: number | undefined;
  onClose: () => void;
  onConfirm: (pickedUtxosData: UtxosData) => void;
};

type CoinControlModalProps = CoinControlPanelProps & {
  isVisible: boolean;
  onModalHide?: () => void;
};

type CoinControlRecoveryPanelProps = {
  message: string;
  onOpenCoinControl: () => void;
  onUseAuto: () => void;
  className?: string;
  textClassName?: string;
};

type UtxoDataWithDescriptor = UtxoAvailability['utxoData'] & {
  descriptor?: string;
};

const coinControlIcon: IconType = { family: 'FontAwesome5', name: 'coins' };

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
 * Two-button recovery panel for manual coin-control picks that cannot meet the
 * current send, vault setup, or unfreeze requirements.
 *
 * The user has already picked UTXOs manually, but that exact selection cannot
 * build at the chosen amount/fee. This panel offers the same recovery choices
 * across Send, Vault Setup, and Unfreeze flows: go back to Coin Control to
 * re-pick UTXOs, or switch back to automatic coin selection.
 *
 * Callers still own the flow-specific buildability checks and message copy.
 * This component only owns the shared recovery layout and actions.
 */
const RawCoinControlRecoveryPanel = ({
  message,
  onOpenCoinControl,
  onUseAuto,
  className,
  textClassName = 'text-base m-auto self-center text-red-500'
}: CoinControlRecoveryPanelProps) => {
  const { t } = useTranslation();
  return (
    <View {...(className ? { className } : {})}>
      <Text className={textClassName}>{message}</Text>
      <View className="mt-4 flex-row flex-wrap justify-center gap-3">
        <Button mode="secondary" onPress={onOpenCoinControl}>
          {t('coinControl.title')}
        </Button>
        <Button mode="secondary" onPress={onUseAuto}>
          {t('coinControl.auto')}
        </Button>
      </View>
    </View>
  );
};

/**
 * Shell-free coin-control picker used by both standalone screens and flows that
 * are already inside a native modal.
 *
 * iOS cannot present a second React Native modal while another one is already
 * being presented. Keeping the picker content in this panel lets normal screens
 * use `CoinControlModal`, while modal-based flows such as vault actions can
 * show the same picker as another step inside their existing modal.
 */
const RawCoinControlPanel = ({
  utxosAvailability,
  pickedUtxosData,
  btcFiat,
  onClose,
  onConfirm
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
  const [step, setStep] = useState<'intro' | 'coinselect'>('intro');
  const [pickedOutpoints, setPickedOutpoints] = useState<Set<string>>(
    () => new Set(pickedUtxosData?.map(utxoData => getOutpoint(utxoData)) ?? [])
  );

  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
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

  const pickedPanelUtxosData = useMemo(
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
      if (nextPickedOutpoints.has(outpoint))
        nextPickedOutpoints.delete(outpoint);
      else nextPickedOutpoints.add(outpoint);
      return nextPickedOutpoints;
    });
  }, []);
  const handleConfirm = useCallback(() => {
    onConfirm(pickedPanelUtxosData);
  }, [onConfirm, pickedPanelUtxosData]);
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
                    ? t(`coinControl.disabledReasons.${availability.reason}`, {
                        timeRemaining:
                          availability.reason === 'frozenVaultOutput'
                            ? formatBlocks(
                                availability.remainingBlocks,
                                t,
                                locale,
                                true
                              )
                            : undefined
                      })
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
      <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
        <Button mode="secondary" onPress={onClose}>
          {t('cancelButton')}
        </Button>
        {step === 'intro' ? (
          <Button onPress={handleContinue}>{t('continueButton')}</Button>
        ) : (
          <Button
            onPress={handleConfirm}
            disabled={pickedPanelUtxosData.length === 0}
          >
            {t('continueButton')}
          </Button>
        )}
      </View>
    </View>
  );
};

const RawCoinControlModal = ({
  isVisible,
  utxosAvailability,
  pickedUtxosData,
  btcFiat,
  onClose,
  onConfirm,
  onModalHide
}: CoinControlModalProps) => {
  const { t } = useTranslation();
  // Keep the picker mounted while the modal animates out, then unmount it so
  // the next open starts a fresh session initialized from pickedUtxosData.
  const [isModalVisibleOrHiding, setIsModalVisibleOrHiding] =
    useState(isVisible);

  useEffect(() => {
    if (isVisible) setIsModalVisibleOrHiding(true);
  }, [isVisible]);

  const handleModalHide = useCallback(() => {
    setIsModalVisibleOrHiding(false);
    onModalHide?.();
  }, [onModalHide]);

  return (
    <Modal
      headerMini={true}
      isVisible={isVisible}
      title={t('coinControl.title')}
      icon={coinControlIcon}
      onClose={onClose}
      onModalHide={handleModalHide}
      customButtons={<View />}
    >
      {isModalVisibleOrHiding ? (
        <CoinControlPanel
          utxosAvailability={utxosAvailability}
          pickedUtxosData={pickedUtxosData}
          btcFiat={btcFiat}
          onClose={onClose}
          onConfirm={onConfirm}
        />
      ) : null}
    </Modal>
  );
};

export const CoinControlPanel = React.memo(RawCoinControlPanel);
export const CoinControlModal = React.memo(RawCoinControlModal);
export const CoinControlRecoveryPanel = React.memo(RawCoinControlRecoveryPanel);
export default CoinControlModal;
export { coinControlIcon };
