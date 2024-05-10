import React, {
  useCallback,
  useRef,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import Password from '../components/Password';
import {
  Button,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Platform,
  NativeSyntheticEvent,
  NativeScrollEvent,
  LayoutChangeEvent
} from 'react-native';
import { RefreshControl } from 'react-native-web-refresh-control';

import {
  KeyboardAwareScrollView,
  Modal,
  useTheme,
  useToast,
  TabBar
} from '../../common/ui';
import { WalletContext, WalletContextType } from '../contexts/WalletContext';
import { useTranslation } from 'react-i18next';
import { AntDesign, Ionicons } from '@expo/vector-icons';
import {
  useNavigation,
  type RouteProp,
  useRoute
} from '@react-navigation/native';
import { getPasswordDerivedCipherKey } from '../../common/lib/cipher';

import WalletButtons from '../components/WalletButtons';
import WalletHeader from '../components/WalletHeader';
import Vaults from '../components/Vaults';
import type { RootStackParamList, NavigationPropsByScreenId } from '../screens';
import { lighten } from 'polished';
import { shareVaults } from '../lib/backup';

import type { IconType } from '../../common/components/Modal';
import { getAPIs } from '../lib/walletDerivedData';
import { useSettings } from '../hooks/useSettings';
import { faucetFirstReceive } from '../lib/faucet';
import { networkMapping } from '../lib/network';
import type { ScrollView } from 'react-native-gesture-handler';

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

  const { settings } = useSettings();

  const toast = useToast();

  const context = useContext<WalletContextType | null>(WalletContext);
  if (context === null) throw new Error('Context was not set');

  const tabs = ['Vaults', 'Transactions']; //TODO: translate
  const [activeTabIndex, setActiveTabIndex] = useState<number>(0);

  const {
    vaults,
    vaultsStatuses,
    utxosData,
    syncBlockchain,
    syncingBlockchain,
    wallet,
    wallets,
    walletError,
    requiresPassword,
    btcFiat,
    onWallet,
    logOut,
    isFirstLogin,
    signers
  } = context;
  if (wallet && walletId !== wallet.walletId)
    throw new Error(
      `Navigated to walletId ${walletId} which does not correspond to the one in the context ${wallet?.walletId}`
    );

  const faucetRequested = useRef<boolean>(false);
  const faucetDetected = useRef<boolean>(false);
  const faucetNotified = useRef<boolean>(false);
  if (utxosData?.length) faucetDetected.current = true;

  const faucetPending = !faucetDetected.current && faucetRequested.current;
  const syncingOrFaucetPending = syncingBlockchain || faucetPending;

  const title =
    !wallet || !wallets
      ? t('app.walletTitle')
      : Object.entries(wallets).length === 1
        ? t('wallets.mainWallet')
        : t('wallets.walletId', { id: wallet?.walletId + 1 });

  const theme = useTheme();
  const navOptions = useMemo(
    () => ({
      // In ios the title is rendered with some delay,
      // so better make it appear with a nice fade in touch
      title,
      headerRight: () => (
        <View className="flex-row justify-between gap-5 items-center">
          <Pressable
            onPress={syncingOrFaucetPending ? undefined : syncBlockchain}
            className={`${!syncingOrFaucetPending ? 'hover:opacity-90' : ''} active:scale-95 active:opacity-90 ${
              syncingOrFaucetPending
                ? 'opacity-20 cursor-default'
                : 'opacity-100'
            }`}
          >
            <AntDesign
              name={
                !hasTouch && syncingOrFaucetPending ? 'loading1' : 'reload1'
              }
              size={17}
              color={theme.colors.primary}
              className={
                !hasTouch && syncingOrFaucetPending ? 'animate-spin' : ''
              }
            />
          </Pressable>
          <Pressable
            className={`hover:opacity-90 active:scale-95 active:opacity-90`}
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
    [theme.colors.primary, title, syncBlockchain, syncingOrFaucetPending]
  );
  useEffect(() => navigation.setOptions(navOptions), [navigation, navOptions]);
  useEffect(() => {
    if (wallet && faucetRequested.current === false) {
      const { faucetAPI } = getAPIs(wallet.networkId, settings);
      const network = wallet.networkId && networkMapping[wallet.networkId];
      if (faucetAPI && signers && isFirstLogin && settings) {
        (async () => {
          try {
            toast.show(t('walletHome.faucetStartMsg'), { type: 'success' });
            await faucetFirstReceive(signers, network, faucetAPI, 'es-ES');
            faucetRequested.current = true;
            //wait a few secs until esplora catches up...
            while (faucetDetected.current === false) {
              syncBlockchain();
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          } catch (error: unknown) {
            if (error instanceof Error && typeof error.message === 'string')
              toast.show(error.message, { type: 'warning' });
            else
              toast.show(t('walletHome.faucetUnkownErrorMsg'), {
                type: 'warning'
              });
          }
        })();
      }
    }
  }, [toast, wallet, isFirstLogin, settings, signers, syncBlockchain, t]);
  useEffect(() => {
    if (faucetNotified.current === false && utxosData?.length && isFirstLogin) {
      faucetNotified.current = true;
      toast.show(t('walletHome.faucetDetectedMsg'), { type: 'success' });
    }
  }, [utxosData?.length, toast, isFirstLogin, t]);

  const logOutAndGoBack = useCallback(() => {
    logOut();
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation, logOut]);

  useEffect(() => {
    if (walletError === 'USER_CANCEL') logOutAndGoBack();
  }, [walletError, logOutAndGoBack]);

  const onRequestVaultsBackup = useCallback(() => {
    if (!vaults) throw new Error('vaults not ready');
    return shareVaults({ vaults });
  }, [vaults]);

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
  const onCloseErrorModal = useCallback(() => {
    logOutAndGoBack();
  }, [logOutAndGoBack]);

  const handleReceive = useCallback(() => {}, []);
  const handleSend = useCallback(() => {}, []);
  const handleFreeze = useCallback(
    () => navigation.navigate('SETUP_VAULT'),
    [navigation]
  );

  const [isMounted, setIsMounted] = useState<boolean>(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const refreshColors = useMemo(
    () => [theme.colors.primary],
    [theme.colors.primary]
  );

  const userCancelIcon = useMemo<IconType>(
    () => ({ family: 'MaterialIcons', name: 'error' }),
    []
  );

  const refreshControl = useMemo(
    () =>
      //isMounted prevents a renredering error in iOS where some times
      //the layout was not ready and strange flickers may occur. Note that
      //the syncingBlockchain is true initially on many ocassions and the
      //transition was not being shown
      isMounted ? (
        <RefreshControl
          tintColor={lighten(0.25, theme.colors.primary)}
          colors={refreshColors}
          refreshing={syncingOrFaucetPending}
          onRefresh={syncBlockchain}
        />
      ) : (
        <></>
      ),
    [
      isMounted,
      refreshColors,
      syncBlockchain,
      syncingOrFaucetPending,
      theme.colors.primary
    ]
  );
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
    console.log({ onActiveTab });
    scrollToTop();
    setActiveTabIndex(index);
  }, []);

  return !wallet /*TODO: prepare nicer ActivityIndicator*/ ? (
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
            handleReceive={handleReceive}
            handleSend={utxosData?.length ? handleSend : undefined}
            handleFreeze={
              //FIX, TODO: this is a bad heuristic, note that you might have a utxo below the dust limit and thus, you cannot send, also the fees may not be enough for sending. Same for vaults. In vaults i had some logic that told you that you need more money. Then using length 1 is ok, but then similar logic must be implemented in send.
              utxosData?.length ? handleFreeze : undefined
            }
          />
        )
      }
      <KeyboardAwareScrollView
        ref={scrollViewRef}
        keyboardShouldPersistTaps="handled"
        refreshControl={hasTouch ? refreshControl : undefined}
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
            networkId={wallet.networkId}
            utxosData={utxosData}
            vaults={vaults}
            vaultsStatuses={vaultsStatuses}
            btcFiat={btcFiat}
            faucetPending={faucetPending}
          />
        </View>

        <View className="bg-white border-b border-b-slate-300 px-6">
          <TabBar
            tabs={tabs}
            activeTabIndex={activeTabIndex}
            onActiveTab={onActiveTab}
          />
        </View>

        {activeTabIndex === 0 && (
          <>
            {vaults && <Vaults vaults={vaults} />}
            <Button
              title={t('walletHome.backupVaults')}
              onPress={onRequestVaultsBackup}
            />
          </>
        )}
        {activeTabIndex === 1 && (
          <View className="p-4">
            {Array.from({ length: 100 }, (_, index) => (
              <View key={index}>
                <Text>Text {index}</Text>
              </View>
            ))}
          </View>
        )}

        <Password
          mode="REQUEST"
          isVisible={requiresPassword}
          onPassword={onPassword}
          onCancel={onPasswordCancel}
        />
        <Modal
          isVisible={walletError && walletError !== 'USER_CANCEL'}
          title={
            walletError === 'BIOMETRICS_UNCAPABLE'
              ? t('wallet.errors.biometricsUncapableTitle')
              : t('wallet.errors.storageTitle')
          }
          icon={userCancelIcon}
          onClose={onCloseErrorModal}
        >
          <View className="px-2">
            <Text>
              {walletError === 'BIOMETRICS_UNCAPABLE'
                ? t('wallet.errors.biometricsUncapable')
                : t('wallet.errors.storage')}
            </Text>
          </View>
        </Modal>
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
