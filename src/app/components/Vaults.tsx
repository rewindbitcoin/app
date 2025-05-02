//FIXME: el mensage en la push notiification no es muy alarmante

//FIXME: documentar bien en la web cuando se muestra el push notification!
//cuando se hace desde otro dispositivo?
//cuando se hace desde un dispositivco q no hizo el push?
//  -> Esto tiene q ir a la web

//FIXME: Add Accelerate links on the confirming... texts on the right!!!
//for the init and for the rescue

//FIXME: tests: (Android / iOS):
// - registration error GOOD
// - user denying grant
// - pushToken not set
// - receiving old wallets push
// - testear el animate-pulse

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

const IRREVERSIBLE_BLOCKS = 4; // Number of blocks after which a transaction is considered irreversible
import {
  View,
  Text,
  Linking,
  Pressable,
  AppState,
  AppStateStatus
} from 'react-native';
import * as Icons from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { batchedUpdates } from '~/common/lib/batchedUpdates';

import {
  type Vault,
  type VaultStatus,
  type VaultsStatuses,
  type Vaults as VaultsType,
  getVaultFrozenBalance,
  getRemainingBlocks,
  getVaultUnfrozenBalance,
  getVaultRescuedBalance
} from '../lib/vaults';
import VaultIcon from './VaultIcon';
import { useTranslation } from 'react-i18next';
import { formatBalance, formatBlocks } from '../lib/format';
import { Button, IconType, InfoButton, Modal } from '../../common/ui';

import { useSettings } from '../hooks/useSettings';
import type { SubUnit } from '../lib/settings';
import type { BlockStatus } from '@bitcoinerlab/explorer';
import InitUnfreeze, { InitUnfreezeData } from './InitUnfreeze';
import Rescue, { RescueData } from './Rescue';
import Delegate from './Delegate';
import LearnMoreAboutVaults from './LearnMoreAboutVaults';
import * as Notifications from 'expo-notifications';
import { shallowEqualObjects } from 'shallow-equal';
import { useLocalization } from '../hooks/useLocalization';
import { useNetStatus } from '../hooks/useNetStatus';
import { canReceiveNotifications, getExpoPushToken } from '../lib/watchtower';
import { Platform } from 'react-native';

const LOADING_TEXT = '     ';

const formatVaultDate = (
  unixTime: number | undefined,
  locale: string
): string | undefined => {
  if (!unixTime) return;
  const date = new Date(unixTime * 1000);
  const now = new Date();

  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short', // Abbreviated month in letters
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };

  // If the date is in the current year, delete the year to the options
  if (date.getFullYear() === now.getFullYear()) delete options.year;
  return date.toLocaleString(locale, options);
};

const getVaultInitDate = (
  vault: Vault,
  vaultStatus: VaultStatus,
  locale: string
) => {
  //vaultPushTime is a bit more precise but may not be available in a device
  //using the same mnemonic. Also we may have old vaultPushTime of previous
  //attempts that never reached the blockchain for network issues...
  //creationTime is good enough.
  //Remember there are some props in vaultStatus that
  //are used to keep internal track of user actions. See docs on VaultStatus.
  const creationOrPushTime =
    vaultStatus.vaultPushTime && vaultStatus.vaultPushTime > vault.creationTime
      ? vaultStatus.vaultPushTime
      : vault.creationTime;
  return formatVaultDate(creationOrPushTime, locale);
};

const Amount = ({
  title,
  isConfirming,
  satsBalance,
  btcFiat,
  mode
}: {
  title: string;
  isConfirming: boolean;
  satsBalance: number | undefined;
  btcFiat: number | undefined;
  mode: 'Fiat' | SubUnit;
}) => {
  const { locale, currency } = useLocalization();
  const { t } = useTranslation();
  return (
    <>
      <Text className="text-slate-600 font-semibold native:text-sm web:text-xs native:mobmed:text-base web:mobmed:text-sm">
        {title}
      </Text>
      <View className="flex-row items-center justify-start">
        <Text
          className={
            `text-black native:text-xl web:text-lg font-bold ${satsBalance === undefined ? 'animate-pulse bg-slate-200 rounded overflow-hidden' : 'animate-none bg-transparent opacity-100'}`
            //after the animation it is important to set animate-none from the nativewind docs so that components are not re-rendered as new.
            //Also opacity must be reset to initial value
          }
        >
          {satsBalance === undefined
            ? LOADING_TEXT
            : formatBalance({
                satsBalance,
                btcFiat,
                currency,
                locale,
                mode,
                appendSubunit: true
              })}
        </Text>
        {isConfirming ? (
          <Text className="text-slate-500 native:text-sm web:text-xs">
            {`  •  ${t('wallet.vault.confirming')}…`}
          </Text>
        ) : null}
      </View>
    </>
  );
};

const VaultText: React.FC<{
  danger?: boolean;
  icon?: IconType;
  children: React.ReactNode;
}> = ({ danger = false, icon, children }) => {
  const Icon =
    icon && icon.family && Icons[icon.family] ? Icons[icon.family] : null;
  return (
    <View className="flex-row items-center">
      {icon && (
        <View className="flex-row items-center self-start">
          <Text className="!leading-5 native:text-sm native:mobmed:text-base inline-block w-0">
            {' '}
          </Text>
          <Icon
            className={`!leading-5 pr-3 ${danger ? 'text-red-300' : 'text-primary'} native:text-base native:mobmed:text-lg`}
            name={icon.name}
          />
        </View>
      )}
      <Text className="!leading-5 flex-shrink text-slate-600 native:text-sm native:mobmed:text-base">
        {children}
      </Text>
    </View>
  );
};

