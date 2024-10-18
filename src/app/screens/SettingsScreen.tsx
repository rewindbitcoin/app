const URL_MAX_LENGTH = 256;
const NAME_MAX_LENGTH = 32;
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Bip39 from '../components/Bip39';
import * as Icons from '@expo/vector-icons';
import { Platform, Pressable, Text, TextInput } from 'react-native';
import {
  ActivityIndicator,
  Button,
  IconType,
  KeyboardAwareScrollView,
  Modal,
  useToast
} from '../../common/ui';
import { useTranslation } from 'react-i18next';
import { useWallet } from '../hooks/useWallet';
import { View } from 'react-native';

import AntDesign from '@expo/vector-icons/AntDesign';
import { useSettings } from '../hooks/useSettings';
import { defaultSettings, currencyCodes } from '../lib/settings';
import { walletTitle } from '../lib/wallets';
import { useNavigation } from '@react-navigation/native';
import { NavigationPropsByScreenId, WALLETS } from '../screens';
import { exportWallet } from '../lib/backup';
import { electrumParams } from '../lib/walletDerivedData';
import { ElectrumExplorer } from '@bitcoinerlab/explorer';
import { NetworkId, networkMapping } from '../lib/network';
import { useLocalization } from '../hooks/useLocalization';

function sanitizeFilename(name: string) {
  // Regex to remove invalid file path characters
  return (
    name
      .replace(/[/\\?%*:|"<>]/g, '_') // Replaces invalid characters with underscore
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1f\x80-\x9f]/g, '') // Removes non-printable characters
      .replace(/^\./, '_') // Prevents hidden files (filenames that start with a dot)
      .replace(/^(\.\.\/)+/, '') // Removes directory traversal attempts
      .replace(/\s+/g, '_')
  ); // Replaces spaces with underscores
}

const SettingsItem = ({
  icon,
  label,
  modalTitle,
  danger = false,
  initialValue,
  defaultValue,
  validateValue,
  onValue,
  onPress,
  maxLength = 32,
  showSeparator = true
}: {
  icon: IconType;
  danger?: boolean;
  label: string;
  modalTitle?: string;
  onPress?: () => void;
  initialValue?: string;
  maxLength?: number;
  /**
   * for allowing a button "set default initialValue
   */
  defaultValue?: string;
  validateValue?: (value: string) => Promise<boolean>;
  onValue?: (value: string) => void;
  showSeparator?: boolean;
}) => {
  const { t } = useTranslation();
  const [isModalVisible, setIsModalVisible] = useState<boolean>(false);
  const [value, setValue] = useState<string>(initialValue || '');
  const [isValidatingValue, setIsValidatingValue] = useState<boolean>(false);
  if (!modalTitle) modalTitle = label;

  const hideModal = useCallback(() => {
    setIsModalVisible(false);
  }, []);

  const onPressInternal = useCallback(() => {
    if (onPress) onPress();
    else setIsModalVisible(true);
  }, [onPress]);

  const handleValueChange = useCallback((text: string) => {
    setValue(text);
  }, []);

  const textInputRef = useRef<TextInput>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isModalVisible) textInputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, [isModalVisible]);

  const onSave = useCallback(async () => {
    if (validateValue) {
      setIsValidatingValue(true);
      const isValid = await validateValue(value);
      setIsValidatingValue(false);
      if (!isValid) {
        // Handle invalid input, e.g., show an error message
        return;
      }
    }
    if (onValue) {
      onValue(value);
    }
    setIsModalVisible(false); // Close the modal after saving
  }, [value, validateValue, onValue]);

  const onSetDefault = useCallback(() => {
    if (defaultValue) {
      setValue(defaultValue);
      if (onValue) onValue(defaultValue);
      hideModal();
    }
  }, [defaultValue, hideModal, onValue]);

  const Icon = Icons[icon.family];
  const dangerColor = 'rgb(239,68,69)'; //text-red-500
  const gray400 = 'rgb(156,163,175)';
  return (
    <Pressable onPress={onPressInternal} className="w-full active:bg-gray-200">
      <View className="flex-row items-center">
        <Icon
          className="pl-3"
          name={icon.name}
          {...(danger && { color: dangerColor })}
        />

        <View className="flex-1 ml-3">
          <View className="flex-row items-center justify-between py-2">
            <Text
              className={`text-base flex-1 truncate ${danger ? 'text-red-500' : ''}`}
            >
              {label}
            </Text>
            {initialValue && (
              <Text
                numberOfLines={1}
                className={`text-base mr-4 flex-auto overflow-hidden text-right ml-4 max-w-[40%] ${danger ? 'text-red-500' : 'text-gray-400'}`}
              >
                {initialValue}
              </Text>
            )}
            <AntDesign
              name="right"
              size={12}
              color={danger ? dangerColor : gray400}
              className="pr-2"
            />
          </View>
          {showSeparator && <View className="border-b border-gray-300" />}
        </View>
      </View>
      <Modal
        icon={icon}
        title={modalTitle}
        isVisible={isModalVisible}
        {...(!isValidatingValue && { onClose: hideModal })}
        customButtons={
          <View className="items-center gap-6 flex-row justify-center pb-4">
            <Button
              mode="secondary"
              disabled={isValidatingValue}
              onPress={hideModal}
            >
              {t('cancelButton')}
            </Button>
            {defaultValue && defaultValue !== value && (
              <Button mode="secondary" onPress={onSetDefault}>
                {t('settings.defaultButton')}
              </Button>
            )}
            <Button
              mode="primary"
              onPress={onSave}
              disabled={value.length === 0}
              loading={isValidatingValue}
            >
              {isValidatingValue ? t('savingButton') : t('saveButton')}
            </Button>
          </View>
        }
      >
        <View className="px-4">
          <TextInput
            ref={textInputRef}
            className="text-base outline-none flex-1 web:w-full rounded bg-slate-200 py-2 px-4"
            value={value}
            enablesReturnKeyAutomatically
            autoComplete="off"
            spellCheck={false}
            autoCorrect={false}
            autoCapitalize="none"
            onSubmitEditing={onSave}
            maxLength={maxLength}
            onChangeText={handleValueChange}
          />
        </View>
      </Modal>
    </Pressable>
  );
};

