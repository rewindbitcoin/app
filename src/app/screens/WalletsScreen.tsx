import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  Text,
  View,
  Pressable /*, useWindowDimensions*/,
  Platform,
  Linking
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useStorage } from '../../common/hooks/useStorage';
import { BOOLEAN } from '../../common/lib/storage';
import { KeyboardAwareScrollView, Modal, Button } from '../../common/ui';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { NEW_WALLET, WALLET_HOME } from '../screens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Svg, Path } from 'react-native-svg';
import BitcoinSign from '../../../assets/BitcoinSign.svg';
import BitcoinLogo from '../../../assets/Bitcoin.svg';
import RegtestLogo from '../../../assets/Regtest.svg';
import TestnetLogo from '../../../assets/Testnet.svg';
import { Ubuntu_700Bold } from '@expo-google-fonts/ubuntu';
import { useFonts } from 'expo-font';
import { cssInterop } from 'nativewind';
import { useWallet } from '../hooks/useWallet';
import { Wallet, Wallets, walletTitle } from '../lib/wallets';
import { useLocalization } from '../hooks/useLocalization';
import { batchedUpdates } from '~/common/lib/batchedUpdates';
cssInterop(Svg, {
  className: {
    target: 'style',
    nativeStyleToProp: { width: true, height: true }
  }
});
cssInterop(BitcoinLogo, {
  className: {
    target: 'style',
    nativeStyleToProp: { width: true, height: true }
  }
});
cssInterop(RegtestLogo, {
  className: {
    target: 'style',
    nativeStyleToProp: { width: true, height: true }
  }
});
cssInterop(TestnetLogo, {
  className: {
    target: 'style',
    nativeStyleToProp: { width: true, height: true }
  }
});

const walletBgs = [
  //gradients are so cool, but not supported natively:
  //bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500
  'bg-blue-500',
  'bg-yellow-500',
  'bg-green-500',
  'bg-orange-500',
  'bg-indigo-500',
  'bg-pink-500',
  'bg-purple-500',
  'bg-cyan-500',
  'bg-red-500',
  'bg-teal-500'
];

const TERMS_ACCEPTED_STORAGE_KEY = 'rewindbitcoin/terms_accepted';

const walletCls = [
  'text-blue-500',
  'text-yellow-500',
  'text-green-500',
  'text-orange-500',
  'text-indigo-500',
  'text-pink-500',
  'text-purple-500',
  'text-cyan-500',
  'text-red-500',
  'text-teal-500'
];
const walletBg = (index: number, hasNotifications: boolean) =>
  hasNotifications ? 'bg-red-800' : walletBgs[index % walletBgs.length];
//const walletBg = (index: number, _hasNotifications: boolean) =>
//  walletBgs[index % walletBgs.length];
const walletCl = (index: number, hasNotifications: boolean) =>
  hasNotifications ? 'text-red-800' : walletCls[index % walletCls.length];

/**
 * Creates a new wallet object with all notifications marked as acknowledged.
 * Returns the original wallet object if no changes were needed.
 * @param wallet The input wallet object.
 * @returns A new wallet object with acknowledged notifications, or the original object.
 */
function getWalletWithAcknowledgedNotifications(wallet: Wallet): Wallet {
  const notifications = wallet.notifications;
  if (!notifications) return wallet;

  let walletChanged = false;
  const updatedNotifications: typeof notifications = {};

  for (const [watchtowerAPI, vaults] of Object.entries(notifications)) {
    let watchtowerChanged = false;

    const updatedVaults: typeof vaults = {};

    for (const [vaultId, notification] of Object.entries(vaults)) {
      if (notification.acked === true) {
        updatedVaults[vaultId] = notification;
      } else {
        updatedVaults[vaultId] = { ...notification, acked: true };
        watchtowerChanged = true;
      }
    }
    updatedNotifications[watchtowerAPI] = watchtowerChanged
      ? updatedVaults
      : vaults;
    if (watchtowerChanged) walletChanged = true;
  }

  return walletChanged
    ? { ...wallet, notifications: updatedNotifications }
    : wallet;
}

