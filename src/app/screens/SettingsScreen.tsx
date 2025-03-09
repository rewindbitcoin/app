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
import { defaultSettings, currencyCodes, Settings } from '../lib/settings';
import { walletTitle } from '../lib/wallets';
import { useNavigation } from '@react-navigation/native';
import { NavigationPropsByScreenId, WALLETS } from '../screens';
import { exportWallet } from '../lib/backup';
import { electrumParams, getAPIs } from '../lib/walletDerivedData';
import { ElectrumExplorer, EsploraExplorer } from '@bitcoinerlab/explorer';
import { NetworkId, networkMapping } from '../lib/network';
import { useLocalization } from '../hooks/useLocalization';

import {
  applicationName,
  nativeApplicationVersion,
  nativeBuildVersion
} from 'expo-application';
import { locales } from '~/i18n-locales/init';
import { batchedUpdates } from '~/common/lib/batchedUpdates';

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
  validateValue?: (value: string) => Promise<true | string>;
  onValue?: (value: string) => void;
  showSeparator?: boolean;
}) => {
  const { t } = useTranslation();
  const [errorMessage, setErrorMessage] = useState<false | string>(false);
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
    batchedUpdates(() => {
      setErrorMessage(false);
      setValue(text);
    });
  }, []);

  const onCancel = useCallback(() => {
    if (initialValue !== undefined) {
      batchedUpdates(() => {
        setValue(initialValue);
        setErrorMessage(false);
      });
    }
    hideModal();
  }, [hideModal, initialValue]);

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
      const validation = await validateValue(value);
      if (validation !== true) {
        batchedUpdates(() => {
          setIsValidatingValue(false);
          setErrorMessage(validation);
        });
        return;
      }
      setIsValidatingValue(false);
    }
    if (onValue) {
      onValue(value);
    }
    setIsModalVisible(false); // Close the modal after saving
  }, [value, validateValue, onValue]);

  const onSetDefault = useCallback(() => {
    if (defaultValue !== undefined) {
      batchedUpdates(() => {
        setValue(defaultValue);
        setErrorMessage(false);
      });
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
          size={16}
          className="pl-3"
          name={icon.name}
          {...(danger && { color: dangerColor })}
        />

        <View className="flex-1 ml-3">
          <View className="flex-row items-center justify-between py-2">
            <Text
              className={`text-base flex-1 ${danger ? 'text-red-500' : ''}`}
            >
              {label}
            </Text>
            {initialValue !== undefined && (
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
          <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
            <Button
              mode="secondary"
              disabled={isValidatingValue}
              onPress={onCancel}
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
        <View className="px-4 gap-2">
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
          {errorMessage && (
            <View>
              <Text className="text-base text-red-500">{errorMessage}</Text>
            </View>
          )}
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
  const {
    currency,
    setCurrency,
    locale: currentLocale,
    setLocale
  } = useLocalization();
  const [isBip39ModalVisible, setIsBip39ModalVisible] =
    useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<string>('');

  const [isLanguageModalVisible, setIsLanguageModalVisible] =
    useState<boolean>(false);
  const [isCurrencyModalVisible, setIsCurrencyModalVisible] =
    useState<boolean>(false);
  const [isResetModalVisible, setIsResetModalVisible] =
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
          setIsDeleteModalVisible(false); //toasts are not compatible with Modals in android (toasts appear behind the modal opacity effect
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
    const gapLimit = Number(gapLimitStr);
    if (
      isNaN(gapLimit) ||
      gapLimit.toString() !== gapLimitStr ||
      gapLimit < 1 ||
      gapLimit > 100
    ) {
      return t('settings.wallet.gapLimitError');
    }
    return true;
  };

  const validateCommunityBackupsAPI = async (settings: Settings) => {
    const { generate204CbVaultsReaderAPI } = getAPIs('BITCOIN', settings);
    const networkTimeout = settings.NETWORK_TIMEOUT;
    if (!generate204CbVaultsReaderAPI) return t('app.unknownError');
    try {
      const response = await fetch(generate204CbVaultsReaderAPI, {
        signal: AbortSignal.timeout(networkTimeout)
      });
      if (response.status === 204) {
        return true;
      }
    } catch (err) {
      console.warn(err);
    }
    return t('settings.wallet.communityBackupsError');
  };

  const validateRegtestApiBase = async (settings: Settings) => {
    const { generate204API, faucetURL } = getAPIs('REGTEST', settings);
    const networkTimeout = settings.NETWORK_TIMEOUT;
    if (!generate204API || !faucetURL) return t('app.unknownError');
    try {
      const response = await fetch(generate204API, {
        signal: AbortSignal.timeout(networkTimeout)
      });
      if (response.status === 204) {
        const response = await fetch(faucetURL, {
          signal: AbortSignal.timeout(networkTimeout)
        });
        if (response.status === 200) {
          return true;
        }
      }
    } catch (err) {
      console.warn(err);
    }
    return t('settings.wallet.regtestApiBaseError');
  };

  const validateExplorerURL = async (
    url: string,
    networkId: NetworkId,
    type: 'electrum' | 'esplora'
  ) => {
    try {
      const network = networkMapping[networkId];
      const explorer =
        type === 'electrum'
          ? new ElectrumExplorer({ network, ...electrumParams(url) })
          : new EsploraExplorer({ url });
      await explorer.connect();
      const isConnected = await explorer.isConnected();

      if (isConnected) {
        explorer.close();
        return true;
      } else console.warn(`Server ${url} is not connected`);
    } catch (err) {
      console.warn(err);
    }
    return t(
      type === 'electrum'
        ? 'settings.wallet.electrumError'
        : 'settings.wallet.esploraError'
    );
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
          <View className="w-full mb-6 max-w-screen-sm">
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
        <View className="w-full max-w-screen-sm">
          <Text className="font-bold uppercase text-slate-600 pl-4 mb-2 text-sm">
            {t('settings.general.title')}
          </Text>
          <View className="bg-white rounded-xl">
            <SettingsItem
              icon={{
                family: 'MaterialIcons',
                name: 'language'
              }}
              label={t('settings.general.language')}
              onPress={() => {
                setIsLanguageModalVisible(true);
              }}
              initialValue={
                currentLocale === 'default'
                  ? t('settings.general.systemDefault')
                  : t(`settings.general.languageNames.${currentLocale}`)
              }
            />
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
            <SettingsItem
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
            <SettingsItem
              icon={{
                family: 'MaterialIcons',
                name: 'backup'
              }}
              maxLength={URL_MAX_LENGTH}
              label={t('settings.general.communityBackups')}
              initialValue={settings.COMMUNITY_BACKUPS_API}
              defaultValue={defaultSettings.COMMUNITY_BACKUPS_API}
              validateValue={(url: string) =>
                validateCommunityBackupsAPI({
                  ...settings,
                  COMMUNITY_BACKUPS_API: url
                })
              }
              onValue={(url: string) => {
                setSettings({ ...settings, COMMUNITY_BACKUPS_API: url });
              }}
            />
            {Platform.OS === 'web' ? (
              <>
                <SettingsItem
                  icon={{
                    family: 'MaterialCommunityIcons',
                    name: 'api'
                  }}
                  maxLength={URL_MAX_LENGTH}
                  label={t('settings.general.esploraBitcoin')}
                  initialValue={settings.MAINNET_ESPLORA_API}
                  defaultValue={defaultSettings.MAINNET_ESPLORA_API}
                  validateValue={(url: string) =>
                    validateExplorerURL(url, 'BITCOIN', 'esplora')
                  }
                  onValue={(url: string) => {
                    setSettings({ ...settings, MAINNET_ESPLORA_API: url });
                  }}
                />
                <SettingsItem
                  icon={{
                    family: 'MaterialCommunityIcons',
                    name: 'api'
                  }}
                  maxLength={URL_MAX_LENGTH}
                  label={t('settings.general.esploraTape')}
                  initialValue={settings.TAPE_ESPLORA_API}
                  defaultValue={defaultSettings.TAPE_ESPLORA_API}
                  validateValue={(url: string) =>
                    validateExplorerURL(url, 'TAPE', 'esplora')
                  }
                  onValue={(url: string) => {
                    setSettings({ ...settings, TAPE_ESPLORA_API: url });
                  }}
                />
                <SettingsItem
                  icon={{
                    family: 'MaterialCommunityIcons',
                    name: 'api'
                  }}
                  maxLength={URL_MAX_LENGTH}
                  label={t('settings.general.esploraTestnet')}
                  initialValue={settings.TESTNET_ESPLORA_API}
                  defaultValue={defaultSettings.TESTNET_ESPLORA_API}
                  validateValue={(url: string) =>
                    validateExplorerURL(url, 'TESTNET', 'esplora')
                  }
                  onValue={(url: string) => {
                    setSettings({ ...settings, TESTNET_ESPLORA_API: url });
                  }}
                />
              </>
            ) : (
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
                    validateExplorerURL(url, 'BITCOIN', 'electrum')
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
                  maxLength={URL_MAX_LENGTH}
                  label={t('settings.general.electrumTape')}
                  initialValue={settings.TAPE_ELECTRUM_API}
                  defaultValue={defaultSettings.TAPE_ELECTRUM_API}
                  validateValue={(url: string) =>
                    validateExplorerURL(url, 'TAPE', 'electrum')
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
                  maxLength={URL_MAX_LENGTH}
                  label={t('settings.general.electrumTestnet')}
                  initialValue={settings.TESTNET_ELECTRUM_API}
                  defaultValue={defaultSettings.TESTNET_ELECTRUM_API}
                  validateValue={(url: string) =>
                    validateExplorerURL(url, 'TESTNET', 'electrum')
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
                  maxLength={URL_MAX_LENGTH}
                  label={t('settings.general.electrumRegtest')}
                  initialValue={settings.REGTEST_ELECTRUM_API}
                  defaultValue={defaultSettings.REGTEST_ELECTRUM_API}
                  validateValue={(url: string) =>
                    validateExplorerURL(url, 'REGTEST', 'electrum')
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
                family: 'Ionicons',
                name: 'flask'
              }}
              maxLength={URL_MAX_LENGTH}
              label={t('settings.general.regtestApiBase')}
              initialValue={settings.REGTEST_API_BASE}
              defaultValue={defaultSettings.REGTEST_API_BASE}
              validateValue={(url: string) =>
                validateRegtestApiBase({
                  ...settings,
                  REGTEST_API_BASE: url
                })
              }
              onValue={(url: string) => {
                setSettings({ ...settings, REGTEST_API_BASE: url });
              }}
            />
          </View>
          <Button
            mode="text"
            onPress={() => setIsResetModalVisible(true)}
            className="my-4"
          >
            {t('settings.resetToDefaults')}
          </Button>
          {Platform.OS !== 'web' && (
            <Text className="text-center my-8 text-gray-400">
              {applicationName} {nativeApplicationVersion} (
              {t('app.buildNumber')} {nativeBuildVersion})
            </Text>
          )}
        </View>
        <Modal
          icon={{
            family: 'MaterialIcons',
            name: 'restore'
          }}
          title={t('settings.resetToDefaultsTitle')}
          isVisible={isResetModalVisible}
          onClose={() => setIsResetModalVisible(false)}
          customButtons={
            <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
              <Button
                mode="secondary"
                onPress={() => setIsResetModalVisible(false)}
              >
                {t('cancelButton')}
              </Button>
              <Button
                mode="primary"
                onPress={() => {
                  setSettings(defaultSettings);
                  setIsResetModalVisible(false);
                }}
              >
                {t('settings.resetButton')}
              </Button>
            </View>
          }
        >
          <View className="p-4">
            <Text className="text-base">
              {t('settings.resetToDefaultsConfirm')}
            </Text>
          </View>
        </Modal>
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
            <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
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
            name: 'language'
          }}
          title={t('settings.general.language')}
          isVisible={isLanguageModalVisible}
          closeButtonText={t('closeButton')}
          onClose={() => setIsLanguageModalVisible(false)}
        >
          <View className="p-4">
            <Pressable
              key="default"
              onPress={() => {
                setLocale('default');
                setIsLanguageModalVisible(false);
              }}
              className={`py-2 px-4 rounded-lg ${
                currentLocale === 'default' ? 'bg-primary' : 'bg-gray-200'
              } my-1`}
            >
              <Text
                className={`${
                  currentLocale === 'default' ? 'text-white' : 'text-black'
                } text-center`}
              >
                {t('settings.general.systemDefault')}
              </Text>
            </Pressable>
            {locales.map(locale => (
              <Pressable
                key={locale}
                onPress={() => {
                  setLocale(locale);
                  setIsLanguageModalVisible(false);
                }}
                className={`py-2 px-4 rounded-lg ${
                  locale === currentLocale ? 'bg-primary' : 'bg-gray-200'
                } my-1`}
              >
                <Text
                  className={`${
                    locale === currentLocale ? 'text-white' : 'text-black'
                  } text-center`}
                >
                  {t(`settings.general.languageNames.${locale}`)}
                </Text>
              </Pressable>
            ))}
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