const VaultButton = ({
  mode,
  onPress,
  loading,
  msg,
  onInfoPress
}: {
  mode: 'secondary' | 'secondary-alert';
  onPress: () => void;
  loading: boolean;
  msg: string;
  onInfoPress?: () => void;
}) => (
  <View className={`flex-row items-center gap-2 mobmed:gap-4`}>
    <Button mode={mode} onPress={onPress} loading={loading}>
      {msg}
    </Button>
    {onInfoPress && <InfoButton onPress={onInfoPress} />}
  </View>
);

const permissionsForNotificationsIcon = {
  family: 'MaterialCommunityIcons',
  name: 'bell-alert-outline'
} as IconType;

const RawVault = ({
  setVaultNotificationAcknowledged,
  updateVaultStatus,
  pushTx,
  btcFiat,
  tipStatus,
  vault,
  vaultNumber,
  vaultStatus,
  blockExplorerURL,
  syncBlockchain,
  syncingBlockchain,
  watchtowerAPI,
  syncWatchtowerRegistration,
  ensurePermissionsAndToken,
  notificationPermissions,
  pushToken
}: {
  setVaultNotificationAcknowledged: (vaultId: string) => void;
  updateVaultStatus: (vaultId: string, vaultStatus: VaultStatus) => void;
  pushTx: (txHex: string) => Promise<void>;
  btcFiat: number | undefined;
  tipStatus: BlockStatus | undefined;
  vault: Vault;
  vaultNumber: number;
  vaultStatus: VaultStatus | undefined;
  blockExplorerURL: string | undefined;
  syncBlockchain: () => void;
  syncingBlockchain: boolean;
  watchtowerAPI: string | undefined;
  syncWatchtowerRegistration: (pushToken: string) => Promise<void>;
  ensurePermissionsAndToken: (mode: 'GET' | 'REQUEST') => Promise<{
    notificationPermissions:
      | Notifications.NotificationPermissionsStatus
      | undefined;
    pushToken: string | undefined;
  }>;

  notificationPermissions:
    | Notifications.NotificationPermissionsStatus
    | undefined;
  pushToken: string | undefined;
}) => {
  const [showDelegateHelp, setShowDelegateHelp] = useState<boolean>(false);
  const [showRescueHelp, setShowRescueHelp] = useState<boolean>(false);
  const [showInitUnfreezeHelp, setShowInitUnfreezeHelp] =
    useState<boolean>(false);
  const [showWatchtowerStatusModal, setShowWatchtowerStatusModal] =
    useState<boolean>(false);
  const handleDelegateHelp = useCallback(() => setShowDelegateHelp(true), []);
  const handleRescueHelp = useCallback(() => setShowRescueHelp(true), []);
  const handleInitUnfreezeHelp = useCallback(
    () => setShowInitUnfreezeHelp(true),
    []
  );
  const handleCloseDelegateHelp = useCallback(
    () => setShowDelegateHelp(false),
    []
  );
  const handleCloseRescueHelp = useCallback(() => setShowRescueHelp(false), []);
  const handleCloseInitUnfreezeHelp = useCallback(
    () => setShowInitUnfreezeHelp(false),
    []
  );
  const handleShowWatchtowerStatusModal = useCallback(async () => {
    setShowWatchtowerStatusModal(true);
  }, []);
  const handleCloseWatchtowerStatusModal = useCallback(
    () => setShowWatchtowerStatusModal(false),
    []
  );
  const { netRequest, internetReachable, watchtowerAPIReachable } =
    useNetStatus();
  const [isInitUnfreezeBeingHandled, setIsInitUnfreezeBeingHandled] =
    useState<boolean>(false);
  const isInitUnfreezePending =
    !vaultStatus?.triggerTxHex && isInitUnfreezeBeingHandled;

  const { t } = useTranslation();

  const [showInitUnfreeze, setShowInitUnfreeze] = useState<boolean>(false);
  const handleCloseInitUnfreeze = useCallback(
    () => setShowInitUnfreeze(false),
    []
  );
  const handleShowInitUnfreeze = useCallback(
    () => setShowInitUnfreeze(true),
    []
  );
  const handleInitUnfreeze = useCallback(
    async (initUnfreezeData: InitUnfreezeData) => {
      batchedUpdates(() => {
        setShowInitUnfreeze(false);
        setIsInitUnfreezeBeingHandled(true);
      });
      const { status: pushStatus } = await netRequest({
        whenToastErrors: 'ON_ANY_ERROR',
        errorMessage: (message: string) => t('app.pushError', { message }),
        func: async () => {
          setVaultNotificationAcknowledged(vault.vaultId);
          await pushTx(initUnfreezeData.txHex);
        }
      });
      if (pushStatus !== 'SUCCESS') setIsInitUnfreezeBeingHandled(false);
      else {
        if (!vaultStatus)
          throw new Error('vault status should exist for existing vault');
        const newVaultStatus = {
          ...vaultStatus,
          triggerTxHex: initUnfreezeData.txHex,
          triggerTxBlockHeight: 0,
          triggerPushTime: Math.floor(Date.now() / 1000)
        };
        updateVaultStatus(vault.vaultId, newVaultStatus);
      }
    },
    [
      setVaultNotificationAcknowledged,
      pushTx,
      vault.vaultId,
      vaultStatus,
      updateVaultStatus,
      netRequest,
      t
    ]
  );

  const [showDelegate, setShowDelegate] = useState<boolean>(false);
  const handleCloseDelegate = useCallback(() => setShowDelegate(false), []);
  const handleShowDelegate = useCallback(() => setShowDelegate(true), []);

  const [isRescueBeingHandled, setIsRescueBeingHandled] =
    useState<boolean>(false);
  const isRescueBeingHandledNotYetPushed =
    !vaultStatus?.panicTxHex && isRescueBeingHandled;
  const [showRescue, setShowRescue] = useState<boolean>(false);
  const handleCloseRescue = useCallback(() => setShowRescue(false), []);
  const handleShowRescue = useCallback(() => setShowRescue(true), []);
  const handleRescue = useCallback(
    async (rescueData: RescueData) => {
      batchedUpdates(() => {
        setShowRescue(false);
        setIsRescueBeingHandled(true);
      });
      const { status: pushStatus } = await netRequest({
        whenToastErrors: 'ON_ANY_ERROR',
        errorMessage: (message: string) => t('app.pushError', { message }),
        func: () => pushTx(rescueData.txHex)
      });
      if (pushStatus !== 'SUCCESS') setIsRescueBeingHandled(false);
      else {
        if (!vaultStatus)
          throw new Error('vault status should exist for existing vault');
        const newVaultStatus = {
          ...vaultStatus,
          panicTxHex: rescueData.txHex,
          panicTxBlockHeight: 0,
          panicPushTime: Math.floor(Date.now() / 1000)
        };
        updateVaultStatus(vault.vaultId, newVaultStatus);
      }
    },
    [pushTx, vault.vaultId, vaultStatus, updateVaultStatus, netRequest, t]
  );

  const { settings } = useSettings();
  if (!settings) throw new Error('Settings has not been retrieved');
  const tipHeight = tipStatus?.blockHeight;
  //const tipTime = blockchainData?.tipStatus.blockTime;
  const remainingBlocks =
    tipHeight &&
    vaultStatus &&
    getRemainingBlocks(vault, vaultStatus, tipHeight);
  const { locale } = useLocalization();
  const rescuedDate = formatVaultDate(vaultStatus?.panicTxBlockTime, locale);
  const rescuePushDate = formatVaultDate(vaultStatus?.panicPushTime, locale);
  const panicAddress = vault.coldAddress;
  const spentAsHotDate = formatVaultDate(
    vaultStatus?.spendAsHotTxBlockTime,
    locale
  );
  const unfrozenDate = formatVaultDate(vaultStatus?.hotBlockTime, locale);

  const isVaultTxConfirmed =
    vaultStatus?.vaultTxBlockHeight !== undefined &&
    vaultStatus.vaultTxBlockHeight > 0;
  const isVaultTxInMempool = vaultStatus?.vaultTxBlockHeight === 0;
  const isVaultTxPushed = !!vaultStatus?.vaultPushTime;
  const isVaultTx = isVaultTxPushed || isVaultTxInMempool || isVaultTxConfirmed;

  const isInitUnfreezeTxConfirmed =
    vaultStatus?.triggerTxBlockHeight !== undefined &&
    vaultStatus.triggerTxBlockHeight > 0;
  const isInitUnfreezeTxInMempool = vaultStatus?.triggerTxBlockHeight === 0;
  const isInitUnfreezeTxConfirmedButReversible =
    !!tipHeight &&
    !!vaultStatus?.triggerTxBlockHeight &&
    tipHeight - vaultStatus.triggerTxBlockHeight < IRREVERSIBLE_BLOCKS - 1;
  const isInitUnfreezeTxPushed = !!vaultStatus?.triggerPushTime;
  const isInitUnfreezeTx =
    isInitUnfreezeTxInMempool ||
    isInitUnfreezeTxPushed ||
    isInitUnfreezeTxConfirmed;
  const isUnfrozen =
    remainingBlocks === 0 || remainingBlocks === 'FOUND_AS_HOT';
  const isRescueTxPushed = !!vaultStatus?.panicPushTime;
  const isRescueTxInMempool = vaultStatus?.panicTxBlockHeight === 0;
  const isRescueTxConfirmed =
    vaultStatus?.panicTxBlockHeight !== undefined &&
    vaultStatus.panicTxBlockHeight > 0;
  const isRescueTx =
    isRescueTxPushed || isRescueTxInMempool || isRescueTxConfirmed;

  const canInitUnfreeze = isVaultTx && !isInitUnfreezeTx;
  const canBeRescued = isInitUnfreezeTx && !isUnfrozen && !isRescueTx;
  const canBeDelegated = isVaultTx && !isUnfrozen && !isRescueTx;

  const canBeHidden =
    !isVaultTx ||
    //can be hidden if irreversible after specified blocks
    //since either a rescue tx or after having reached a hot status
    (tipHeight &&
      ((vaultStatus?.panicTxBlockHeight &&
        tipHeight - vaultStatus.panicTxBlockHeight >=
          IRREVERSIBLE_BLOCKS - 1) ||
        (vaultStatus?.hotBlockHeight &&
          tipHeight - vaultStatus.hotBlockHeight >= IRREVERSIBLE_BLOCKS - 1)));

  const [scheduledNow, setScheduledNow] = useState<number>(Date.now() / 1000);
  //update now every 5 minutes...
  useEffect(() => {
    const interval = setInterval(
      () => {
        setScheduledNow(Date.now() / 1000);
      },
      5 * 60 * 1000
    );
    return () => clearInterval(interval);
  }, []);
  //if rendered for whatever other reason, get the newest time
  const now = Math.max(scheduledNow, Date.now() / 1000);

  const triggerBlockTimeBestGuess = vaultStatus?.triggerTxBlockTime
    ? vaultStatus.triggerTxBlockTime
    : isInitUnfreezeTxPushed || isInitUnfreezeTxInMempool
      ? now + 10 * 60 //expected is always 10' from now
      : undefined;

  //It's better to find out the unfreeze expected time based on the remainig time
  // and not using triggerTime + blockBlocks since previous blocks until now
  // may have not been 10' exactly
  const unfreezeTimeBestGuess = !triggerBlockTimeBestGuess
    ? undefined
    : typeof remainingBlocks !== 'number'
      ? undefined
      : remainingBlocks === 0
        ? undefined //this means it already is unfrozen
        : now + remainingBlocks * 10 * 60; //expected is always 10' from now, whatever is now

  const estimatedUnfreezeDate =
    unfreezeTimeBestGuess && formatVaultDate(unfreezeTimeBestGuess, locale);

  const triggerConfirmedDate = formatVaultDate(
    vaultStatus?.triggerTxBlockTime,
    locale
  );

  const plannedUnfreezeTimeButRescued =
    triggerBlockTimeBestGuess &&
    triggerBlockTimeBestGuess + vault.lockBlocks * 10 * 60;
  const plannedUnfreezeButRescuedDate = formatVaultDate(
    plannedUnfreezeTimeButRescued,
    locale
  );
  const triggerPushDate = formatVaultDate(vaultStatus?.triggerPushTime, locale);

  const vaultInitDate =
    vaultStatus && getVaultInitDate(vault, vaultStatus, locale);
  const vaultStatusRef = useRef(vaultStatus);
  useEffect(() => {
    return () => {
      vaultStatusRef.current = undefined; //unset on unmount
    };
  }, []);

  const handleHideVault = useCallback(() => {
    const newVaultStatus = {
      ...vaultStatus,
      isHidden: true
    };
    updateVaultStatus(vault.vaultId, newVaultStatus);
  }, [updateVaultStatus, vaultStatus, vault.vaultId]);

  const mode =
    settings.FIAT_MODE && typeof btcFiat === 'number'
      ? 'Fiat'
      : settings.SUB_UNIT;

  const frozenBalance =
    tipHeight &&
    vaultStatus &&
    getVaultFrozenBalance(vault, vaultStatus, tipHeight);
  const unfrozenBalance =
    tipHeight &&
    vaultStatus &&
    getVaultUnfrozenBalance(vault, vaultStatus, tipHeight);
  const rescuedBalance =
    tipHeight && vaultStatus && getVaultRescuedBalance(vault, vaultStatus);

  const retryWatchtowerSetup = useCallback(async () => {
    setShowWatchtowerStatusModal(false);
    //request if necessay (it gets if already granted):
    const { pushToken } = await ensurePermissionsAndToken('REQUEST');
    if (pushToken) await syncWatchtowerRegistration(pushToken);
    else console.warn('Failed during notification system request');
  }, [ensurePermissionsAndToken, syncWatchtowerRegistration]);
  // keep a stable ref to the latest retryWatchtowerSetup fn
  const retryWatchtowerSetupRef = useRef(retryWatchtowerSetup);
  useEffect(() => {
    retryWatchtowerSetupRef.current = retryWatchtowerSetup;
  }, [retryWatchtowerSetup]);

  // --- Derived Notification/Watchtower States ---
  const isWatchtowerRegistered =
    watchtowerAPI !== undefined &&
    !!vaultStatus?.registeredWatchtowers?.includes(watchtowerAPI);

  const isWatchtowerStatusPending =
    notificationPermissions === undefined ||
    watchtowerAPIReachable === undefined;

  const isWatchtowerDown =
    watchtowerAPIReachable === false && internetReachable === true;

  const shouldRetryPushToken =
    notificationPermissions?.status === 'granted' && pushToken !== '';

  const isNotificationPermissionReaskable =
    notificationPermissions &&
    notificationPermissions.status !== 'granted' &&
    notificationPermissions.canAskAgain;
  const shouldRequestNotificationPermission =
    !notificationPermissions || isNotificationPermissionReaskable;

  // Determine the overall status for UI elements
  const watchtowerNeedsRetry =
    !isWatchtowerStatusPending &&
    (!isWatchtowerRegistered ||
      isWatchtowerDown ||
      shouldRetryPushToken ||
      shouldRequestNotificationPermission);

  const watchtowerBellIconName =
    isWatchtowerStatusPending || (isWatchtowerRegistered && !isWatchtowerDown)
      ? 'bell-outline'
      : 'bell-off-outline';

  const watchtowerBellIconColor = isWatchtowerStatusPending
    ? 'slate' // Loading/Unknown
    : isWatchtowerRegistered && !isWatchtowerDown
      ? 'green' // Success state
      : 'red'; // Any failed state (not registered, watchtower down)

  const getWatchtowerStatusMessage = () => {
    if (isWatchtowerStatusPending) {
      return t('wallet.vault.watchtower.loading');
    }
    if (isWatchtowerRegistered) {
      return t('wallet.vault.watchtower.registered');
    } else if (notificationPermissions?.status === 'granted') {
      // Permissions OK, but not registered
      if (shouldRetryPushToken) {
        return t('wallet.vault.watchtower.pushTokenFailed');
      } else {
        return t('wallet.vault.watchtower.watchtowerServiceError');
      }
    } else {
      // Permissions not granted, but reaskable
      if (isNotificationPermissionReaskable) {
        return t('wallet.vault.watchtower.notGranted');
      } else {
        return Platform.OS === 'ios'
          ? t('wallet.vault.watchtower.settings.ios')
          : t('wallet.vault.watchtower.settings.android');
      }
    }
  };
  // --- End Derived States ---

  return (
    <View
      key={vault.vaultId}
      className="rounded-3xl bg-white overflow-hidden p-4"
    >
      {/* Header: Icon + Vault number + Creation Date  */}
      <View className="flex-row items-center justify-start mb-4">
        <VaultIcon remainingBlocks={remainingBlocks} />
        <Text className="font-semibold text-slate-800 web:text-base native:text-lg pl-2 flex-shrink-0">
          {t('wallet.vault.vaultTitle', { vaultNumber })}
        </Text>
        <Text
          className={
            `text-slate-500 flex-1 text-right pl-4 native:text-sm web:text-xs ${vaultStatus === undefined ? 'animate-pulse bg-slate-200 rounded overflow-hidden' : 'animate-none bg-transparent opacity-100'}`
            //after the animation it is important to set animate-none from the nativewind docs so that components are not re-rendered as new.
            //Also opacity must be reset to initial value
          }
        >
          {vaultInitDate
            ? t('wallet.vault.vaultDate', {
                date: vaultInitDate
              })
            : LOADING_TEXT}
        </Text>
      </View>
      <View>
        <View className="flex-row justify-between items-center">
          <View className="flex-1">
            {!!frozenBalance && (
              <Amount
                title={
                  isInitUnfreezeTx
                    ? t('wallet.vault.amountBeingUnfrozen')
                    : t('wallet.vault.amountFrozen')
                }
                isConfirming={
                  (isVaultTxPushed || isVaultTxInMempool) && !isVaultTxConfirmed
                }
                satsBalance={frozenBalance}
                btcFiat={btcFiat}
                mode={mode}
              />
            )}
            {!!unfrozenBalance && (
              <Amount
                title={t('wallet.vault.unfrozenAmount')}
                isConfirming={false}
                satsBalance={unfrozenBalance}
                btcFiat={btcFiat}
                mode={mode}
              />
            )}
            {!!rescuedBalance && (
              <Amount
                title={t('wallet.vault.rescuedAmount')}
                isConfirming={
                  (isRescueTxPushed || isRescueTxInMempool) &&
                  !isRescueTxConfirmed
                }
                satsBalance={rescuedBalance}
                btcFiat={btcFiat}
                mode={mode}
              />
            )}
          </View>
          {canReceiveNotifications &&
            (remainingBlocks === 'TRIGGER_NOT_FOUND' ||
              isInitUnfreezeTxInMempool ||
              isInitUnfreezeTxConfirmedButReversible) && (
              <Pressable
                onPress={handleShowWatchtowerStatusModal}
                hitSlop={20}
                disabled={isWatchtowerStatusPending}
                className={`p-1.5 bg-white rounded-xl shadow-sm android:elevation android:border android:border-slate-200 active:opacity-70 active:scale-95 ${isWatchtowerStatusPending ? 'animate-pulse' : ''}`}
              >
                <MaterialCommunityIcons
                  name={watchtowerBellIconName}
                  className={`text-xl ${watchtowerBellIconColor === 'red' ? 'text-red-500' : watchtowerBellIconColor === 'slate' ? 'text-slate-400' : 'text-green-500'}
                 `}
                />
              </Pressable>
            )}
        </View>
        {typeof remainingBlocks === 'number' && remainingBlocks > 0 && (
          <View className="flex-row items-center mt-2">
            {/*<MaterialCommunityIcons
              name="lock-clock"
              size={14}
              className="text-slate-900 pr-1"
            />*/}
            <Text className="native:text-sm web:text-xs uppercase text-primary-dark font-semibold">
              {t('wallet.vault.timeRemaining', {
                timeRemaining: formatBlocks(remainingBlocks, t, locale, true)
              })}
            </Text>
          </View>
        )}
        {remainingBlocks === 'TRIGGER_NOT_FOUND' && (
          <View className="flex-row items-center mt-2.5">
            {/*<MaterialCommunityIcons
              name="lock-clock"
              size={16}
              className="text-slate-900 pr-1"
            />*/}
            <Text className="native:text-sm web:text-xs uppercase text-primary-dark font-semibold">
              {t('wallet.vault.untriggeredLockTime', {
                timeRemaining: formatBlocks(vault.lockBlocks, t, locale, true)
              })}
            </Text>
          </View>
        )}
        <View className={`gap-4 ${isVaultTx ? 'pt-4' : ''}`}>
          {(isInitUnfreezeTxPushed || isInitUnfreezeTxInMempool) &&
            !isInitUnfreezeTxConfirmed && (
              <VaultText
                icon={{
                  name: 'clock-fast',
                  family: 'MaterialCommunityIcons'
                }}
              >
                {
                  triggerPushDate
                    ? t('wallet.vault.pushedTriggerNotConfirmed', {
                        triggerPushDate
                      })
                    : t('wallet.vault.pushedTriggerNotConfirmedUnknownDate')
                  //TODO: accelerate
                }
              </VaultText>
            )}
          {triggerConfirmedDate && (
            <VaultText
              icon={{
                name: 'clock-fast',
                family: 'MaterialCommunityIcons'
              }}
            >
              {t('wallet.vault.confirmedTrigger', {
                lockTime: formatBlocks(vault.lockBlocks, t, locale, true),
                triggerConfirmedDate
              })}
            </VaultText>
          )}
          {isInitUnfreezeTx &&
            !isUnfrozen &&
            !isRescueTx &&
            estimatedUnfreezeDate && (
              <VaultText
                icon={{
                  name: 'flag-checkered',
                  family: 'MaterialCommunityIcons'
                }}
              >
                {t('wallet.vault.triggerWithEstimatedDate', {
                  estimatedUnfreezeDate
                })}
              </VaultText>
            )}
          {isInitUnfreezeTx && isUnfrozen && (
            <VaultText
              icon={{
                name: 'flag-checkered',
                family: 'MaterialCommunityIcons'
              }}
            >
              {unfrozenDate
                ? t('wallet.vault.unfrozenDate', { unfrozenDate })
                : t('wallet.vault.unfrozenOnNextBlock')}
            </VaultText>
          )}
          {isRescueTx && plannedUnfreezeButRescuedDate && (
            <VaultText
              danger
              icon={{
                name: 'flag-off',
                family: 'MaterialCommunityIcons'
              }}
            >
              {t('wallet.vault.triggerWithEstimatedDateButRescued', {
                plannedUnfreezeButRescuedDate
              })}
            </VaultText>
          )}
          {rescuedDate && (
            <VaultText
              icon={{
                name: 'shield-alert-outline',
                family: 'MaterialCommunityIcons'
              }}
            >
              {t('wallet.vault.confirmedRescue', {
                rescuedDate,
                panicAddress
              })}
            </VaultText>
          )}
          {isRescueTx && !isRescueTxConfirmed && (
            <VaultText
              icon={{
                name: 'shield-alert-outline',
                family: 'MaterialCommunityIcons'
              }}
            >
              {
                rescuePushDate
                  ? t('wallet.vault.rescueNotConfirmed', {
                      rescuePushDate,
                      panicAddress
                    })
                  : t('wallet.vault.rescueNotConfirmedUnknownPush')
                //TODO: accelerate
              }
            </VaultText>
          )}
          {!isVaultTx && (
            <Text className="pt-2">{t('wallet.vault.vaultNotFound')}</Text>
          )}
          {remainingBlocks === 'TRIGGER_NOT_FOUND' && (
            <Text className="pt-2">
              {isVaultTxConfirmed
                ? t('wallet.vault.notTriggered', {
                    lockTime: formatBlocks(vault.lockBlocks, t, locale, true)
                  })
                : t('wallet.vault.notTriggeredUnconfirmed', {
                    lockTime: formatBlocks(vault.lockBlocks, t, locale, true)
                  })}
            </Text>
          )}
          {remainingBlocks === 'FOUND_AS_HOT' && (
            <Text className="pt-2">
              {spentAsHotDate
                ? t('wallet.vault.unfrozenAndSpent', { spentAsHotDate })
                : t('wallet.vault.unfrozenAndSpentPushed')}
            </Text>
          )}
          {remainingBlocks === 0 && (
            <Text className="pt-2">
              {t('wallet.vault.unfrozenAndHotBalance')}
            </Text>
          )}
          {isRescueTx && (
            // native:text-sm web:text-xs web:sm:text-sm
            <>
              <Text className="py-2">
                {isRescueTxConfirmed
                  ? t('wallet.vault.confirmedRescueAddress')
                  : t('wallet.vault.rescueNotConfirmedAddress')}
              </Text>
              {/*text-ellipsis, whitespace-nowrap & break-words is web only; overflow-hidden on a Text element breaks words
               flex-1 explanation: https://www.bam.tech/article/why-my-text-is-going-off-screen */}
              <Button
                iconRight={{
                  family: 'FontAwesome5',
                  name: 'external-link-alt'
                }}
                mode="text"
                textClassName="overflow-hidden flex-1"
                onPress={() =>
                  Linking.openURL(`${blockExplorerURL}/${panicAddress}`)
                }
              >
                {panicAddress}
              </Button>
            </>
          )}
        </View>
        {(canBeRescued || canInitUnfreeze || canBeDelegated || canBeHidden) && (
          <View
            className={`w-full flex-row ${[canBeRescued, canInitUnfreeze, canBeDelegated, canBeHidden].filter(Boolean).length > 1 ? 'justify-between flex-wrap' : 'justify-end'} pt-8 px-0 moblg:px-4 gap-4 moblg:gap-6`}
          >
            {canBeRescued && (
              <VaultButton
                mode="secondary-alert"
                onPress={handleShowRescue}
                loading={isRescueBeingHandledNotYetPushed}
                msg={t('wallet.vault.rescueButton')}
                onInfoPress={handleRescueHelp}
              />
            )}
            {canInitUnfreeze && (
              <VaultButton
                mode="secondary"
                onPress={handleShowInitUnfreeze}
                loading={isInitUnfreezePending}
                msg={t('wallet.vault.triggerUnfreezeButton')}
                onInfoPress={handleInitUnfreezeHelp}
              />
            )}
            {canBeDelegated && (
              <VaultButton
                mode="secondary"
                onPress={handleShowDelegate}
                loading={false}
                msg={t('wallet.vault.delegateButton')}
                onInfoPress={handleDelegateHelp}
              />
            )}
            {canBeHidden && (
              <VaultButton
                mode="secondary"
                onPress={handleHideVault}
                loading={false}
                msg={t('wallet.vault.hideButton')}
              />
            )}
          </View>
        )}
      </View>
      <InitUnfreeze
        vault={vault}
        isVisible={showInitUnfreeze}
        lockBlocks={vault.lockBlocks}
        onClose={handleCloseInitUnfreeze}
        onInitUnfreeze={handleInitUnfreeze}
      />
      <Rescue
        vault={vault}
        vaultStatus={vaultStatus}
        isVisible={showRescue}
        onClose={handleCloseRescue}
        onRescue={handleRescue}
      />
      <Delegate
        vault={vault}
        isVisible={showDelegate}
        onClose={handleCloseDelegate}
      />
      <Modal
        title={t('wallet.vault.help.delegate.title')}
        icon={{ family: 'FontAwesome5', name: 'hands-helping' }}
        isVisible={showDelegateHelp}
        onClose={handleCloseDelegateHelp}
        closeButtonText={t('understoodButton')}
      >
        <Text className="text-base pl-2 pr-2 text-slate-600">
          {t('wallet.vault.help.delegate.text')}
        </Text>
      </Modal>
      <Modal
        title={t('wallet.vault.help.rescue.title')}
        icon={{
          family: 'MaterialCommunityIcons',
          name: 'alarm-light'
        }}
        isVisible={showRescueHelp}
        onClose={handleCloseRescueHelp}
        closeButtonText={t('understoodButton')}
      >
        <Text className="text-base pl-2 pr-2 text-slate-600">
          {t('wallet.vault.help.rescue.text')}
        </Text>
      </Modal>
      <Modal
        title={t('wallet.vault.help.initUnfreeze.title')}
        icon={{
          family: 'MaterialCommunityIcons',
          name: 'snowflake-melt'
        }}
        isVisible={showInitUnfreezeHelp}
        onClose={handleCloseInitUnfreezeHelp}
        closeButtonText={t('understoodButton')}
      >
        <Text className="text-base pl-2 pr-2 text-slate-600">
          {t('wallet.vault.help.initUnfreeze.text')}
        </Text>
      </Modal>
      <Modal
        title={t('wallet.vault.watchtower.statusTitle')}
        icon={{
          family: 'MaterialCommunityIcons',
          name: 'bell'
        }}
        isVisible={showWatchtowerStatusModal}
        onClose={handleCloseWatchtowerStatusModal}
        customButtons={(() => {
          return (
            <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
              <Button
                mode={watchtowerNeedsRetry ? 'secondary' : 'primary'}
                onPress={handleCloseWatchtowerStatusModal}
              >
                {t('understoodButton')}
              </Button>
              {watchtowerNeedsRetry && (
                <Button
                  mode="primary"
                  disabled={isWatchtowerDown && syncingBlockchain}
                  onPress={
                    isWatchtowerDown
                      ? syncBlockchain
                      : retryWatchtowerSetupRef.current
                  }
                >
                  {t('wallet.vault.watchtower.retryButton')}
                </Button>
              )}
            </View>
          );
        })()}
      >
        <Text className="text-base pl-2 pr-2 text-slate-600">
          {getWatchtowerStatusMessage()}
        </Text>
      </Modal>
    </View>
  );
};

