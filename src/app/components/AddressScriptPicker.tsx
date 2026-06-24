// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

/*
 * Lets advanced users pick a standard address from this wallet by script type,
 * account, receive/change side, and index. The picker returns the selected
 * address plus its ranged descriptor and index; callers decide whether to use it
 * as a receive address or as custom transaction change. It does not offer
 * arbitrary external change addresses: custom change must still be derived from
 * this wallet's signer so future wallet sync can find the funds.
 *
 * The component is deliberately conservative because manual address selection can
 * make funds hard to find later. It blocks invalid BIP32 numbers, indexes outside
 * the current gap-limit window, skipped accounts, and change addresses for
 * accounts with no receive history. A skipped account means choosing account N
 * while an earlier account for the same script type has no receive history; for
 * example, account 2 is blocked if account 1 was never used. The picker only
 * warns for choices that are still recoverable: reused addresses and unused
 * non-default receive accounts.
 *
 * Safety checks are account-local and script-local. Receive addresses may use the
 * first unused account for their script type, but they may not skip an earlier
 * unused account. Change addresses are stricter: the same account must already
 * have receive history before its change range can be used.
 *
 * Network work is kept separate from typing. The picker never fetches one exact
 * address index. Tracked accounts are accounts already saved in the wallet's
 * account list; the main WalletContext sync fetches both receive (/0/*) and
 * change (/1/*) ranges for them. Untracked accounts are temporary candidates the
 * user has typed or reached with the modal controls before confirming the modal.
 * For those temporary accounts, this component may fetch a whole range after a
 * short pause, but only when cache is unknown or stale and the fetch can resolve
 * a safety decision or load the default next index.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { Pressable, Text, View } from 'react-native';
import type { TextInput } from 'react-native';
import type { Account } from '@bitcoinerlab/discovery';
import { useTranslation } from 'react-i18next';
import { Button, Modal, NumberInput } from '../../common/ui';
import { localizedStrToNumber } from '../../common/lib/numbers';
import { useLocalization } from '../hooks/useLocalization';
import { useSettings } from '../hooks/useSettings';
import { useWallet } from '../hooks/useWallet';
import { networkMapping } from '../lib/network';
import {
  computeOutput,
  createStandardAccountDescriptor,
  DEFAULT_STANDARD_ACCOUNT,
  getStandardAccountScriptDefinition,
  isDefaultStandardAccount,
  ORDERED_STANDARD_ACCOUNT_SCRIPT_DEFINITIONS,
  parseStandardAccount,
  type StandardAccountScriptType
} from '../lib/vaultDescriptors';
import { SOFTWARE, type Signer } from '../lib/wallets';

export type AddressScriptSelection = {
  address: string;
  descriptor: string;
  index: number;
};

type AccountSafetyBlocker =
  | {
      type: 'previousAccountUnused';
      account: number;
      previousAccount: number;
    }
  | {
      type: 'previousAccountUnknown';
      account: number;
      previousAccount: number;
    }
  | { type: 'changeAccountUnknown'; account: number }
  | { type: 'changeAccountUnused'; account: number };

type ExternalHistoryState = 'used' | 'unused' | 'unknown';

type PendingRangeFetchPurpose =
  | 'loadCurrentRangeDefaultIndex'
  | 'checkPreviousAccountReceiveHistory'
  | 'checkChangeAccountReceiveHistory';

type PendingRangeFetch = {
  account: Account;
  change: 0 | 1;
  descriptor: string;
  purpose: PendingRangeFetchPurpose;
};

type AddressScriptPickerPanelProps = {
  initialAccount: Account;
  initialChange: 0 | 1;
  initialIndex?: number;
  allowChangeSelection?: boolean;
  cancelText?: string;
  confirmText?: string;
  introText?: string;
  onCancel: () => void;
  onConfirm: (selection: AddressScriptSelection) => void;
};

type AddressScriptPickerModalProps = AddressScriptPickerPanelProps & {
  isVisible: boolean;
  onModalHide?: () => void;
};

const changeValues: Array<0 | 1> = [0, 1];
const MAX_BIP32_INDEX = 0x7fffffff;
const RANGE_FETCH_DEBOUNCE_MS = 700;
const RANGE_FRESH_SECONDS = 10 * 60;

const isRangeStatusFresh = (status: { timeFetched?: number }) =>
  status.timeFetched !== undefined &&
  status.timeFetched > 0 &&
  Math.floor(Date.now() / 1000) - status.timeFetched < RANGE_FRESH_SECONDS;

const getIntegerInputValue = (value: string, locale: string) => {
  const number = localizedStrToNumber(value, locale);
  return Number.isInteger(number) && number >= 0 && number <= MAX_BIP32_INDEX
    ? number
    : null;
};

// Panel shown inside an existing advanced-options screen. It lets the user pick
// script type, account, receive/change side, and address index. On confirm it
// returns the exact address plus its descriptor/index.
const RawAddressScriptPickerPanel = ({
  initialAccount,
  initialChange,
  initialIndex,
  allowChangeSelection = false,
  cancelText,
  confirmText,
  introText,
  onCancel,
  onConfirm
}: AddressScriptPickerPanelProps) => {
  const { t } = useTranslation();
  const { locale } = useLocalization();
  const { settings } = useSettings();
  const {
    accounts,
    fetchRangedDescriptor,
    getOutputHistory,
    getRangedDescriptorStatus,
    networkId,
    signers
  } = useWallet();
  const { accountNumber: initialAccountNumber, scriptType: initialScriptType } =
    parseStandardAccount(initialAccount);
  if (!networkId)
    throw new Error('AddressScriptPicker cannot be used before network loads');
  const network = networkMapping[networkId];
  if (!signers)
    throw new Error('AddressScriptPicker cannot be used before signers load');
  const signer = signers[0] as Signer | undefined;
  if (!signer) throw new Error('signer unavailable');
  const canDeriveStandardAccount = signer.type === SOFTWARE;
  // The account number comes from editable text. While the input is empty or
  // invalid, do not derive an account descriptor.
  const getAccountForInput = useCallback(
    (scriptType: StandardAccountScriptType, accountNumber: number | null) =>
      accountNumber !== null && canDeriveStandardAccount
        ? createStandardAccountDescriptor({
            signer,
            network,
            scriptType,
            account: accountNumber
          })
        : undefined,
    [canDeriveStandardAccount, network, signer]
  );
  const getDefaultIndexText = useCallback(
    (account: Account | undefined, change: 0 | 1) => {
      if (!account) return '';
      const nextIndex = getRangedDescriptorStatus({
        account,
        change
      }).nextIndex;
      return nextIndex === undefined ? '' : String(nextIndex);
    },
    [getRangedDescriptorStatus]
  );
  const [scriptType, setScriptType] =
    useState<StandardAccountScriptType>(initialScriptType);
  const [change, setChange] = useState<0 | 1>(initialChange);
  const [accountInput, setAccountInput] = useState(
    String(initialAccountNumber)
  );
  const [indexInput, setIndexInput] = useState(() =>
    initialIndex !== undefined
      ? String(initialIndex)
      : getDefaultIndexText(initialAccount, initialChange)
  );
  const accountInputRef = useRef<TextInput>(null);
  const indexInputRef = useRef<TextInput>(null);
  // Protect manual index edits from async range refreshes. Reset this only when
  // the selected range changes (script, account, or receive/change), because a
  // new range needs a new default index. If the user types an index inside the
  // current range, a later nextIndex result must not overwrite it.
  const indexInputEditedRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const accountNumber = getIntegerInputValue(accountInput, locale);
  const pickedIndex = getIntegerInputValue(indexInput, locale);
  const hasInvalidAccountInput =
    accountInput.trim() !== '' && accountNumber === null;
  const hasInvalidIndexInput = indexInput.trim() !== '' && pickedIndex === null;
  const hasInvalidInput = hasInvalidAccountInput || hasInvalidIndexInput;
  const account = useMemo(
    () => getAccountForInput(scriptType, accountNumber),
    [accountNumber, getAccountForInput, scriptType]
  );
  const handleScriptTypeChange = (type: StandardAccountScriptType) => {
    if (type === scriptType) return;
    const defaultAccountNumber = DEFAULT_STANDARD_ACCOUNT.accountNumber;
    const defaultAccount = getAccountForInput(type, defaultAccountNumber);
    setScriptType(type);
    setAccountInput(String(defaultAccountNumber));
    indexInputEditedRef.current = false;
    setIndexInput(getDefaultIndexText(defaultAccount, change));
  };
  const handleAccountInputChange = useCallback(
    (value: string) => {
      setAccountInput(value);
      const nextAccountNumber = getIntegerInputValue(value, locale);
      const nextAccount = getAccountForInput(scriptType, nextAccountNumber);
      if (nextAccount) {
        indexInputEditedRef.current = false;
        setIndexInput(getDefaultIndexText(nextAccount, change));
      }
    },
    [change, getAccountForInput, getDefaultIndexText, locale, scriptType]
  );
  const handleChangeChange = (value: 0 | 1) => {
    if (value === change) return;
    setChange(value);
    indexInputEditedRef.current = false;
    setIndexInput(getDefaultIndexText(account, value));
  };
  const handleIndexInputChange = useCallback((value: string) => {
    indexInputEditedRef.current = true;
    setIndexInput(value);
  }, []);

  const [refreshingDescriptor, setRefreshingDescriptor] = useState<string>();
  const descriptorStatus = account
    ? getRangedDescriptorStatus({ account, change })
    : undefined;
  const descriptor = descriptorStatus?.descriptor;
  // Cache-only: undefined means this range has not been fetched yet.
  const selectedRangeNextIndex = descriptorStatus?.nextIndex;
  const selectedRangeIsFresh =
    descriptorStatus !== undefined && isRangeStatusFresh(descriptorStatus);

  const address =
    descriptor && pickedIndex !== null
      ? computeOutput({ descriptor, index: pickedIndex }, network).getAddress()
      : undefined;
  const changeLabel =
    change === 0 ? t('addressPicker.external') : t('addressPicker.change');
  const scriptDefinition = getStandardAccountScriptDefinition(scriptType);
  const coinTypeLabel =
    networkId === 'BITCOIN'
      ? t('addressPicker.coinTypes.bitcoin')
      : t('addressPicker.coinTypes.test');
  const selectionSummary =
    accountNumber !== null && pickedIndex !== null
      ? t('addressPicker.pathSummary', {
          script: scriptDefinition.getAddressPickerLabel(t),
          purpose: scriptDefinition.purpose,
          coinType: coinTypeLabel,
          account: accountNumber,
          changeType: changeLabel,
          change,
          index: pickedIndex
        })
      : '';

  const isUsed = (() => {
    if (!descriptor || pickedIndex === null) return undefined;
    const history = getOutputHistory({ descriptor, index: pickedIndex });
    return history ? history.length > 0 : undefined;
  })();

  const lastSafeIndex =
    settings !== undefined && selectedRangeNextIndex !== undefined
      ? selectedRangeNextIndex + settings.GAP_LIMIT - 1
      : undefined;
  const isOutsideGapLimit =
    lastSafeIndex !== undefined &&
    pickedIndex !== null &&
    pickedIndex > lastSafeIndex;
  /*
   * Account safety uses external (/0/*) history. It treats unknown or stale
   * untracked history as a temporary blocker and lets the refresh effect below
   * resolve it.
   */
  const accountSafety: {
    blocker?: AccountSafetyBlocker;
    hasCurrentExternalHistory?: boolean;
  } = (() => {
    if (!accounts || accountNumber === null) return {};

    // An account counts as used only if its receive range (/0/*) has history.
    // Change-only history is not enough to make later accounts safe.
    const getExternalHistoryState = (
      candidateAccountNumber: number
    ): ExternalHistoryState => {
      if (
        candidateAccountNumber === accountNumber &&
        change === 0 &&
        selectedRangeNextIndex !== undefined
      ) {
        if (account && !accounts[account] && !selectedRangeIsFresh)
          return 'unknown';
        return selectedRangeNextIndex > 0 ? 'used' : 'unused';
      }

      try {
        const candidateAccount = createStandardAccountDescriptor({
          signer,
          network,
          scriptType,
          account: candidateAccountNumber
        });
        const status = getRangedDescriptorStatus({
          account: candidateAccount,
          change: 0
        });
        const nextIndex = status.nextIndex;
        return nextIndex === undefined
          ? 'unknown'
          : !accounts[candidateAccount] && !isRangeStatusFresh(status)
            ? 'unknown'
            : nextIndex > 0
              ? 'used'
              : 'unused';
      } catch {
        return 'unknown';
      }
    };

    // BIP44-style account discovery stops at the first unused account. Do not
    // allow account N until every earlier account for this script has receive
    // history.
    for (
      let candidateAccount = 0;
      candidateAccount < accountNumber;
      candidateAccount++
    ) {
      const historyState = getExternalHistoryState(candidateAccount);
      if (historyState !== 'used')
        return {
          blocker: {
            type:
              historyState === 'unknown'
                ? 'previousAccountUnknown'
                : 'previousAccountUnused',
            account: accountNumber,
            previousAccount: candidateAccount
          }
        };
    }

    const currentExternalHistoryState = getExternalHistoryState(accountNumber);
    if (change === 1 && currentExternalHistoryState !== 'used') {
      const blocker = {
        type:
          currentExternalHistoryState === 'unknown'
            ? 'changeAccountUnknown'
            : 'changeAccountUnused',
        account: accountNumber
      } as const;
      return currentExternalHistoryState === 'unknown'
        ? { blocker }
        : { blocker, hasCurrentExternalHistory: false };
    }

    return currentExternalHistoryState === 'unknown'
      ? {}
      : { hasCurrentExternalHistory: currentExternalHistoryState === 'used' };
  })();
  const accountSafetyBlocker = accountSafety.blocker;
  const showUnusedReceiveAccountWarning =
    change === 0 &&
    accountNumber !== null &&
    accountSafety.hasCurrentExternalHistory === false &&
    !accountSafetyBlocker &&
    !isDefaultStandardAccount({ scriptType, accountNumber });
  const hasSafetyBlocker =
    isOutsideGapLimit || accountSafetyBlocker !== undefined;
  const pendingRangeFetch: PendingRangeFetch | undefined = (() => {
    if (hasInvalidInput || !accounts || !account || accountNumber === null)
      return;
    if (accountSafetyBlocker?.type === 'previousAccountUnknown') {
      const previousAccount = getAccountForInput(
        scriptType,
        accountSafetyBlocker.previousAccount
      );
      if (!previousAccount || accounts[previousAccount]) return;
      const status = getRangedDescriptorStatus({
        account: previousAccount,
        change: 0
      });
      if (status.fetching || isRangeStatusFresh(status)) return;
      return {
        account: previousAccount,
        change: 0 as const,
        descriptor: status.descriptor,
        purpose: 'checkPreviousAccountReceiveHistory'
      };
    }
    if (accounts[account]) return;
    if (
      isOutsideGapLimit &&
      selectedRangeNextIndex !== undefined &&
      selectedRangeIsFresh
    )
      return;

    if (change === 1 && accountSafetyBlocker?.type === 'changeAccountUnknown') {
      const status = getRangedDescriptorStatus({ account, change: 0 });
      if (status.fetching || isRangeStatusFresh(status)) return;
      return {
        account,
        change: 0 as const,
        descriptor: status.descriptor,
        purpose: 'checkChangeAccountReceiveHistory'
      };
    }
    if (accountSafetyBlocker) return;

    if (
      !descriptor ||
      !descriptorStatus ||
      descriptorStatus.fetching ||
      selectedRangeIsFresh
    )
      return;
    return {
      account,
      change,
      descriptor,
      purpose: 'loadCurrentRangeDefaultIndex'
    };
  })();

  useEffect(() => {
    if (
      !pendingRangeFetch?.account ||
      pendingRangeFetch.change === undefined ||
      !pendingRangeFetch.descriptor
    )
      return;

    let cancelled = false;
    const timeout = setTimeout(() => {
      if (cancelled) return;

      setRefreshingDescriptor(pendingRangeFetch.descriptor);
      fetchRangedDescriptor({
        account: pendingRangeFetch.account,
        change: pendingRangeFetch.change,
        freshForSeconds: RANGE_FRESH_SECONDS
      })
        .then(status => {
          if (cancelled || !isMountedRef.current) return;
          const nextIndex = status.nextIndex;
          if (
            pendingRangeFetch.purpose !== 'loadCurrentRangeDefaultIndex' ||
            indexInputEditedRef.current ||
            nextIndex === undefined
          )
            return;
          setIndexInput(current =>
            current.trim() === '' ? String(nextIndex) : current
          );
        })
        .catch(error => {
          console.warn('Failed to refresh address picker range', error);
        })
        .finally(() => {
          if (cancelled || !isMountedRef.current) return;
          setRefreshingDescriptor(current =>
            current === pendingRangeFetch.descriptor ? undefined : current
          );
        });
    }, RANGE_FETCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [
    fetchRangedDescriptor,
    pendingRangeFetch?.account,
    pendingRangeFetch?.change,
    pendingRangeFetch?.descriptor,
    pendingRangeFetch?.purpose
  ]);

  const isRefreshingCurrentDescriptor =
    descriptor !== undefined && refreshingDescriptor === descriptor;
  const safetyBlockerText = isOutsideGapLimit
    ? t('addressPicker.gapBlocked', { max: lastSafeIndex })
    : accountSafetyBlocker?.type === 'previousAccountUnused'
      ? t('addressPicker.accountGapBlocked', {
          account: accountSafetyBlocker.account,
          previousAccount: accountSafetyBlocker.previousAccount
        })
      : accountSafetyBlocker?.type === 'previousAccountUnknown'
        ? t('addressPicker.previousAccountChecking', {
            account: accountSafetyBlocker.account,
            previousAccount: accountSafetyBlocker.previousAccount
          })
        : accountSafetyBlocker?.type === 'changeAccountUnused'
          ? t('addressPicker.changeAccountBlocked', {
              account: accountSafetyBlocker.account
            })
          : accountSafetyBlocker?.type === 'changeAccountUnknown'
            ? t('addressPicker.changeAccountChecking', {
                account: accountSafetyBlocker.account
              })
            : undefined;
  const selection =
    account &&
    descriptor &&
    address &&
    !hasSafetyBlocker &&
    accountNumber !== null &&
    pickedIndex !== null &&
    selectedRangeNextIndex !== undefined
      ? {
          address,
          descriptor,
          index: pickedIndex
        }
      : undefined;

  const handleConfirm = () => {
    if (!selection) return;
    onConfirm(selection);
  };

  if (!settings)
    throw new Error('AddressScriptPicker cannot be used before settings load');
  if (!canDeriveStandardAccount) {
    return (
      <View className="gap-4 px-2 pb-4">
        <Text className="text-base text-slate-600">
          {introText ?? t('addressPicker.intro')}
        </Text>
        <Text className="text-sm text-orange-600">
          {t('addressPicker.unsupportedSigner')}
        </Text>
        <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center">
          <Button mode="secondary" onPress={onCancel}>
            {cancelText ?? t('cancelButton')}
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View className="gap-4 px-2 pb-4">
      <Text className="text-base text-slate-600">
        {introText ?? t('addressPicker.intro')}
      </Text>

      <View className="gap-2">
        <Text className="text-sm font-medium text-card-secondary uppercase">
          {t('addressPicker.script')}
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {ORDERED_STANDARD_ACCOUNT_SCRIPT_DEFINITIONS.map(definition => (
            <Button
              key={definition.scriptType}
              mode={
                definition.scriptType === scriptType ? 'primary' : 'secondary'
              }
              containerClassName="!min-w-0"
              textClassName="!text-xs"
              onPress={() => handleScriptTypeChange(definition.scriptType)}
            >
              {definition.getAddressPickerLabel(t)}
            </Button>
          ))}
        </View>
      </View>

      {allowChangeSelection ? (
        <View className="gap-2">
          <Text className="text-sm font-medium text-card-secondary uppercase">
            {t('addressPicker.addressType')}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {changeValues.map(value => (
              <Button
                key={value}
                mode={value === change ? 'primary' : 'secondary'}
                containerClassName="!min-w-0"
                textClassName="!text-xs"
                onPress={() => handleChangeChange(value)}
              >
                {value === 0
                  ? t('addressPicker.external')
                  : t('addressPicker.change')}
              </Button>
            ))}
          </View>
        </View>
      ) : null}

      <View className="flex-row gap-3">
        <Pressable
          className="flex-1 rounded-xl border border-slate-200 bg-white p-3"
          onPress={() => accountInputRef.current?.focus()}
        >
          <Text className="text-xs text-slate-500">
            {t('addressPicker.account')}
          </Text>
          <View className="w-full overflow-hidden">
            <NumberInput
              ref={accountInputRef}
              locale={locale}
              strValue={accountInput}
              numberFormatting={false}
              style={{ fontSize: 18 }}
              onChangeValue={handleAccountInputChange}
            />
          </View>
        </Pressable>
        <Pressable
          className="flex-1 rounded-xl border border-slate-200 bg-white p-3"
          onPress={() => indexInputRef.current?.focus()}
        >
          <Text className="text-xs text-slate-500">
            {t('addressPicker.index')}
          </Text>
          <View className="w-full overflow-hidden">
            <NumberInput
              ref={indexInputRef}
              locale={locale}
              strValue={indexInput}
              numberFormatting={false}
              style={{ fontSize: 18 }}
              onChangeValue={handleIndexInputChange}
            />
          </View>
        </Pressable>
      </View>
      {hasInvalidInput ? (
        <Text className="text-sm text-red-600">
          {t('addressPicker.invalid', { max: MAX_BIP32_INDEX })}
        </Text>
      ) : null}

      <View className="rounded-xl bg-slate-50 p-3 gap-2">
        <View className="flex-row flex-wrap justify-between gap-2">
          <Text className="text-xs text-slate-500">
            {t('addressPicker.nextIndex', {
              index:
                selectedRangeNextIndex ??
                (isRefreshingCurrentDescriptor
                  ? t('addressPicker.checking')
                  : '-')
            })}
          </Text>
          <Text className="text-xs text-slate-500">
            {isRefreshingCurrentDescriptor
              ? t('addressPicker.checking')
              : isUsed === true
                ? t('addressPicker.used')
                : isUsed === false
                  ? t('addressPicker.unused')
                  : t('addressPicker.unknown')}
          </Text>
        </View>
        <Text selectable className="text-xs leading-5 text-slate-700">
          {address ?? '-'}
        </Text>
        {selectionSummary ? (
          <Text className="text-xs text-slate-500">{selectionSummary}</Text>
        ) : null}
      </View>

      {safetyBlockerText ? (
        <Text className="text-sm text-red-600">{safetyBlockerText}</Text>
      ) : null}
      {showUnusedReceiveAccountWarning ? (
        <Text className="text-sm text-orange-600">
          {t('addressPicker.newAccountWarning')}
        </Text>
      ) : null}
      {isUsed ? (
        <Text className="text-sm text-orange-600">
          {t('addressPicker.usedWarning')}
        </Text>
      ) : null}

      <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center">
        <Button mode="secondary" onPress={onCancel}>
          {cancelText ?? t('cancelButton')}
        </Button>
        <Button disabled={!selection} onPress={handleConfirm}>
          {confirmText ?? t('addressPicker.useAddress')}
        </Button>
      </View>
    </View>
  );
};

// Standalone modal wrapper for the same picker panel. Receive uses this when the
// user opens advanced address options from the receive screen.
const RawAddressScriptPickerModal = ({
  isVisible,
  onModalHide,
  ...panelProps
}: AddressScriptPickerModalProps) => {
  const { t } = useTranslation();
  return (
    <Modal
      headerMini={true}
      isVisible={isVisible}
      title={t('addressPicker.title')}
      icon={{ family: 'MaterialIcons', name: 'account-tree' }}
      onClose={panelProps.onCancel}
      {...(onModalHide ? { onModalHide } : {})}
      customButtons={<View />}
    >
      {isVisible ? <AddressScriptPickerPanel {...panelProps} /> : null}
    </Modal>
  );
};

export const AddressScriptPickerPanel = React.memo(RawAddressScriptPickerPanel);
export const AddressScriptPickerModal = React.memo(RawAddressScriptPickerModal);
