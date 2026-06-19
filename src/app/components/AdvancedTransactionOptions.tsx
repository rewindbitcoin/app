// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import type { Account } from '@bitcoinerlab/discovery';
import { useTranslation } from 'react-i18next';
import { Button, IconType, Modal } from '../../common/ui';
import type { UtxoAvailability } from '../lib/utxoPolicy';
import type { UtxosData } from '../lib/vaults';
import { useSettings } from '../hooks/useSettings';
import {
  AddressScriptPickerPanel,
  type AddressScriptSelection
} from './AddressScriptPicker';
import { CoinControlPanel, coinControlIcon } from './CoinControl';

type AdvancedTransactionOptionsPanelProps = {
  entryScreen?: 'overview' | 'coinSelection' | 'changeAddressSelection';
  utxosAvailability?: UtxoAvailability[];
  pickedUtxosData?: UtxosData | null;
  btcFiat: number | undefined;
  changeAddressSelection?: AddressScriptSelection | null;
  initialChangeAccount?: Account;
  onClose: () => void;
  onClearCoinSelection?: () => void;
  onClearChangeAddress?: () => void;
  onConfirmChangeAddress?: (selection: AddressScriptSelection) => void;
  onConfirmCoinSelection?: (pickedUtxosData: UtxosData) => void;
};

type AdvancedTransactionOptionsModalProps =
  AdvancedTransactionOptionsPanelProps & {
    isVisible: boolean;
    onModalHide?: () => void;
  };

const advancedTransactionOptionsIcon: IconType = coinControlIcon;

// Panel shown inside the advanced options modal. The user sees an overview of
// optional transaction controls, then can open coin selection or custom change
// selection. Confirming a sub-screen returns the picked coins or address to the
// parent screen.
const RawAdvancedTransactionOptionsPanel = ({
  entryScreen = 'overview',
  utxosAvailability,
  pickedUtxosData,
  btcFiat,
  changeAddressSelection,
  initialChangeAccount,
  onClose,
  onClearCoinSelection,
  onClearChangeAddress,
  onConfirmChangeAddress,
  onConfirmCoinSelection
}: AdvancedTransactionOptionsPanelProps) => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  // The parent can open the modal directly on a sub-screen. If that entry
  // changes while this panel is still mounted, ignore the stale local screen.
  const [screenState, setScreenState] = useState<{
    entryScreen: 'overview' | 'coinSelection' | 'changeAddressSelection';
    screen: 'overview' | 'coinSelection' | 'changeAddressSelection';
  }>(() => ({ entryScreen, screen: entryScreen }));
  const screen =
    screenState.entryScreen === entryScreen ? screenState.screen : entryScreen;
  const setPanelScreen = useCallback(
    (screen: 'overview' | 'coinSelection' | 'changeAddressSelection') => {
      setScreenState({ entryScreen, screen });
    },
    [entryScreen]
  );

  const canChooseCoins =
    utxosAvailability !== undefined && onConfirmCoinSelection !== undefined;
  const canChooseChangeAddress =
    initialChangeAccount !== undefined && onConfirmChangeAddress !== undefined;
  const hasPickedCoins =
    pickedUtxosData !== undefined && pickedUtxosData !== null;
  const hasCustomChangeAddress =
    changeAddressSelection !== undefined && changeAddressSelection !== null;
  const selectedChangeAccount = changeAddressSelection
    ? (changeAddressSelection.descriptor.replace(
        /\/[01]\/\*/g,
        '/0/*'
      ) as Account)
    : undefined;
  const hasAdvancedSelection = hasPickedCoins || hasCustomChangeAddress;

  const handleConfirmCoinSelection = useCallback(
    (selection: UtxosData) => {
      onConfirmCoinSelection?.(selection);
      onClose();
    },
    [onClose, onConfirmCoinSelection]
  );
  const handleConfirmChangeAddress = useCallback(
    (selection: AddressScriptSelection) => {
      onConfirmChangeAddress?.(selection);
      onClose();
    },
    [onClose, onConfirmChangeAddress]
  );
  const handleUseDefaults = useCallback(() => {
    onClearCoinSelection?.();
    onClearChangeAddress?.();
    onClose();
  }, [onClearChangeAddress, onClearCoinSelection, onClose]);

  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );

  if (
    screen === 'coinSelection' &&
    utxosAvailability !== undefined &&
    onConfirmCoinSelection !== undefined
  ) {
    return (
      <CoinControlPanel
        utxosAvailability={utxosAvailability}
        pickedUtxosData={pickedUtxosData ?? null}
        btcFiat={btcFiat}
        onClose={() => setPanelScreen('overview')}
        onConfirm={handleConfirmCoinSelection}
      />
    );
  }

  if (
    screen === 'changeAddressSelection' &&
    initialChangeAccount !== undefined &&
    onConfirmChangeAddress !== undefined
  ) {
    return (
      <AddressScriptPickerPanel
        initialAccount={selectedChangeAccount ?? initialChangeAccount}
        initialChange={1}
        {...(changeAddressSelection
          ? { initialIndex: changeAddressSelection.index }
          : {})}
        cancelText={t('coinControl.back')}
        confirmText={t('coinControl.useChangeAddress')}
        introText={t('addressPicker.changeIntro')}
        onCancel={() => setPanelScreen('overview')}
        onConfirm={handleConfirmChangeAddress}
      />
    );
  }

  return (
    <View>
      <View className="px-2 pb-4 gap-4">
        <Text className="text-base text-slate-600">
          {t('coinControl.intro')}
        </Text>
        {canChooseCoins ? (
          <View className="rounded-xl border border-slate-200 bg-white p-3 gap-3">
            <View className="flex-row flex-wrap items-center justify-between gap-2">
              <Text className="text-base font-medium text-slate-900">
                {t('coinControl.chooseCoins')}
              </Text>
              <Text className="text-xs text-slate-500">
                {pickedUtxosData
                  ? t('coinControl.selectedCoins', {
                      count: pickedUtxosData.length
                    })
                  : t('coinControl.automaticCoins')}
              </Text>
            </View>
            <Text className="text-sm text-slate-600">
              {t('coinControl.chooseCoinsIntro')}
            </Text>
            <View className="flex-row flex-wrap justify-end gap-3">
              {pickedUtxosData && onClearCoinSelection ? (
                <Button
                  mode="text"
                  containerClassName="!min-w-0"
                  textClassName="!text-xs"
                  onPress={onClearCoinSelection}
                >
                  {t('coinControl.useAutomaticCoins')}
                </Button>
              ) : null}
              <Button
                mode="secondary"
                onPress={() => setPanelScreen('coinSelection')}
              >
                {t('coinControl.chooseCoins')}
              </Button>
            </View>
          </View>
        ) : null}
        {canChooseChangeAddress ? (
          <View className="rounded-xl border border-slate-200 bg-white p-3 gap-3">
            <View className="flex-row flex-wrap items-center justify-between gap-2">
              <Text className="text-base font-medium text-slate-900">
                {t('coinControl.changeAddress')}
              </Text>
              <Text className="text-xs text-slate-500">
                {changeAddressSelection
                  ? t('coinControl.customChangeAddress')
                  : t('coinControl.defaultChangeAddress')}
              </Text>
            </View>
            <Text className="text-sm text-slate-600">
              {t('coinControl.changeAddressIntro')}
            </Text>
            {changeAddressSelection ? (
              <View className="rounded-lg bg-slate-50 p-3 gap-2">
                <Text selectable className="text-xs leading-5 text-slate-600">
                  {changeAddressSelection.address}
                </Text>
                {changeAddressSelection.isBeyondGapLimit ? (
                  <Text className="text-xs text-red-600">
                    {t('addressPicker.gapWarning', {
                      gapLimit: settings.GAP_LIMIT
                    })}
                  </Text>
                ) : null}
              </View>
            ) : null}
            <View className="flex-row flex-wrap justify-end gap-3">
              {changeAddressSelection && onClearChangeAddress ? (
                <Button
                  mode="text"
                  containerClassName="!min-w-0"
                  textClassName="!text-xs"
                  onPress={onClearChangeAddress}
                >
                  {t('coinControl.clearChangeAddress')}
                </Button>
              ) : null}
              <Button
                mode="secondary"
                onPress={() => setPanelScreen('changeAddressSelection')}
              >
                {changeAddressSelection
                  ? t('coinControl.editChangeAddress')
                  : t('coinControl.chooseChangeAddress')}
              </Button>
            </View>
          </View>
        ) : null}
      </View>
      <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
        {hasAdvancedSelection ? (
          <Button mode="secondary" onPress={handleUseDefaults}>
            {t('coinControl.useDefaults')}
          </Button>
        ) : null}
        <Button onPress={onClose}>{t('coinControl.done')}</Button>
      </View>
    </View>
  );
};