const Vault = React.memo(RawVault);

const Vaults = ({
  setVaultNotificationAcknowledged,
  updateVaultStatus,
  syncWatchtowerRegistration,
  pushTx,
  btcFiat,
  tipStatus,
  vaults,
  vaultsStatuses,
  blockExplorerURL,
  syncBlockchain,
  syncingBlockchain,
  watchtowerAPI,
  pushToken,
  setPushToken
}: {
  setVaultNotificationAcknowledged: (vaultId: string) => void;
  updateVaultStatus: (vaultId: string, vaultStatus: VaultStatus) => void;
  syncWatchtowerRegistration: (pushToken: string) => Promise<void>;
  pushTx: (txHex: string) => Promise<void>;
  btcFiat: number | undefined;
  tipStatus: BlockStatus | undefined;
  vaults: VaultsType;
  vaultsStatuses: VaultsStatuses;
  blockExplorerURL: string | undefined;
  syncBlockchain: () => void;
  syncingBlockchain: boolean;
  watchtowerAPI: string | undefined;
  pushToken: string | undefined;
  setPushToken: (token: string) => void;
}) => {
  const { t } = useTranslation();
  // This needs to be in state for rendering purposes:
  const [notificationPermissions, setNotificationPermissions] =
    useState<Notifications.NotificationPermissionsStatus>();
  const [
    showPermissionsForNotificationsExplainModal,
    setShowPermissionsForNotificationsExplainModal
  ] = useState(false);
  const closePermissionsForNotificationsExplainModal = useCallback(() => {
    setShowPermissionsForNotificationsExplainModal(false);
  }, []);

  const handleNotificationsSystemRequest = useCallback(async () => {
    setShowPermissionsForNotificationsExplainModal(false);
    const { pushToken } = await ensurePermissionsAndTokenRef.current('REQUEST');
    if (pushToken) await syncWatchtowerRegistrationRef.current(pushToken);
    else console.warn('Failed during notification system request');
  }, []);

  // Initialize push notifications whenever the vault count increases.
  // Requests permission if needed, then configures notifications
  // and syncs watchtower registration once per new vault detected.
  const vaultCount = Object.keys(vaults).length;
  // keep a stable ref to the latest syncWatchtowerRegistration fn
  const syncWatchtowerRegistrationRef = useRef(syncWatchtowerRegistration);
  useEffect(() => {
    syncWatchtowerRegistrationRef.current = syncWatchtowerRegistration;
  }, [syncWatchtowerRegistration]);

  //Check when the app comes to the foreground (perhaps it was in the back
  //while the user was tuning on notifications manually)
  //So here it's a good place to retrieve the pushToken
  const appState = useRef(AppState.currentState);
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active' &&
        canReceiveNotifications
      ) {
        const { pushToken } = await ensurePermissionsAndTokenRef.current('GET');
        //Won't do anything if already registerted, also never throws:
        if (pushToken) syncWatchtowerRegistrationRef.current(pushToken);
      }
      appState.current = nextAppState;
    };
    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange
    );
    return () => subscription.remove();
  }, []);

  /**
   * gets the most recent pushToken and notifications permissions
   * note that notification permissions can change at any time since
   * the user can revoke permissions any time. We'll detect those changes
   * new grants/revoke when the app comes back to the foreground (see above)
   */
  const ensurePermissionsAndToken = useCallback(
    async (mode: 'GET' | 'REQUEST') => {
      let currentPermissions = notificationPermissions;
      let currentPushToken = pushToken;

      try {
        currentPermissions =
          mode === 'GET'
            ? await Notifications.getPermissionsAsync()
            : await Notifications.requestPermissionsAsync();
        setNotificationPermissions(prevPermissions =>
          shallowEqualObjects(prevPermissions, currentPermissions)
            ? prevPermissions
            : currentPermissions
        );
      } catch (err) {
        console.warn('Could not getPermissionsAsync', err);
      }
      if (
        currentPermissions?.status === 'granted' &&
        //undefined is when it's still not been read from storage, and
        //therefore it's better not trying to set it
        //'' is when it's been read from storage and it had not been set yet.
        //Note that pushToken never changes so no need to requery it:
        //https://docs.expo.dev/push-notifications/faq/?utm_source=chatgpt.com#when-and-why-does-the-expopushtoken-change
        currentPushToken === ''
      ) {
        try {
          currentPushToken = await getExpoPushToken(
            t('wallet.vault.watchtower.permissionTitle')
          );
          setPushToken(currentPushToken);
        } catch (err) {
          console.warn('Could not getExpoPushToken', err);
        }
      }
      return {
        notificationPermissions: currentPermissions,
        pushToken: currentPushToken
      };
    },
    [pushToken, setPushToken, notificationPermissions, t]
  );
  // keep a stable ref to the latest ensurePermissionsAndToken fn
  const ensurePermissionsAndTokenRef = useRef(ensurePermissionsAndToken);
  useEffect(() => {
    ensurePermissionsAndTokenRef.current = ensurePermissionsAndToken;
  }, [ensurePermissionsAndToken]);

  //Each time a new vault is added, we must sync. This is the first
  //time the user may see the modal that will explain the user to accept the
  //system modal requesting push notifications permissions
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | undefined;

    const onNewVault = async () => {
      // Only proceed if we haven't synced yet and we have vaults
      if (canReceiveNotifications && vaultCount > 0) {
        const { pushToken, notificationPermissions } =
          await ensurePermissionsAndTokenRef.current('GET');
        try {
          if (
            notificationPermissions?.status !== 'granted' &&
            notificationPermissions?.canAskAgain
          )
            // show explanation modal after 3 seconds so that users
            // already have seen their vault activity
            timeoutId = setTimeout(
              () => setShowPermissionsForNotificationsExplainModal(true),
              3000
            );
          if (pushToken) await syncWatchtowerRegistrationRef.current(pushToken);
          else console.warn('Could not get push token during initial setup.');
        } catch (error: unknown) {
          console.warn(
            'Failed during notification permission check or setup:',
            error
          );
        }
      }
    };
    onNewVault();

    // Cleanup function to clear the timeout if the component unmounts
    // or if the effect re-runs before the timeout finishes
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [vaultCount]);

  const sortedVaults = useMemo(() => {
    return Object.values(vaults).sort(
      (a, b) => b.creationTime - a.creationTime
    );
  }, [vaults]);

  const hasVisibleVaults = useMemo(() => {
    return sortedVaults.some(vault => !vaultsStatuses[vault.vaultId]?.isHidden);
  }, [sortedVaults, vaultsStatuses]);

  return (
    <View className="gap-y-4">
      <Modal
        title={t('wallet.vault.watchtower.permissionTitle')}
        icon={permissionsForNotificationsIcon}
        isVisible={showPermissionsForNotificationsExplainModal}
        onClose={closePermissionsForNotificationsExplainModal}
        customButtons={
          <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center pb-4">
            <Button mode="primary" onPress={handleNotificationsSystemRequest}>
              {t('continueButton')}
            </Button>
          </View>
        }
      >
        <Text className="text-base pl-2 pr-2 text-slate-600">
          {t('wallet.vault.watchtower.permissionExplanation')}
        </Text>
      </Modal>
      {hasVisibleVaults ? (
        sortedVaults.map((vault, index) => {
          const vaultStatus = vaultsStatuses[vault.vaultId];
          return (
            !vaultStatus?.isHidden && (
              <Vault
                setVaultNotificationAcknowledged={
                  setVaultNotificationAcknowledged
                }
                updateVaultStatus={updateVaultStatus}
                key={vault.vaultId}
                btcFiat={btcFiat}
                tipStatus={tipStatus}
                vault={vault}
                vaultNumber={sortedVaults.length - index}
                vaultStatus={vaultStatus}
                pushTx={pushTx}
                blockExplorerURL={blockExplorerURL}
                syncBlockchain={syncBlockchain}
                syncingBlockchain={syncingBlockchain}
                watchtowerAPI={watchtowerAPI}
                notificationPermissions={notificationPermissions}
                pushToken={pushToken}
                ensurePermissionsAndToken={ensurePermissionsAndToken}
                syncWatchtowerRegistration={syncWatchtowerRegistration}
              />
            )
          );
        })
      ) : (
        <View className="flex-col items-center self-center my-4 max-w-80">
          <MaterialCommunityIcons
            name="snowflake-off"
            size={4 * 16}
            className="text-primary opacity-50"
          />
          <Text className="font-bold text-slate-600 mt-4 text-center text-lg">
            {t('wallet.vault.noFundsTile')}
          </Text>
          <Text className="text-slate-500 mt-2 text-center">
            {t('wallet.vault.noFundsBody')}
          </Text>
          <LearnMoreAboutVaults />
        </View>
      )}
    </View>
  );
};

export default React.memo(Vaults);