const WalletsScreen = () => {
  const {
    onWallet,
    wallets,
    orphanedWatchtowerWalletUUIDs,
    clearOrphanedWatchtowerWalletUUIDs
  } = useWallet();
  if (!onWallet) throw new Error(`onWallet not set yet`);
  const [ubuntuLoaded] = useFonts({ Ubuntu700Bold: Ubuntu_700Bold });
  const insets = useSafeAreaInsets();
  //const { width: windowWidth } = useWindowDimensions();

  const navigation = useNavigation();
  const { t } = useTranslation();
  const { locale } = useLocalization();

  const [termsAccepted, setTermsAccepted, , , termsAcceptedStatus] =
    useStorage<boolean>(TERMS_ACCEPTED_STORAGE_KEY, BOOLEAN, false);

  //reset for tests
  //useEffect(() => {
  //  if (termsAcceptedStatus.isSynchd) setTermsAccepted(false);
  //}, [setTermsAccepted, termsAcceptedStatus.isSynchd]);

  const [showTermsModal, setShowTermsModal] = useState(false);
  const [
    pendingWalletIdForNavigation,
    setPendingWalletIdForNavigation
  ] = useState<number | null>(null);
  const [checkboxStates, setCheckboxStates] = useState([
    false,
    false,
    false,
    false,
    false
  ]);

  const handleCheckboxToggle = (index: number) => {
    const newStates = [...checkboxStates];
    newStates[index] = !newStates[index];
    setCheckboxStates(newStates);
  };

  const allCheckboxesChecked = checkboxStates.every(Boolean);

  const calculateNextWalletId = useCallback(
    (currentWallets: Wallets): number => {
      if (Object.values(currentWallets).length === 0) {
        return 0;
      }
      return (
        Math.max(...Object.values(currentWallets).map(w => w.walletId)) + 1
      );
    },
    []
  );

  const walletsWithWTNotifications = Object.entries(wallets || {})
    .filter(
      ([_, wallet]) =>
        wallet.notifications &&
        Object.values(wallet.notifications).some(watchtower =>
          Object.values(watchtower).some(
            notification => notification.acked === false
          )
        )
    )
    .map(([walletId]) => Number(walletId));
  const showOnlyAttackedWallets = walletsWithWTNotifications.length > 0;
  const dangerMode =
    showOnlyAttackedWallets || orphanedWatchtowerWalletUUIDs.size > 0;

  const handleWalletMap = useMemo(() => {
    if (!wallets) return {};
    else {
      const map: { [walletId: number]: () => void } = {};
      Object.keys(wallets).map(walletIdStr => {
        const walletId = Number(walletIdStr);
        const wallet = wallets[walletId];
        if (!wallet) throw new Error(`Unset wallet for ${walletId}`);
        map[walletId] = () => {
          // When navigating to the wallet, pass the version with notifications marked as acked
          onWallet({ wallet: getWalletWithAcknowledgedNotifications(wallet) });
          navigation.navigate(WALLET_HOME, { walletId });
        };
      });
      return map;
    }
  }, [wallets, onWallet, navigation]);

  const handleNewWallet = useCallback(async () => {
    if (!termsAcceptedStatus.isSynchd) return; // Wait until storage is loaded
    if (!wallets) throw new Error('wallets not yet defined');

    if (!termsAccepted)
      batchedUpdates(() => {
        setCheckboxStates([false, false, false, false, false]); // Reset states
        setShowTermsModal(true);
      });
    else {
      const walletId = calculateNextWalletId(wallets);
      navigation.navigate(NEW_WALLET, { walletId });
    }
  }, [
    navigation,
    wallets,
    termsAccepted,
    termsAcceptedStatus.isSynchd,
    setShowTermsModal,
    setCheckboxStates,
    calculateNextWalletId
  ]);

  const handleAcceptAndContinue = useCallback(async () => {
    if (!wallets) throw new Error('wallets not yet defined');
    await setTermsAccepted(true); // Ensure terms are persisted
    const walletId = calculateNextWalletId(wallets);
    setPendingWalletIdForNavigation(walletId);
    setShowTermsModal(false); // This will trigger onModalHide
  }, [
    wallets,
    setTermsAccepted,
    calculateNextWalletId,
    setPendingWalletIdForNavigation,
    setShowTermsModal
  ]);

  const onTermsModalHide = useCallback(() => {
    if (pendingWalletIdForNavigation !== null) {
      navigation.navigate(NEW_WALLET, {
        walletId: pendingWalletIdForNavigation
      });
      setPendingWalletIdForNavigation(null); // Reset for next time
    }
  }, [pendingWalletIdForNavigation, navigation, setPendingWalletIdForNavigation]);

  const mbStyle = useMemo(
    //max-w-screen-sm = 640
    () => ({
      marginBottom: insets.bottom,
      //right: (windowWidth > 640 ? (windowWidth - 640) / 2 : 0) + 8 * 4
      //The right above makes sure the button is inside a max-w-screen-sm width (640px)
      //this can be useful on web with large screen width. But I believe it looks better
      //in web when its aligned to the right... (as below). Thing about it...
      right: 8 * 4
    }),
    [insets /*, windowWidth*/]
  );

  const buttonHeightRef = useRef<number>();
  const scrollViewHeightRef = useRef<number>();
  const contentHeightRef = useRef<number>();
  const [extraPadding, setExtraPadding] = useState<boolean>(false);

  const handleExtraPadding = () => {
    //Wait until we have all the layouts
    if (
      buttonHeightRef.current &&
      scrollViewHeightRef.current &&
      contentHeightRef.current
    ) {
      const newExtraPadding =
        scrollViewHeightRef.current - contentHeightRef.current <=
        buttonHeightRef.current + 8 * 5; /*bottom-8*/
      //dont allow to set it to false
      //to avoid unnecessary re-layouts and possible flickering
      if (newExtraPadding === true && extraPadding === false)
        setExtraPadding(true);
    }
  };

  return (
    <>
      <Modal
        title={t('termsModal.title')}
        subTitle={t('termsModal.intro')}
        icon={{
          family: 'MaterialCommunityIcons',
          name: 'file-document-outline'
        }}
        isVisible={showTermsModal}
        onModalHide={onTermsModalHide}
        onClose={() => {
          batchedUpdates(() => {
            setShowTermsModal(false);
            setCheckboxStates([false, false, false, false, false]);
            // If modal is closed without accepting, ensure no pending navigation
            setPendingWalletIdForNavigation(null);
          });
        }}
        customButtons={
          <View className="items-center w-full pb-4 px-4">
            <Button
              mode="primary"
              disabled={!allCheckboxesChecked}
              onPress={handleAcceptAndContinue}
            >
              {t('termsModal.continueButton')}
            </Button>
          </View>
        }
      >
        <View className="gap-y-3">
          {[
            t('termsModal.checkbox1'),
            t('termsModal.checkbox2'),
            t('termsModal.checkbox3'),
            t('termsModal.checkbox4')
          ].map((label, index) => (
            <Pressable
              key={index}
              onPress={() => handleCheckboxToggle(index)}
              className="flex-row items-start py-1"
            >
              <MaterialCommunityIcons
                name={
                  checkboxStates[index]
                    ? 'checkbox-marked-outline'
                    : 'checkbox-blank-outline'
                }
                size={24}
                className="text-primary mr-3 mt-0.5"
              />
              <Text className="flex-1 text-sm">{label}</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => handleCheckboxToggle(4)}
            className="flex-row items-start py-1"
          >
            <MaterialCommunityIcons
              name={
                checkboxStates[4]
                  ? 'checkbox-marked-outline'
                  : 'checkbox-blank-outline'
              }
              size={24}
              className="text-primary mr-3 mt-0.5"
            />
            <Text className="flex-1 text-sm">
              {t('termsModal.checkbox5_part1')}{' '}
              <Text
                className="text-primary underline"
                onPress={() =>
                  Linking.openURL('https://rewindbitcoin.com/terms')
                }
              >
                {t('termsModal.termsLink')}
              </Text>{' '}
              {t('termsModal.checkbox5_part2')}{' '}
              <Text
                className="text-primary underline"
                onPress={() =>
                  Linking.openURL('https://rewindbitcoin.com/privacy')
                }
              >
                {t('termsModal.privacyLink')}
              </Text>
              {t('termsModal.checkbox5_part3')}
            </Text>
          </Pressable>
          <Text className="text-center text-xs text-slate-600 mt-2">
            {t('termsModal.agreementNotice')}
          </Text>
        </View>
      </Modal>
      {!dangerMode && (
        <Pressable
          onLayout={event => {
            buttonHeightRef.current = event.nativeEvent.layout.height;
            handleExtraPadding();
          }}
          onPress={handleNewWallet}
          style={mbStyle}
          className={`bottom-8 z-10 p-4 bg-primary rounded-full hover:opacity-90 active:scale-95 active:opacity-90 absolute shadow flex-row gap-1 items-center`}
        >
          <Svg
            className="fill-none stroke-white stroke-2 w-5 h-5"
            viewBox="0 0 24 24"
          >
            <Path d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </Svg>
          <Text className="text-center text-white font-semibold">
            {t('wallets.addNew')}
          </Text>
        </Pressable>
      )}
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName={
          //See TAGiusfdnisdunf in WalletHomeScreen for explanations
          `justify-center items-center ${dangerMode ? 'bg-red-600' : ''} ${Platform.OS === 'ios' || Platform.OS === 'web' ? '-z-10' : ''}`
        }
        contentContainerStyle={
          dangerMode ? {} : { flexGrow: 1 } /*className flex-1 does not work!*/
        }
        onLayout={event => {
          scrollViewHeightRef.current = event.nativeEvent.layout.height;
          handleExtraPadding();
        }}
      >
        <View
          className={`gap-4 w-full items-center max-w-screen-sm mx-auto px-2 py-6 ${extraPadding ? 'pb-32' : ''}`}
          onLayout={event => {
            contentHeightRef.current = event.nativeEvent.layout.height;
            handleExtraPadding();
          }}
        >
          {dangerMode && (
            <View className="mb-8 items-center px-2 py-4">
              <MaterialCommunityIcons
                name="alert-octagon-outline"
                className="text-white text-9xl mb-4"
              />
              {showOnlyAttackedWallets ? (
                <>
                  <Text className="text-white font-bold text-xl mb-2">
                    {t('wallets.notificationWarningTitle')}
                  </Text>
                  <Text className="text-white text-base">
                    {t('wallets.notificationWarningMessage', {
                      count: walletsWithWTNotifications.length
                    })}
                  </Text>
                </>
              ) : (
                //only show orphaned wallets when real danger
                //showOnlyAttackedWallets) has been cleared
                orphanedWatchtowerWalletUUIDs.size > 0 && (
                  <>
                    <Text className="text-white font-medium text-center text-base mb-4">
                      {t('wallets.orphanedWatchtowerWalletUUID', {
                        count: orphanedWatchtowerWalletUUIDs.size
                      })}
                    </Text>
                    <Pressable
                      onPress={clearOrphanedWatchtowerWalletUUIDs}
                      className="self-center bg-white px-4 py-2 rounded-full"
                    >
                      <Text className="text-red-500 font-semibold text-base">
                        {t('dismissButton')}
                      </Text>
                    </Pressable>
                  </>
                )
              )}
            </View>
          )}
          {wallets &&
            Object.entries(wallets)
              .filter(
                ([walletId]) =>
                  !showOnlyAttackedWallets ||
                  walletsWithWTNotifications.includes(Number(walletId))
              )
              .map(([walletId, wallet], index) => (
                <Pressable
                  className={`w-full max-w-96 min-h-56 gap-4 p-4 rounded-3xl active:opacity-90 hover:opacity-90 active:scale-95 ${walletBg(index, showOnlyAttackedWallets)} overflow-hidden`}
                  onPress={handleWalletMap[wallet.walletId]}
                  key={walletId}
                >
                  <View className="z-10 flex-row justify-between">
                    <Text
                      className={
                        `${ubuntuLoaded ? "font-['Ubuntu700Bold']" : ''} uppercase text-base text-white overflow-hidden flex-1`
                        // flex-1 explanation:
                        // https://www.bam.tech/article/why-my-text-is-going-off-screen
                      }
                    >
                      {walletTitle(wallet, wallets, t)}
                    </Text>
                    {wallet.networkId !== 'BITCOIN' && (
                      <View className="self-start p-2 rounded-xl bg-white/70">
                        <Text
                          className={`font-semibold text-xs text-center leading-4 ${walletCl(index, showOnlyAttackedWallets)}`}
                        >
                          {t('wallets.testWallet')}
                        </Text>
                        <Text
                          className={`font-semibold text-xs text-center leading-4 ${walletCl(index, showOnlyAttackedWallets)}`}
                        >
                          {t('wallets.noRealValue')}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View className="z-10 absolute bottom-4 left-4">
                    <Text className="flex-initial text-xs font-semibold text-white">
                      {t('wallets.createdOn')}
                    </Text>
                    <Text className="flex-initial text-xs font-semibold text-white">
                      {new Intl.DateTimeFormat(locale, {
                        year: 'numeric',
                        month: 'long',
                        day: '2-digit'
                      }).format(new Date(wallet.creationEpoch * 1000))}
                    </Text>
                  </View>
                  <View className="z-10 absolute bottom-4 right-4 flex flex-row items-center gap-2">
                    <Text className="flex-initial uppercase text-xs font-bold text-white">
                      {wallet.networkId}
                    </Text>
                    {wallet.networkId === 'BITCOIN' ? (
                      <BitcoinLogo className="flex-initial w-8 h-8" />
                    ) : wallet.networkId === 'TESTNET' ? (
                      <TestnetLogo className="flex-initial w-8 h-8" />
                    ) : (
                      <RegtestLogo className="flex-initial w-8 h-8" />
                    )}
                  </View>
                  <BitcoinSign
                    opacity={0.1}
                    className="w-60 z-0 fill-white absolute -bottom-46"
                  />
                </Pressable>
              ))}
        </View>
        {
          //See TAGiusfdnisdunf in WalletHomeScreen for explanations
          (Platform.OS === 'ios' || Platform.OS === 'web') && (
            <>
              <View
                className={`absolute native:h-[1000] native:-top-[1000] web:h-[1000px] web:-top-[1000px] left-0 right-0 ${dangerMode ? 'bg-red-600' : ''}`}
              />
              <View
                className={`absolute native:h-[1000] native:bottom-[-1000] web:h-[1000px] web:bottom-[-1000px] left-0 right-0 ${dangerMode ? 'bg-red-600' : ''}`}
              />
            </>
          )
        }
      </KeyboardAwareScrollView>
    </>
  );
};
export default React.memo(WalletsScreen);
