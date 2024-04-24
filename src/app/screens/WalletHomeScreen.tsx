import React, {
  useCallback,
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
  NativeScrollEvent
} from 'react-native';
import { RefreshControl } from 'react-native-web-refresh-control';

import {
  KeyboardAwareAnimatedScrollView,
  Modal,
  useTheme
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
import Vaults from '../components/Vaults';
import type { RootStackParamList, NavigationPropsByScreenId } from '../screens';
import { lighten } from 'polished';
import { shareVaults } from '../lib/backup';

import type { IconType } from '../../common/components/Modal';

//Using chrome dev tools, refresh the screen, after choosing a mobile size to activate it:
const hasTouch =
  Platform.OS === 'web'
    ? 'ontouchstart' in window || navigator.maxTouchPoints > 0
    : true; // Assume touch is available for iOS and Android
console.log({ hasTouch });

const WalletHomeScreen = () => {
  const navigation = useNavigation<NavigationPropsByScreenId['WALLET_HOME']>();
  const route = useRoute<RouteProp<RootStackParamList, 'WALLET_HOME'>>();
  const walletId = route.params.walletId;
  const { t } = useTranslation();

  const context = useContext<WalletContextType | null>(WalletContext);
  if (context === null) throw new Error('Context was not set');

  const {
    vaults,
    utxosData,
    syncBlockchain,
    syncingBlockchain,
    wallet,
    wallets,
    walletError,
    requiresPassword,
    onWallet
  } = context;
  if (wallet && walletId !== wallet.walletId)
    throw new Error(
      `Navigated to walletId ${walletId} which does not correspond to the one in the context ${wallet?.walletId}`
    );

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
            onPress={syncingBlockchain ? undefined : syncBlockchain}
            className={`${!syncingBlockchain ? 'hover:opacity-90' : ''} active:scale-95 active:opacity-90 ${
              syncingBlockchain ? 'opacity-20 cursor-default' : 'opacity-100'
            }`}
          >
            <AntDesign
              name={!hasTouch && syncingBlockchain ? 'loading1' : 'reload1'}
              size={17}
              color={theme.colors.primary}
              className={!hasTouch && syncingBlockchain ? 'animate-spin' : ''}
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
    [theme.colors.primary, title, syncBlockchain, syncingBlockchain]
  );
  useEffect(() => navigation.setOptions(navOptions), [navigation, navOptions]);

  useEffect(() => {
    if (walletError === 'USER_CANCEL')
      if (navigation.canGoBack()) navigation.goBack();
  }, [walletError, navigation]);

  const onRequestVaultsBackup = useCallback(() => {
    if (!vaults) throw new Error('vaults not ready');
    return shareVaults({ vaults });
  }, [vaults]);

  // Use btcFiat, and any other data or functions provided by the context
  // ...

  const onPasswordCancel = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation]);
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
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation]);

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
  const [isAtTop, setIsAtTop] = useState<boolean>(true);
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const isAtTopNow = event.nativeEvent.contentOffset.y === 0;
    setIsAtTop(isAtTopNow);
  };

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
          refreshing={syncingBlockchain}
          onRefresh={syncBlockchain}
        />
      ) : (
        <></>
      ),
    [
      isMounted,
      refreshColors,
      syncBlockchain,
      syncingBlockchain,
      theme.colors.primary
    ]
  );
  const stickyHeaderIndices = useMemo(() => [1], []);

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
      <KeyboardAwareAnimatedScrollView
        keyboardShouldPersistTaps="handled"
        refreshControl={hasTouch ? refreshControl : undefined}
        stickyHeaderIndices={stickyHeaderIndices}
        onScroll={onScroll}
        contentContainerClassName={
          //The translate-y-0 (and relate) is a fix for the web-version of refreshControl. On the web
          //implementation of the refreshControl, when the control is refreshing
          //the KeyboardAwareAnimatedScrollView cointainer gets applied a transform:translateY.
          //This is ususally fine except when using a stickyHeader
          //since an empty space will appear above the sticky header. In other words,
          //the sticky header which should always be on top will show with some offset while
          //refreshing.
          //This trick basically removes any transform from the KeyboardAwareAnimatedScrollView
          //except when the scroll is at the top
          //
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
          `${Platform.OS === 'ios' || Platform.OS === 'web' ? '-z-10' : ''}
           ${Platform.OS !== 'web' ? '' : isAtTop ? '' : 'ease-out duration-300 !transform !translate-y-0'}`
        }
      >
        <View className="bg-white">
          <Text>{`Wallet ${JSON.stringify(wallet, null, 2)}`}</Text>
        </View>

        <View className="bg-white flex-row gap-6 px-6 border-b border-b-slate-300">
          <View className="py-4 border-b-primary border-b-2">
            <Text className="font-bold text-primary-dark">Vaults</Text>
          </View>
          <View className="py-4 border-b-transparent border-b-2">
            <Text className="font-bold text-slate-500">Transactions</Text>
          </View>
        </View>

        <View className="overflow-hidden pt-4 pb-32 items-center">
          {vaults && <Vaults vaults={vaults} />}
          <Button
            title={t('walletHome.backupVaults')}
            onPress={onRequestVaultsBackup}
          />
        </View>
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
      </KeyboardAwareAnimatedScrollView>
    </>
  );
};

export default React.memo(WalletHomeScreen);
