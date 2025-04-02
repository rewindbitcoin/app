//TODO:: disable Send and Freeze buttons if !apiReachable (for freeze cBVaultsReaderAPIReachable)
//Receive may be left... for offline receive
import React, {
  useCallback,
  useRef,
  useEffect,
  useMemo,
  useState
} from 'react';
import Password from '../components/Password';
import Transactions from '../components/Transactions';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Platform,
  NativeSyntheticEvent,
  NativeScrollEvent,
  LayoutChangeEvent,
  ScrollView
} from 'react-native';
import { RefreshControl } from 'react-native-web-refresh-control';

import {
  KeyboardAwareScrollView,
  useTheme,
  TabBar,
  Button
} from '../../common/ui';
import { useTranslation } from 'react-i18next';
import { AntDesign, Ionicons } from '@expo/vector-icons';
import {
  useNavigation,
  type RouteProp,
  useRoute,
  useIsFocused
} from '@react-navigation/native';
import { getPasswordDerivedCipherKey } from '../../common/lib/cipher';

import WalletButtons from '../components/WalletButtons';
import WalletHeader from '../components/WalletHeader';
import Vaults from '../components/Vaults';
import {
  type RootStackParamList,
  type NavigationPropsByScreenId,
  SETTINGS
} from '../screens';
import { lighten } from 'polished';

import { useFaucet } from '../hooks/useFaucet';
import { useWallet } from '../hooks/useWallet';
import { walletTitle } from '../lib/wallets';
import { useSecureStorageInfo } from '~/common/contexts/SecureStorageInfoContext';
import { useNetStatus } from '../hooks/useNetStatus';

const ErrorView = ({
  errorMessage,
  goBack
}: {
  errorMessage: string;
  goBack: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <View className="flex-1 justify-center p-4 gap-2 max-w-screen-sm">
      <KeyboardAwareScrollView>
        <Text className="text-base mb-4">{errorMessage}</Text>
      </KeyboardAwareScrollView>
      <Button
        containerClassName="self-center mb-8"
        mode="text"
        onPress={goBack}
      >
        {t('goBack')}
      </Button>
    </View>
  );
};

//Using chrome dev tools, refresh the screen, after choosing a mobile size to activate it:
const hasTouch =
  Platform.OS === 'web'
    ? 'ontouchstart' in window || navigator.maxTouchPoints > 0
    : true; // Assume touch is available for iOS and Android