const SettingsScreen = () => {
  const navigation = useNavigation<NavigationPropsByScreenId['SETTINGS']>();
  const goBackToWallets = useCallback(() => {
    //In react navigation v6 navigation.navigate behaves as if doing a
    //navigation.pop(2). So it unmounts this screen.
    //Note that on version v7 the behaviour will change. Since a reset of all
    //states and refs is necessary when leaving this screen, then make sure
    //
    //I will still be using the same behaviupur when i upgrade to v7
    //https://reactnavigation.org/docs/7.x/upgrading-from-6.x#the-navigate-method-no-longer-goes-back-use-popto-instead
    //
    // @ts-expect-error: Using popTo for future upgrade to v7
    if (navigation.popTo) navigation.popTo(WALLETS, { walletId });
    else navigation.navigate(WALLETS);
  }, [navigation]);
  const { t } = useTranslation();
  const {
    wallet,
    wallets,
    onWallet,
    accounts,
    vaults,
    signers,
    syncingBlockchain,
    deleteWallet
  } = useWallet();
  const toast = useToast();
  const { settings, setSettings } = useSettings();
  const { currency, setCurrency } = useLocalization();
  const [isBip39ModalVisible, setIsBip39ModalVisible] =
    useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<string>('');

  const [isCurrencyModalVisible, setIsCurrencyModalVisible] =
    useState<boolean>(false);

  //delete
  const [isDeleteModalVisible, setIsDeleteModalVisible] =
    useState<boolean>(false);
  const [deleteInputValue, setDeleteInputValue] = useState<string>('');

  const [deleteRequested, setDeleteRequested] = useState<boolean>(false);
  useEffect(() => {
    const del = async () => {
      if (syncingBlockchain === false && deleteRequested && wallet) {
        try {
          await deleteWallet(wallet.walletId);
          goBackToWallets();
        } catch (err) {
          toast.show(t('settings.wallet.deleteError'), { type: 'warning' });
        }
      }
    };
    del();
  }, [
    syncingBlockchain,
    deleteWallet,
    deleteRequested,
    wallet,
    toast,
    t,
    goBackToWallets
  ]);

  const validateGapLimit = async (gapLimitStr: string) => {
    // Check if the string is a number and falls within the range 1 to 100
    const gapLimit = parseInt(gapLimitStr, 10);
    if (isNaN(gapLimit) || gapLimit < 1 || gapLimit > 100) {
      toast.show(t('settings.wallet.gapLimitError'), { type: 'warning' });
      return false;
    }
    return true;
  };

  const validateElectrumURL = async (url: string, networkId: NetworkId) => {
    try {
      const network = networkMapping[networkId];
      const explorer = new ElectrumExplorer({
        network,
        ...electrumParams(url)
      });
      await explorer.connect();
      const isConnected = await explorer.isConnected();
      await explorer.close();
      if (isConnected) return true;
      else console.warn(`Server ${url} is not connected`);
    } catch (err) {
      console.warn(err);
    }
    toast.show(t('settings.wallet.electrumError'), { type: 'warning' });
    return false;
  };

  const title = wallet && wallets ? walletTitle(wallet, wallets, t) : '';

  const mnemonic = signers && signers[0]?.mnemonic;

  if (!settings)
    return (
      <KeyboardAwareScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="items-center pt-5 px-5"
      >
        <ActivityIndicator size="large" />
      </KeyboardAwareScrollView>
    );
  else
    return (
      <KeyboardAwareScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="items-center pt-5 px-5"
      >
        {wallet && wallets && (
          <View className="w-full mb-6">
            <Text className="font-bold uppercase text-slate-600 pl-4 mb-2 text-sm">
              {title}
            </Text>
            <View className="bg-white rounded-xl overflow-hidden">
              <SettingsItem
                icon={{
                  family: 'FontAwesome6',
                  name: 'tag'
                }}
                label={t('settings.wallet.name')}
                maxLength={NAME_MAX_LENGTH}
                onValue={(walletName: string) => {
                  navigation.setOptions({
                    headerBackTitle: walletName
                  });
                  onWallet({ wallet: { ...wallet, walletName } });
                }}
                initialValue={title}
              />
              <SettingsItem
                icon={{
                  family: 'MaterialCommunityIcons',
                  name: 'database-refresh'
                }}
                label={t('settings.wallet.export')}
                initialValue={exportProgress}
                onPress={() => {
                  if (exportProgress === '')
                    exportWallet({
                      name: sanitizeFilename(title),
                      exportInstuctions: t(
                        'settings.wallet.exportInstructions'
                      ),
                      accounts: accounts || {},
                      vaults: vaults || {},
                      onProgress: (progress: number) => {
                        if (progress !== 1)
                          setExportProgress(
                            Math.round(progress * 100).toString() +
                              '% - ' +
                              t('settings.wallet.exportProgress')
                          );
                        else setExportProgress('');
                        return true;
                      }
                    });
                }}
              />
              {mnemonic && (
                <SettingsItem
                  icon={{
                    family: 'FontAwesome5',
                    name: 'key'
                  }}
                  label={t('settings.wallet.showRecoveryPhrase')}
                  modalTitle={t('settings.wallet.recoveryPhrase')}
                  onPress={() => setIsBip39ModalVisible(true)}
                />
              )}
              <SettingsItem
                danger
                icon={{
                  family: 'MaterialIcons',
                  name: 'delete'
                }}
                showSeparator={false}
                onPress={() => setIsDeleteModalVisible(true)}
                label={t('settings.wallet.delete')}
              />
            </View>
          </View>
        )}
        <View className="w-full">
          <Text className="font-bold uppercase text-slate-600 pl-4 mb-2 text-sm">
            {t('settings.general.title')}
          </Text>
          <View className="bg-white rounded-xl">
            <SettingsItem
              icon={{
                family: 'MaterialIcons',
                name: 'currency-exchange'
              }}
              label={t('settings.general.currency')}
              onPress={() => {
                setIsCurrencyModalVisible(true);
              }}
              initialValue={currency}
            />
            {(Platform.OS === 'android' || Platform.OS === 'ios') && (
              <>
                <SettingsItem
                  icon={{
                    family: 'Ionicons',
                    name: 'logo-electron'
                  }}
                  maxLength={URL_MAX_LENGTH}
                  label={t('settings.general.electrumBitcoin')}
                  initialValue={settings.MAINNET_ELECTRUM_API}
                  defaultValue={defaultSettings.MAINNET_ELECTRUM_API}
                  validateValue={(url: string) =>
                    validateElectrumURL(url, 'BITCOIN')
                  }
                  onValue={(url: string) => {
                    setSettings({ ...settings, MAINNET_ELECTRUM_API: url });
                  }}
                />
                <SettingsItem
                  icon={{
                    family: 'Ionicons',
                    name: 'logo-electron'
                  }}
                  label={t('settings.general.electrumTape')}
                  initialValue={settings.TAPE_ELECTRUM_API}
                  defaultValue={defaultSettings.TAPE_ELECTRUM_API}
                  validateValue={(url: string) =>
                    validateElectrumURL(url, 'TAPE')
                  }
                  onValue={(url: string) => {
                    setSettings({ ...settings, TAPE_ELECTRUM_API: url });
                  }}
                />
                <SettingsItem
                  icon={{
                    family: 'Ionicons',
                    name: 'logo-electron'
                  }}
                  label={t('settings.general.electrumTestnet')}
                  initialValue={settings.TESTNET_ELECTRUM_API}
                  defaultValue={defaultSettings.TESTNET_ELECTRUM_API}
                  validateValue={(url: string) =>
                    validateElectrumURL(url, 'TESTNET')
                  }
                  onValue={(url: string) => {
                    setSettings({ ...settings, TESTNET_ELECTRUM_API: url });
                  }}
                />
                <SettingsItem
                  icon={{
                    family: 'Ionicons',
                    name: 'logo-electron'
                  }}
                  label={t('settings.general.electrumRegtest')}
                  initialValue={settings.REGTEST_ELECTRUM_API}
                  defaultValue={defaultSettings.REGTEST_ELECTRUM_API}
                  validateValue={(url: string) =>
                    validateElectrumURL(url, 'REGTEST')
                  }
                  onValue={(url: string) => {
                    setSettings({ ...settings, REGTEST_ELECTRUM_API: url });
                  }}
                />
              </>
            )}
            <SettingsItem
              showSeparator={false}
              icon={{
                family: 'FontAwesome',
                name: 'chain-broken'
              }}
              label={t('settings.general.gapLimit')}
              initialValue={settings.GAP_LIMIT.toString()}
              defaultValue={defaultSettings.GAP_LIMIT.toString()}
              validateValue={validateGapLimit}
              onValue={(gapLimitStr: string) => {
                setSettings({ ...settings, GAP_LIMIT: parseInt(gapLimitStr) });
              }}
            />
          </View>
        </View>
        <Modal
          icon={{
            family: 'FontAwesome5',
            name: 'key'
          }}
          title={t('settings.wallet.recoveryPhrase')}
          isVisible={isBip39ModalVisible}
          closeButtonText={t('closeButton')}
          onClose={() => setIsBip39ModalVisible(false)}
        >
          {mnemonic && <Bip39 readonly words={mnemonic.split(' ')} />}
        </Modal>
        <Modal
          icon={{
            family: 'MaterialIcons',
            name: 'delete'
          }}
          title={t('settings.wallet.delete')}
          isVisible={isDeleteModalVisible}
          onClose={() => {
            setDeleteInputValue('');
            setIsDeleteModalVisible(false);
          }}
          customButtons={
            <View className="items-center gap-6 flex-row justify-center pb-4">
              <Button
                mode="secondary"
                onPress={() => {
                  setDeleteInputValue('');
                  setIsDeleteModalVisible(false);
                }}
              >
                {t('cancelButton')}
              </Button>
              <Button
                mode="primary-alert"
                onPress={() => setDeleteRequested(true)}
                disabled={
                  deleteRequested ||
                  deleteInputValue.toUpperCase() !==
                    t('settings.wallet.deleteText')
                }
              >
                {t('settings.wallet.confirmDelete')}
              </Button>
            </View>
          }
        >
          <View className="p-2">
            {deleteRequested && syncingBlockchain ? (
              <Text className="text-base">
                {t('settings.wallet.deleteClosingNetwork')}
              </Text>
            ) : (
              <>
                <Text className="text-base mb-8">
                  {t('settings.wallet.deleteInfo')}
                </Text>
                <TextInput
                  className="text-base outline-none flex-1 web:w-full rounded bg-slate-200 py-2 px-4"
                  placeholder={t('settings.wallet.deletePlaceholder')}
                  value={deleteInputValue}
                  autoComplete="off"
                  spellCheck={false}
                  autoCorrect={false}
                  autoCapitalize="none"
                  onChangeText={text => setDeleteInputValue(text)}
                />
              </>
            )}
          </View>
        </Modal>
        <Modal
          icon={{
            family: 'MaterialIcons',
            name: 'currency-exchange'
          }}
          title={t('settings.general.currency')}
          isVisible={isCurrencyModalVisible}
          closeButtonText={t('closeButton')}
          onClose={() => setIsCurrencyModalVisible(false)}
        >
          <View className="p-4">
            {currencyCodes.map(code => (
              <Pressable
                key={code}
                onPress={() => {
                  setCurrency(code);
                  setIsCurrencyModalVisible(false);
                }}
                className={`py-2 px-4 rounded-lg ${currency === code ? 'bg-primary' : 'bg-gray-200'} my-1`}
              >
                <Text
                  className={`${currency === code ? 'text-white' : 'text-black'} text-center`}
                >
                  {code}
                </Text>
              </Pressable>
            ))}
          </View>
        </Modal>
      </KeyboardAwareScrollView>
    );
};

export default SettingsScreen;
