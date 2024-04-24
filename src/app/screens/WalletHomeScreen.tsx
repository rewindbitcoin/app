import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import Password from '../components/Password';
import { Button, View, Text, Pressable, ActivityIndicator } from 'react-native';
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

import type { IconType } from '../../common/components/Modal';

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
        refreshControl={refreshControl}
        stickyHeaderIndices={[1]}
      >
        <View className="bg-white">
          <View>
            <View>
              <Text>{`Wallet ${JSON.stringify(wallet, null, 2)}`}</Text>
            </View>
          </View>
        </View>

        <View className="flex-row gap-6 px-6 border-b border-b-slate-300 bg-white">
          <View className="py-4 border-b-primary border-b-2">
            <Text className="font-bold text-primary-dark">Vaults</Text>
          </View>
          <View className="py-4 border-b-transparent border-b-2">
            <Text className="font-bold text-slate-500">Transactions</Text>
          </View>
        </View>

        <View className="pt-4 pb-32 items-center">
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
      </KeyboardAwareAnimatedScrollView>
    </>
  );
};

export default React.memo(WalletHomeScreen);