// Standalone modal wrapper for the advanced options panel. Send, vault setup,
// and vault action flows show this when the user opens advanced transaction
// options. It keeps the panel mounted while the hide animation finishes.
const RawAdvancedTransactionOptionsModal = ({
  isVisible,
  onModalHide,
  ...panelProps
}: AdvancedTransactionOptionsModalProps) => {
  const { t } = useTranslation();
  // react-native-modal keeps animating after isVisible becomes false.
  // Keep the panel rendered until the hide animation is fully done.
  const [renderPanelUntilHidden, setRenderPanelUntilHidden] =
    useState(isVisible);
  const shouldRenderPanel = isVisible || renderPanelUntilHidden;

  const handleModalWillShow = useCallback(() => {
    setRenderPanelUntilHidden(true);
  }, []);

  const handleModalHide = useCallback(() => {
    setRenderPanelUntilHidden(false);
    onModalHide?.();
  }, [onModalHide]);

  return (
    <Modal
      headerMini={true}
      isVisible={isVisible}
      title={t('coinControl.title')}
      icon={advancedTransactionOptionsIcon}
      onClose={panelProps.onClose}
      onModalWillShow={handleModalWillShow}
      onModalHide={handleModalHide}
      customButtons={<View />}
    >
      {shouldRenderPanel ? (
        <AdvancedTransactionOptionsPanel {...panelProps} />
      ) : null}
    </Modal>
  );
};

export const AdvancedTransactionOptionsPanel = React.memo(
  RawAdvancedTransactionOptionsPanel
);
export const AdvancedTransactionOptionsModal = React.memo(
  RawAdvancedTransactionOptionsModal
);
export default AdvancedTransactionOptionsModal;
export { advancedTransactionOptionsIcon };
