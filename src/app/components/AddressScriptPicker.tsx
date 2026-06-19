// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

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
  getStandardAccountDescriptorMetadata,
  STANDARD_ACCOUNT_SCRIPT_TYPES,
  type StandardAccountScriptType
} from '../lib/vaultDescriptors';
import { SOFTWARE, type Signer } from '../lib/wallets';

export type AddressScriptSelection = {
  address: string;
  descriptor: string;
  index: number;
  isBeyondGapLimit: boolean;
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

const scriptLabels: Record<StandardAccountScriptType, string> = {
  tr: 'addressPicker.scripts.taproot',
  wpkh: 'addressPicker.scripts.nativeSegwit',
  shWpkh: 'addressPicker.scripts.wrappedSegwit',
  pkh: 'addressPicker.scripts.legacy'
};

const scriptPurposes: Record<StandardAccountScriptType, number> = {
  tr: 86,
  wpkh: 84,
  shWpkh: 49,
  pkh: 44
};

const changeValues: Array<0 | 1> = [0, 1];
const MAX_BIP32_INDEX = 0x7fffffff;

const getIntegerInputValue = (value: string, locale: string) => {
  const number = localizedStrToNumber(value, locale);
  return Number.isInteger(number) && number >= 0 && number <= MAX_BIP32_INDEX
    ? number
    : null;
};

const getInputText = (value: number) => String(value);

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
    fetchOutputHistory,
    fetchRangedDescriptorWithNextIndex,
    getRangedDescriptorWithNextIndex,
    networkId,
    signers
  } = useWallet();
  const initialMetadata = useMemo(
    () => getStandardAccountDescriptorMetadata(initialAccount),
    [initialAccount]
  );
  const initialScriptType = initialMetadata.scriptType ?? 'wpkh';
  const initialAccountNumber = initialMetadata.accountNumber ?? 0;
  const [scriptType, setScriptType] =
    useState<StandardAccountScriptType>(initialScriptType);
  const [change, setChange] = useState<0 | 1>(initialChange);
  const [accountInput, setAccountInput] = useState(
    getInputText(initialAccountNumber)
  );
  const [indexInput, setIndexInput] = useState(getInputText(initialIndex ?? 0));
  const [isUsed, setIsUsed] = useState<boolean | undefined>();
  const [isCheckingHistory, setIsCheckingHistory] = useState(false);
  const [descriptor, setDescriptor] = useState<string | undefined>();
  const [nextIndex, setNextIndex] = useState<number | undefined>();
  const [isFetchingDefault, setIsFetchingDefault] = useState(false);
  const accountInputRef = useRef<TextInput>(null);
  const indexInputRef = useRef<TextInput>(null);
  const initialIndexAppliedRef = useRef(false);
  const indexTouchedRef = useRef(false);

  const signer = signers?.[0] as Signer | undefined;
  const network = networkId ? networkMapping[networkId] : undefined;

  const accountNumber = getIntegerInputValue(accountInput, locale);
  const pickedIndex = getIntegerInputValue(indexInput, locale);
  const canDeriveStandardAccount = signer?.type === SOFTWARE;
  const hasInvalidAccountInput =
    accountInput.trim() !== '' && accountNumber === null;
  const hasInvalidIndexInput = indexInput.trim() !== '' && pickedIndex === null;
  const hasInvalidInput = hasInvalidAccountInput || hasInvalidIndexInput;
  const account = useMemo(
    () =>
      accountNumber !== null && canDeriveStandardAccount && signer && network
        ? createStandardAccountDescriptor({
            signer,
            network,
            scriptType,
            account: accountNumber
          })
        : undefined,
    [accountNumber, canDeriveStandardAccount, network, scriptType, signer]
  );
  const resetDefaultIndex = useCallback(() => {
    indexTouchedRef.current = false;
    setDescriptor(undefined);
    setNextIndex(undefined);
    setIsUsed(undefined);
    setIsFetchingDefault(true);
    setIndexInput('');
  }, []);
  const handleScriptTypeChange = useCallback(
    (type: StandardAccountScriptType) => {
      initialIndexAppliedRef.current = true;
      setScriptType(type);
      setAccountInput(getInputText(0));
      setChange(initialChange);
      resetDefaultIndex();
    },
    [initialChange, resetDefaultIndex]
  );
  const handleAccountInputChange = useCallback(
    (value: string) => {
      initialIndexAppliedRef.current = true;
      setAccountInput(value);
      setChange(initialChange);
      resetDefaultIndex();
    },
    [initialChange, resetDefaultIndex]
  );
  const handleChangeChange = useCallback(
    (value: 0 | 1) => {
      initialIndexAppliedRef.current = true;
      setChange(value);
      resetDefaultIndex();
    },
    [resetDefaultIndex]
  );
  const handleIndexInputChange = useCallback((value: string) => {
    indexTouchedRef.current = true;
    setIsUsed(undefined);
    setIsCheckingHistory(false);
    setIndexInput(value);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const resolveDefault = async () => {
      await Promise.resolve();
      if (cancelled) return;
      setDescriptor(undefined);
      setNextIndex(undefined);
      setIsUsed(undefined);
      if (!account) {
        setIsFetchingDefault(false);
        return;
      }
      setIsFetchingDefault(true);

      const applyResolvedDefault = (result: {
        descriptor: string;
        nextIndex: number;
      }) => {
        const { descriptor, nextIndex } = result;
        const shouldUseInitialIndex =
          !initialIndexAppliedRef.current && initialIndex !== undefined;
        initialIndexAppliedRef.current = true;
        setDescriptor(descriptor);
        setNextIndex(nextIndex);
        if (!indexTouchedRef.current)
          setIndexInput(
            getInputText(shouldUseInitialIndex ? initialIndex : nextIndex)
          );
      };

      try {
        applyResolvedDefault(
          getRangedDescriptorWithNextIndex({ account, change })
        );
        setIsFetchingDefault(false);
        return;
      } catch (error) {
        if (accounts?.[account])
          console.warn('Tracked address change missing from discovery', error);
      }

      await new Promise(resolve => setTimeout(resolve, 200));
      if (cancelled) return;

      try {
        const result = await fetchRangedDescriptorWithNextIndex({
          account,
          change
        });
        if (cancelled) return;
        if (!result) {
          setDescriptor(undefined);
          setNextIndex(undefined);
          return;
        }
        applyResolvedDefault(result);
      } catch (error) {
        console.warn('Failed to fetch selected address change', error);
        if (!cancelled) {
          setDescriptor(undefined);
          setNextIndex(undefined);
        }
      } finally {
        if (!cancelled) setIsFetchingDefault(false);
      }
    };
    void resolveDefault();

    return () => {
      cancelled = true;
    };
  }, [
    account,
    accounts,
    change,
    fetchRangedDescriptorWithNextIndex,
    getRangedDescriptorWithNextIndex,
    initialIndex
  ]);

  const address = useMemo(
    () =>
      descriptor && pickedIndex !== null && network
        ? computeOutput(
            { descriptor, index: pickedIndex },
            network
          ).getAddress()
        : undefined,
    [descriptor, network, pickedIndex]
  );
  const changeLabel =
    change === 0 ? t('addressPicker.external') : t('addressPicker.change');
  const coinTypeLabel =
    networkId === 'BITCOIN'
      ? t('addressPicker.coinTypes.bitcoin')
      : t('addressPicker.coinTypes.test');
  const selectionSummary =
    accountNumber !== null && pickedIndex !== null
      ? t('addressPicker.pathSummary', {
          script: t(scriptLabels[scriptType]),
          purpose: scriptPurposes[scriptType],
          coinType: coinTypeLabel,
          account: accountNumber,
          changeType: changeLabel,
          change,
          index: pickedIndex
        })
      : '';

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (cancelled) return;
      if (!descriptor || pickedIndex === null) {
        setIsUsed(undefined);
        setIsCheckingHistory(false);
        return;
      }
      setIsUsed(undefined);
      setIsCheckingHistory(true);
      const checkHistory = async () => {
        try {
          const history = await fetchOutputHistory({
            descriptor,
            index: pickedIndex
          });
          if (!cancelled) setIsUsed(history ? history.length > 0 : undefined);
        } catch (error) {
          console.warn('Failed to check address history', error);
          if (!cancelled) setIsUsed(undefined);
        } finally {
          if (!cancelled) setIsCheckingHistory(false);
        }
      };
      void checkHistory();
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [descriptor, fetchOutputHistory, pickedIndex]);

  const isBeyondGapLimit =
    settings !== undefined &&
    nextIndex !== undefined &&
    pickedIndex !== null &&
    pickedIndex >= nextIndex + settings.GAP_LIMIT;
  const isNewUntrackedAccount =
    account !== undefined &&
    accountNumber !== null &&
    accountNumber !== 0 &&
    accounts !== undefined &&
    !accounts[account];
  const selection = useMemo(
    () =>
      account &&
      descriptor &&
      address &&
      accountNumber !== null &&
      pickedIndex !== null &&
      nextIndex !== undefined
        ? {
            address,
            descriptor,
            index: pickedIndex,
            isBeyondGapLimit
          }
        : undefined,
    [
      account,
      accountNumber,
      address,
      descriptor,
      isBeyondGapLimit,
      nextIndex,
      pickedIndex
    ]
  );

  const handleConfirm = useCallback(() => {
    if (!selection) return;
    onConfirm(selection);
  }, [onConfirm, selection]);

  if (!settings)
    throw new Error('AddressScriptPicker cannot be used before settings load');
  if (!networkId || !network)
    throw new Error('AddressScriptPicker cannot be used before network loads');
  if (!signers)
    throw new Error('AddressScriptPicker cannot be used before signers load');
  if (!signer) throw new Error('signer unavailable');
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
          {STANDARD_ACCOUNT_SCRIPT_TYPES.map(type => (
            <Button
              key={type}
              mode={type === scriptType ? 'primary' : 'secondary'}
              containerClassName="!min-w-0"
              textClassName="!text-xs"
              onPress={() => handleScriptTypeChange(type)}
            >
              {t(scriptLabels[type])}
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
                nextIndex ??
                (isFetchingDefault ? t('addressPicker.checking') : '-')
            })}
          </Text>
          <Text className="text-xs text-slate-500">
            {isCheckingHistory
              ? t('addressPicker.checking')
              : isUsed === true
                ? t('addressPicker.used')
                : isUsed === false
                  ? t('addressPicker.unused')
                  : t('addressPicker.unknown')}
          </Text>
        </View>
        <Text selectable className="text-xs leading-5 text-slate-700">
          {address ?? (isFetchingDefault ? t('addressPicker.checking') : '-')}
        </Text>
        {selectionSummary ? (
          <Text className="text-xs text-slate-500">{selectionSummary}</Text>
        ) : null}
      </View>

      {isBeyondGapLimit ? (
        <Text className="text-sm text-red-600">
          {t('addressPicker.gapWarning', {
            gapLimit: settings.GAP_LIMIT
          })}
        </Text>
      ) : null}
      {isNewUntrackedAccount ? (
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