const WalletHomeScreen = () => {
  const navigation = useNavigation<NavigationPropsByScreenId['WALLET_HOME']>();
  const route = useRoute<RouteProp<RootStackParamList, 'WALLET_HOME'>>();
  const walletId = route.params.walletId;
  const { t } = useTranslation();

  const tabs = [t('wallet.vaultTab'), t('wallet.historyTab')];
  const [activeTabIndex, setActiveTabIndex] = useState<number>(0);

  const [userTriggeredRefresh, setUserTriggeredRefresh] =
    useState<boolean>(false);

  const { explorerReachable } = useNetStatus();

  const {
    signersStorageEngineMismatch,
    vaults,
    vaultsStatuses,
    accounts,
    utxosData,
    historyData,
    updateVaultStatus,
    syncBlockchain,
    syncingBlockchain,
    wallet,
    wallets,
    walletStatus,
    requiresPassword,
    btcFiat,
    tipStatus,
    onWallet,
    logOut,
    fetchBlockTime,
    pushTx,
    feeEstimates,
    blockExplorerURL,
    watchtowerAPI
  } = useWallet();
  if (wallet && walletId !== wallet.walletId)
    throw new Error(
      `Navigated to walletId ${walletId} which does not correspond to the one in the context ${wallet?.walletId}`
    );

  const { secureStorageInfo } = useSecureStorageInfo();
  if (!secureStorageInfo)
    throw new Error('Could not retrieve Secure Storage availability');
  const { canUseSecureStorage } = secureStorageInfo;

  useEffect(() =>
    navigation.addListener('beforeRemove', () => {
      logOut();
    })
  );

  const faucetPending = useFaucet();
  const syncingOrFaucetPendingOrExplorerConnecting: boolean =
    syncingBlockchain || faucetPending || explorerReachable === undefined;

  const title =
    !wallet || !wallets
      ? t('app.walletTitle')
      : walletTitle(wallet, wallets, t);

  const theme = useTheme();
  const navOptions = useMemo(
    () => ({
      // In ios the title is rendered with some delay,
      // so better make it appear with a nice fade in touch
      title,
      headerRight: () => (
        <View className="flex-row justify-between gap-5 items-center">
          <Pressable
            hitSlop={10}
            onPress={
              syncingOrFaucetPendingOrExplorerConnecting
                ? undefined
                : syncBlockchain
            }
            className={`${!syncingOrFaucetPendingOrExplorerConnecting ? 'hover:opacity-90' : ''} active:scale-95 active:opacity-90 ${
              syncingOrFaucetPendingOrExplorerConnecting && userTriggeredRefresh //if the user triggered, then we show the native RefreshControl and therefore no need to make this so prominent
                ? 'opacity-20 cursor-default'
                : 'opacity-100'
            }`}
          >
            <AntDesign
              key={
                syncingOrFaucetPendingOrExplorerConnecting.toString()
                //This is so that the reload1 icon resets to rotation zero
                //after the animation is finished
              }
              name={
                (!hasTouch || !userTriggeredRefresh) &&
                syncingOrFaucetPendingOrExplorerConnecting
                  ? 'loading1'
                  : 'reload1'
              }
              size={17}
              color={theme.colors.primary}
              className={
                (!hasTouch || !userTriggeredRefresh) &&
                syncingOrFaucetPendingOrExplorerConnecting
                  ? 'animate-spin'
                  : 'animate-none'
              }
            />
          </Pressable>
          <Pressable
            hitSlop={10}
            className={`hover:opacity-90 active:scale-95 active:opacity-90`}
            onPress={() => navigation.navigate(SETTINGS)}
          >
            <Ionicons
              name="settings-outline"
              size={20}
              color={theme.colors.primary}
            />
          </Pressable>
        </View>
      ),
      headerRightContainerStyle: { marginRight: 16 }
    }),
    [
      theme.colors.primary,
      title,
      syncBlockchain,
      userTriggeredRefresh,
      syncingOrFaucetPendingOrExplorerConnecting,
      navigation
    ]
  );
  useEffect(() => navigation.setOptions(navOptions), [navigation, navOptions]);

  const goBack = useCallback(async () => {
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation]);
  const logOutAndGoBack = useCallback(async () => {
    await logOut();
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation, logOut]);

  // Use btcFiat, and any other data or functions provided by the context
  // ...

  const onPasswordCancel = useCallback(() => {
    logOutAndGoBack();
  }, [logOutAndGoBack]);
  const onPassword = useCallback(
    (password: string) => {
      if (!wallet) throw new Error(`wallet not set yet`);
      const cb = async () => {
        const signersCipherKey = await getPasswordDerivedCipherKey(password);
        onWallet({
          wallet,
          signersCipherKey
        });
      };
      cb();
    },
    [wallet, onWallet]
  );

  const handleReceive = useCallback(
    () => navigation.navigate('RECEIVE'),
    [navigation]
  );
  const handleSend = useCallback(
    () => navigation.navigate('SEND'),
    [navigation]
  );
  const handleFreeze = useCallback(
    () => navigation.navigate('SETUP_VAULT'),
    [navigation]
  );

  const [isMounted, setIsMounted] = useState<boolean>(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);
  const isFocused = useIsFocused();
  const [walletButtonsHeight, setWalletButtonsHeight] = useState(0);

  const refreshColors = useMemo(
    () => [theme.colors.primary],
    [theme.colors.primary]
  );

  const onRefresh = useCallback(() => {
    setUserTriggeredRefresh(true);
    syncBlockchain();
  }, [syncBlockchain]);
  useEffect(() => {
    if (!syncingBlockchain) setUserTriggeredRefresh(false);
  }, [syncingBlockchain]);

  const refreshControl = useMemo(() => {
    //isMounted prevents a reredering error in iOS where some times
    //the layout was not ready and strange flickers may occur. Note that
    //the syncingBlockchain is true initially on many ocassions and the
    //transition was not being shown
    //
    //In addition: isFocused prevents this error on iOS
    //https://github.com/facebook/react-native/issues/32613
    //https://www.reddit.com/r/reactnative/comments/x7ygwg/flatlist_refresh_indicator_freeze/
    //only let pull-2-refresh when explorer is known to fail or is ok.
    //Dont let pull to refresh while undefined (unknown status) since it's
    //already initalizing and after initialize it will start the sync
    //automatically already
    return hasTouch && isMounted && explorerReachable !== undefined ? (
      <RefreshControl
        tintColor={lighten(0.25, theme.colors.primary)}
        colors={refreshColors}
        refreshing={
          syncingOrFaucetPendingOrExplorerConnecting &&
          isFocused &&
          userTriggeredRefresh
        }
        onRefresh={onRefresh}
      />
    ) : undefined;
  }, [
    explorerReachable,
    isFocused,
    isMounted,
    refreshColors,
    onRefresh,
    syncingOrFaucetPendingOrExplorerConnecting,
    userTriggeredRefresh,
    theme.colors.primary
  ]);
  const stickyHeaderIndices = useMemo(() => [1], []);

  const lastScrollPosition = useRef<number>(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    lastScrollPosition.current = event.nativeEvent.contentOffset.y;
  };
  const headerHeightRef = useRef(0);

  const handleHeader = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    headerHeightRef.current = height;
  };

  const scrollToTop = () => {
    if (scrollViewRef.current)
      scrollViewRef.current.scrollTo({
        y: Math.min(lastScrollPosition.current, headerHeightRef.current),
        animated: false
      });
  };

  const onActiveTab = useCallback((index: number) => {
    scrollToTop();
    setActiveTabIndex(index);
  }, []);

  const dismissTestWalletWarning = useCallback(() => {
    if (!wallet) throw new Error('Wallet not set in dismissTestWalletWarning');
    if (!wallet.testWalletWarningDismissed)
      onWallet({ wallet: { ...wallet, testWalletWarningDismissed: true } });
  }, [wallet, onWallet]);
  const setSeedBackupDone = useCallback(() => {
    if (!wallet) throw new Error('Wallet not set in setSeedBackupDone');
    if (!wallet.seedBackupDone)
      onWallet({ wallet: { ...wallet, seedBackupDone: true } });
  }, [wallet, onWallet]);

  //Check if wallets already contains this wallet. If not this means
  //this is a new wallet being accessed for the first time.
  const hasStorageEverBeenAccessed = !!wallets?.[walletId];

  //These are the 5 possible storage errors. They are are not exclussive but
  //shown priotarizing how we will display them (using ternary operators)

  //Did the user decline access to biometrics?
  //This one will be set in Android devices only.
  //User declineations of biometrics in iOS are handled in NewWalletScreen.
  //See: addWallet in NewWalletScreen for detailed explanation.
  const biometricsRequestDeclinedOnWalletCreation =
    walletStatus.storageAccess.biometricAuthCancelled &&
    !hasStorageEverBeenAccessed;

  //When the user clicks on "Cancel" to the system dialog asking for permission
  //to read biometrics
  const biometricsRequestDeclinedOnExistingWallet =
    walletStatus.storageAccess.biometricAuthCancelled &&
    hasStorageEverBeenAccessed;

  //This variable flags an issue with some Samsung devices that report they provide
  //SecureStorage (they have biometrics support) but then fail on writing data:
  const biometricsFailureOnWalletCreation =
    !hasStorageEverBeenAccessed &&
    walletStatus.storageAccess.biometricsReadWriteError;

  //This is when a wallet was already created with biometrics and now we're
  //trying to access it but the biometrics are disabled or there is a read/write
  //error accessing the data secured with biometrics
  const biometricsAccessFailureOnExistingWallet =
    //signersStorageEngineMismatch in most of the cases means the user is using
    //SECURESTORAGE but the device (now) does not support it anymore for some
    //reason (user disabled it?).
    //signers will be set to invalidated if a new face or fingerprint is added/removed
    //from the system. See https://docs.expo.dev/versions/latest/sdk/securestore/#securestoregetitemasynckey-options
    signersStorageEngineMismatch ||
    walletStatus.storageAccess.biometricsKeyInvalidated;

  const storageError =
    walletStatus.isCorrupted || walletStatus.storageAccess.readWriteError;

  const insets = useSafeAreaInsets();
  return biometricsRequestDeclinedOnWalletCreation ? (
    <ErrorView
      errorMessage={
        t('wallet.new.biometricsRequestDeclined') +
        '\n\n' +
        (canUseSecureStorage
          ? t('wallet.new.biometricsHowDisable')
          : Platform.OS === 'ios'
            ? t('wallet.new.biometricsCurrentlyDisabledIOS')
            : t('wallet.new.biometricsCurrentlyDisabledNonIOS'))
      }
      goBack={goBack}
    />
  ) : biometricsFailureOnWalletCreation ? (
    <ErrorView
      errorMessage={t('wallet.new.biometricsReadWriteError')}
      goBack={goBack}
    />
  ) : biometricsAccessFailureOnExistingWallet ? (
    <ErrorView
      errorMessage={
        Platform.OS === 'ios'
          ? t('wallet.existing.biometricsAccessFailureIOS')
          : t('wallet.existing.biometricsAccessFailureNonIOS')
      }
      goBack={goBack}
    />
  ) : biometricsRequestDeclinedOnExistingWallet ? (
    <ErrorView
      errorMessage={t('wallet.existing.biometricsRequestDeclined')}
      goBack={goBack}
    />
  ) : storageError ? (
    <ErrorView errorMessage={t('wallet.errors.storage')} goBack={goBack} />
  ) : !wallet ? (
    /*TODO: prepare nicer ActivityIndicator*/
    <View className="flex-1 justify-center">
      <ActivityIndicator size={'large'} color={theme.colors.primary} />
    </View>
  ) : (
    <>
      {
        //isMounted prevents a renredering error in iOS where some times
        //the absolute-positioned buttons were not showing in the correct
        //position. For some reason isMounted takes quite a bit to be true...
        isMounted && (
          <WalletButtons
            handleReceive={
              accounts && Object.keys(accounts).length
                ? handleReceive
                : undefined
            }
            handleSend={
              feeEstimates && explorerReachable && utxosData?.length
                ? handleSend
                : undefined
            }
            handleFreeze={
              feeEstimates && explorerReachable && utxosData?.length
                ? handleFreeze
                : undefined
            }
            onLayout={e => setWalletButtonsHeight(e.nativeEvent.layout.height)}
          />
        )
      }
      <KeyboardAwareScrollView
        ref={scrollViewRef}
        keyboardShouldPersistTaps="handled"
        {...(refreshControl ? { refreshControl } : {})}
        stickyHeaderIndices={stickyHeaderIndices}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerClassName={
          //The -z-10 is related to this issue:
          //https://stackoverflow.com/questions/40366080/2-different-background-colours-for-scrollview-bounce
          //In summary, I have some white headers but the bounce area will show in gray (transparent)
          //This looks weird. So an abslute positioned View is set with some white background
          //See the last elemenbt in the ScrollView
          //Then, the -z-10 is set so that the refresh indicator appears above the
          //white position-absolute View (see TAGiusfdnisdunf). Othwewise
          //the bounce area when pulling to refresh was looking gray or white but the loading indicator was not appearing
          //See TAGiusfdnisdunf below
          //
          `${Platform.OS === 'ios' || Platform.OS === 'web' ? '-z-10' : ''}`
        }
      >
        <View onLayout={handleHeader}>
          <WalletHeader
            syncBlockchain={syncBlockchain}
            syncingBlockchain={syncingBlockchain}
            networkId={wallet.networkId}
            testWalletWarningDismissed={!!wallet.testWalletWarningDismissed}
            dismissTestWalletWarning={dismissTestWalletWarning}
            seedBackupDone={!!wallet.seedBackupDone}
            setSeedBackupDone={setSeedBackupDone}
            utxosData={utxosData}
            vaults={vaults}
            vaultsStatuses={vaultsStatuses}
            blockchainTip={tipStatus?.blockHeight}
            btcFiat={btcFiat}
            faucetPending={faucetPending}
          />
        </View>

        <View className="bg-white border-b border-b-slate-300 w-full">
          <View className="px-6 max-w-screen-sm self-center w-full">
            <TabBar
              tabs={tabs}
              activeTabIndex={activeTabIndex}
              onActiveTab={onActiveTab}
            />
          </View>
        </View>

        {activeTabIndex === 0 && (
          <View
            className={`p-4 max-w-screen-sm w-full self-center`}
            style={{
              marginBottom: walletButtonsHeight + insets.bottom + 8 * 4
            }}
            //The added margin to let it scroll over the Receive - Send - Freeze buttons. Note there is a mb-8 in <WalletButtons>
          >
            {vaults && vaultsStatuses && (
              <Vaults
                watchtowerAPI={watchtowerAPI}
                blockExplorerURL={blockExplorerURL}
                updateVaultStatus={updateVaultStatus}
                pushTx={pushTx}
                vaults={vaults}
                vaultsStatuses={vaultsStatuses}
                btcFiat={btcFiat}
                tipStatus={tipStatus}
              />
            )}
          </View>
        )}
        {activeTabIndex === 1 && (
          <View
            className={`p-4 max-w-screen-sm w-full self-center`}
            style={{
              marginBottom: walletButtonsHeight + insets.bottom + 8 * 4
            }}
            //The added margin to let it scroll over the Receive - Send - Freeze buttons. Note there is a mb-8 in <WalletButtons>
          >
            <Transactions
              blockExplorerURL={blockExplorerURL}
              tipStatus={tipStatus}
              historyData={historyData}
              fetchBlockTime={fetchBlockTime}
              btcFiat={btcFiat}
            />
          </View>
        )}

        <Password
          mode="REQUEST"
          isVisible={requiresPassword}
          onPassword={onPassword}
          onCancel={onPasswordCancel}
        />
        {
          //See TAGiusfdnisdunf above
          //https://stackoverflow.com/questions/40366080/2-different-background-colours-for-scrollview-bounce
          //A negative zindex will be needed in the ScrollView so that the refresh control shows above this View
          (Platform.OS === 'ios' || Platform.OS === 'web') && (
            <View className="absolute bg-white native:h-[1000] native:-top-[1000] web:h-[1000px] web:-top-[1000px] left-0 right-0" />
          )
        }
      </KeyboardAwareScrollView>
    </>
  );
};

export default React.memo(WalletHomeScreen);
