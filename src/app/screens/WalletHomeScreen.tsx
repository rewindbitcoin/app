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
  LayoutChangeEvent,
  ViewStyle
} from 'react-native';
import { RefreshControl } from 'react-native-web-refresh-control';

import {
  KeyboardAwareAnimatedScrollView,
  Modal,
  useTheme
} from '../../common/ui';
import { WalletContext, WalletContextType } from '../contexts/WalletContext';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
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

import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue
} from 'react-native-reanimated';
import type { IconType } from '../../common/components/Modal';

//TODO the WalletProvider must also pass it's own refreshing state
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
      : Object.entries(wallets).length === 1 //FIX, TODO: this is a bad heuristic, note that you might have a utxo below the dust limit and thus, you cannot send, also the fees may not be enough for sending. Same for vaults. In vaults i had some logic that told you that you need more money. Then using length 1 is ok, but then similar logic must be implemented in send.
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
            onPress={syncingBlockchain ? null : syncBlockchain}
            className={`hover:opacity-90 active:scale-95 active:opacity-90 ${
              syncingBlockchain ? 'opacity-20 cursor-default' : 'opacity-100'
            }`}
          >
            <Ionicons name="refresh" size={20} color={theme.colors.primary} />
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

  const contentHeight = useSharedValue<number>(0);
  const containerHeight = useSharedValue<number>(0);
  const scrollY = useSharedValue(0);
  const headerMinHeight = 0;
  const [headerMaxHeight, setHeaderMaxHeight] = useState<number>();

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: event => {
      scrollY.value = event.contentOffset.y;
    }
  });

  const headerAnimatedStyle = useAnimatedStyle(() => {
    const isScrollable = contentHeight.value > containerHeight.value;
    if (
      headerMaxHeight === undefined ||
      headerMinHeight === undefined ||
      !isScrollable
    )
      return {};
    //Android will flicker when collapsing the header by slowly scrolling down
    //it's a bug open since 5 years ago:
    //https://github.com/facebook/react-native/issues/21801
    //the way to "hide" the problem is to overcome the decimal computation
    //in the interpolation by multiplying the input rante to some value > 30%,
    //the flicker may still slightly be there but not very noticeable
    const height = interpolate(
      scrollY.value,
      [0, 1.3 * (headerMaxHeight - headerMinHeight)],
      [headerMaxHeight, headerMinHeight],
      Extrapolation.CLAMP
    );

    // Start fading out only when the scroll is 2/3 of the way to full collapse
    const fadeStart = ((headerMaxHeight - headerMinHeight) * 2) / 3;
    const fadeEnd = headerMaxHeight - headerMinHeight;
    const opacity = interpolate(
      scrollY.value,
      [fadeStart, fadeEnd],
      [1, 0],
      Extrapolation.CLAMP
    );
    return {
      height,
      opacity
    };
  });

  const onHeaderLayout = useCallback((event: LayoutChangeEvent) => {
    const layoutHeight = event.nativeEvent.layout.height;
    setHeaderMaxHeight(prevHeight =>
      prevHeight === undefined ? layoutHeight : prevHeight
    );
  }, []);
  const handleContentSizeChange = useCallback(
    (width: number, height: number) => {
      void width;
      contentHeight.value = height;
    },
    [contentHeight]
  );
  const handleContainerLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { height } = event.nativeEvent.layout;
      containerHeight.value = height;
    },
    [containerHeight]
  );

  const refreshColors = useMemo(
    () => [theme.colors.primary],
    [theme.colors.primary]
  );

  const contentContainerStyle = useMemo<ViewStyle>(
    () => ({
      //flexGrow: 1, //grow vertically to 100% and center child
      //justifyContent: 'center',
      alignItems: 'center'
    }),
    []
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
      isMounted && (
        <RefreshControl
          tintColor={lighten(0.25, theme.colors.primary)}
          colors={refreshColors}
          refreshing={syncingBlockchain}
          onRefresh={syncBlockchain}
        />
      ),
    [
      isMounted,
      refreshColors,
      syncBlockchain,
      syncingBlockchain,
      theme.colors.primary
    ]
  );

  return !wallet /*TODO: prepare nicer ActivityIndicator*/ ? (
    <View className="flex-1 justify-center">
      <ActivityIndicator size={'large'} color={theme.colors.primary} />
    </View>
  ) : (
    <>
      <Animated.View style={headerAnimatedStyle} className="bg-red-100">
        <View onLayout={onHeaderLayout}>
          <View>
            <Text className="h-52">My stuff</Text>
          </View>
        </View>
      </Animated.View>
      <View className="z-10">
        <Text className="h-10">My nav</Text>
      </View>

      {
        //isMounted prevents a renredering error in iOS where some times
        //the absolute-positioned buttons were not showing in the correct
        //position. For some reason isMounted takes quite a bit to be true...
        isMounted && (
          <WalletButtons
            handleReceive={handleReceive}
            handleSend={utxosData?.length ? handleSend : undefined}
            handleFreeze={utxosData?.length ? handleFreeze : undefined}
          />
        )
      }
      <KeyboardAwareAnimatedScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={contentContainerStyle}
        refreshControl={refreshControl}
        onScroll={scrollHandler}
        onContentSizeChange={handleContentSizeChange}
        onLayout={handleContainerLayout}
      >
        <Text>{`Wallet ${JSON.stringify(wallet, null, 2)}`}</Text>
        {vaults && <Vaults vaults={vaults} />}
        <Button
          title={t('walletHome.backupVaults')}
          onPress={onRequestVaultsBackup}
        />
      </KeyboardAwareAnimatedScrollView>
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
    </>
  );
};

export default React.memo(WalletHomeScreen);
