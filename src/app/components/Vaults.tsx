//TODO: create a formatter tgat renders: Confirming... or Confirmed on {}. Based on the blockHeight
//Usar este icono oara init unfreeze!!! https://icons.expo.fyi/Index/MaterialCommunityIcons/snowflake-melt
//For the delegage something along this;: https://icons.expo.fyi/Index/FontAwesome/handshake-o
//https://icons.expo.fyi/Index/Foundation/torsos-all
//or this: https://icons.expo.fyi/Index/FontAwesome5/hands-helping
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  View,
  Text,
  unstable_batchedUpdates as RN_unstable_batchedUpdates,
  Platform
} from 'react-native';
import * as Icons from '@expo/vector-icons';
const unstable_batchedUpdates = Platform.select({
  web: (cb: () => void) => {
    cb();
  },
  default: RN_unstable_batchedUpdates
});

import {
  type Vault,
  type VaultStatus,
  type VaultsStatuses,
  type Vaults as VaultsType,
  getVaultFrozenBalance,
  getRemainingBlocks,
  getVaultUnfrozenBalance
} from '../lib/vaults';
import VaultIcon from './VaultIcon';
import { useTranslation } from 'react-i18next';
import { delegateVault } from '../lib/backup';
import { formatBalance, formatBlocks } from '../lib/format';
import { Button, IconType, InfoButton } from '../../common/ui';

import { useSettings } from '../hooks/useSettings';
import type { SubUnit } from '../lib/settings';
import type { Locale } from '../../i18n-locales/init';
import type { BlockStatus } from '@bitcoinerlab/explorer/dist/interface';
import InitUnfreeze, { InitUnfreezeData } from './InitUnfreeze';

/*
 *
  <Pressable className="flex-row items-center p-4 shadow rounded-xl bg-primary hover:opacity-90 active:opacity-90 active:scale-95">
    <Spin />
    <Text className="font-semibold text-white">Processing...</Text>
  </Pressable>
*/

const LOADING_TEXT = '     ';

const formatVaultDate = (unixTime: number | undefined, locale: Locale) => {
  if (!unixTime) return;
  const date = new Date(unixTime * 1000);
  const now = new Date();

  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long', // Month in letters
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };

  // If the date is in the current year, delete the year to the options
  if (date.getFullYear() === now.getFullYear()) delete options.year;

  // If the date is in the same month and year, remove the month from the options
  //if (
  //  date.getFullYear() === now.getFullYear() &&
  //  date.getMonth() === now.getMonth()
  //)
  //  delete options.month;

  return date.toLocaleString(locale, options);
};

const getVaultInitDate = (
  vault: Vault,
  vaultStatus: VaultStatus,
  locale: Locale
) => {
  //vaultPushTime is a bit more precise but may not be available in a device
  //using the same mnemonic. creationTime is good enough.
  //Remember there are some props in vaultStatus that
  //are used to keep internal track of user actions. See docs on VaultStatus.
  const creationOrPushTime = vaultStatus.vaultPushTime || vault.creationTime;
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
  const { settings } = useSettings();
  const { t } = useTranslation();
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );
  return (
    <>
      <Text className="text-slate-600 font-semibold pb-1 native:text-sm web:text-xs native:mobmed:text-base web:mobmed:text-sm">
        {title}
      </Text>
      <View className="flex-row items-center justify-start">
        <Text
          className={`text-black native:text-xl web:text-lg font-bold ${satsBalance === undefined ? 'animate-pulse bg-slate-200 rounded' : 'bg-transparent'}`}
        >
          {satsBalance === undefined
            ? LOADING_TEXT
            : formatBalance({
                satsBalance,
                btcFiat,
                currency: settings.CURRENCY,
                locale: settings.LOCALE,
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
  icon?: IconType;
  children: React.ReactNode;
}> = ({ icon, children }) => {
  const Icon =
    icon && icon.family && Icons[icon.family] ? Icons[icon.family] : null;
  return (
    <View className="flex-row items-center">
      {icon && (
        <Icon
          className="pr-2 text-primary-dark native:text-base web:text-sm native:mobmed:text-lg web:mobmed:text-base"
          name={icon.name}
        />
      )}
      <Text className="text-slate-700 native:text-sm web:text-xs native:mobmed:text-base web:mobmed:text-sm">
        {children}
      </Text>
    </View>
  );
};

const Vault = ({
  updateVaultStatus,
  pushTx,
  btcFiat,
  tipStatus,
  vault,
  vaultNumber,
  vaultStatus
}: {
  updateVaultStatus: (vaultId: string, vaultStatus: VaultStatus) => void;
  pushTx: (txHex: string) => Promise<boolean>;
  btcFiat: number | undefined;
  tipStatus: BlockStatus | undefined;
  vault: Vault;
  vaultNumber: number;
  vaultStatus: VaultStatus | undefined;
}) => {
  const [isUnfreezeInitValid, setIsUnfreezeInitValid] =
    useState<boolean>(false);
  const isUnfreezeInitPending =
    !vaultStatus?.triggerTxHex && isUnfreezeInitValid;

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

  const [isRescueInitValid, setIsRescueInitValid] = useState<boolean>(false);
  const isRescueInitPending = !vaultStatus?.triggerTxHex && isRescueInitValid;
  const [showInitRescue, setShowInitRescue] = useState<boolean>(false);
  const handleInitRescue = useCallback(() => setShowInitRescue(true), []);
  const handleInitUnfreeze = useCallback(
    //TODO - set the triggerPushTime?: number;
    async (initUnfreezeData: InitUnfreezeData) => {
      unstable_batchedUpdates(() => {
        setShowInitUnfreeze(false);
        setIsUnfreezeInitValid(true);
      });
      const pushResult = await pushTx(initUnfreezeData.txHex);
      if (pushResult) {
        if (!vaultStatus)
          throw new Error('vault status should exist for existing vault');
        const newVaultStatus = {
          ...vaultStatus,
          triggerTxHex: initUnfreezeData.txHex,
          triggerTxBlockHeight: 0,
          triggerPushTime: Math.floor(Date.now() / 1000)
        };
        updateVaultStatus(vault.vaultId, newVaultStatus);
      } else setIsUnfreezeInitValid(false);
    },
    [pushTx, vault.vaultId, vaultStatus, updateVaultStatus]
  );
  const { settings } = useSettings();
  if (!settings) throw new Error('Settings has not been retrieved');
  const tipHeight = tipStatus?.blockHeight;
  //const tipTime = blockchainData?.tipStatus.blockTime;
  const remainingBlocks =
    tipHeight &&
    vaultStatus &&
    getRemainingBlocks(vault, vaultStatus, tipHeight);
  const locale = settings.LOCALE;
  const rescuedDate = formatVaultDate(vaultStatus?.panicTxBlockTime, locale);
  const spentAsHotDate = formatVaultDate(
    vaultStatus?.spendAsHotTxBlockTime,
    locale
  );
  const unfrozenDate = formatVaultDate(vaultStatus?.hotBlockTime, locale);
  const isUnfreezeInitConfirmed = !!vaultStatus?.triggerTxBlockHeight;
  const isUnfreezeInitNotConfirmed =
    vaultStatus?.triggerPushTime && !isUnfreezeInitConfirmed;
  const isUnfreezeInit = isUnfreezeInitNotConfirmed || isUnfreezeInitConfirmed;
  const isUnfrozen =
    remainingBlocks === 0 || remainingBlocks === 'SPENT_AS_HOT';
  const isRescued = remainingBlocks === 'SPENT_AS_PANIC';

  const canBeRescued = isUnfreezeInit && !rescuedDate && !spentAsHotDate;
  const canBeDelegated = isUnfreezeInit || remainingBlocks === 'NOT_PUSHED';
  const isUnfreezeOngoing =
    typeof remainingBlocks === 'number' && remainingBlocks > 0;

  console.log({
    status: vaultStatus,
    isUnfreezeInitConfirmed,
    isUnfreezeInitNotConfirmed,
    unfrozenDate,
    canBeRescued
  });

  const now = Math.floor(Date.now() / 1000);

  const triggerTimeBestGuess =
    vaultStatus?.triggerTxBlockTime ||
    (vaultStatus?.triggerPushTime
      ? now + 10 * 60 //expected is always 10' from now
      : undefined);

  //It's better to find out the unfreeze expected time based on the remainig time
  // and not using triggerTime + blockBlocks since previous blocks untiul now
  // may have not been 10' exactly
  const unfreezeTimeBestGuess = !triggerTimeBestGuess
    ? undefined
    : typeof remainingBlocks !== 'number'
      ? undefined
      : remainingBlocks === 0
        ? undefined //this means it already is unfrozen
        : now + remainingBlocks * 10 * 60; //expected is always 10' from now, whatever is now

  //const remainingTimeBestGuess =
  //  unfreezeTimeBestGuess && unfreezeTimeBestGuess - now;

  const estimatedUnfreezeDate =
    unfreezeTimeBestGuess && formatVaultDate(unfreezeTimeBestGuess, locale);
  const vaultStatusRef = useRef(vaultStatus);
  useEffect(() => {
    return () => {
      vaultStatusRef.current = undefined; //unset on unmount
    };
  }, []);

  const handleDelegateVault = useCallback(() => {
    const readmeText = t('walletHome.delegateReadme');
    const readme = readmeText.split('\n');

    delegateVault({ readme, vault });
  }, [t, vault]);
  const mode =
    settings.FIAT_MODE && typeof btcFiat === 'number'
      ? 'Fiat'
      : settings.SUB_UNIT;

  const frozenBalance =
    tipHeight &&
    vaultStatus &&
    getVaultFrozenBalance(vault, vaultStatus, tipHeight);
  const unfrozenBalance =
    vaultStatus && getVaultUnfrozenBalance(vault, vaultStatus);

  //<Text className="font-semibold text-primary-dark bg-primary text-white flex-1 p-4 w-full text-base">
  // TODO when not vaulted show: This Vault has been unfrozen and is moved to your available balance. TODO when panicked show: This Vault was rescued and was moved to your cold address: ADDRESS.

  return (
    <View
      key={vault.vaultId}
      className="items-center rounded-3xl bg-white overflow-hidden"
    >
      {/* Header: Icon + Vault number + Creation Date  */}
      <View className="flex-row items-center justify-start w-full p-4">
        <VaultIcon remainingBlocks={remainingBlocks} />
        <Text className="font-semibold text-slate-800 web:text-base native:text-lg pl-2 flex-shrink-0">
          {t('wallet.vault.vaultTitle', { vaultNumber })}
        </Text>
        <Text
          className={`text-slate-500 flex-1 text-right pl-4 native:text-sm web:text-xs ${vaultStatus === undefined ? 'animate-pulse bg-slate-200 rounded' : 'bg-transparent'}`}
        >
          {vaultStatus
            ? t('wallet.vault.vaultDate', {
                date: getVaultInitDate(vault, vaultStatus, locale)
              })
            : LOADING_TEXT}
        </Text>
      </View>
      <View className="p-4 pt-0">
        <Amount
          title={
            isUnfreezeOngoing
              ? t('wallet.vault.amountBeingUnfrozen')
              : t('wallet.vault.amountFrozen')
          }
          isConfirming={!vaultStatus?.vaultTxBlockHeight}
          satsBalance={frozenBalance}
          btcFiat={btcFiat}
          mode={mode}
        />
        {isUnfreezeOngoing && (
          <Text className="native:text-sm web:text-xs uppercase text-slate-700">
            {formatBlocks(remainingBlocks, t, true) ===
            formatBlocks(vault.lockBlocks, t, true)
              ? t('wallet.vault.timeRemaining', {
                  timeRemaining: formatBlocks(remainingBlocks, t, true)
                })
              : t('wallet.vault.timeRemainingWrt', {
                  timeRemaining: formatBlocks(remainingBlocks, t, true),
                  lockTime: formatBlocks(vault.lockBlocks, t, true)
                })}
          </Text>
        )}
        {remainingBlocks === 'NOT_PUSHED' && (
          <Text className="native:text-sm web:text-xs uppercase text-slate-700">
            {t('wallet.vault.untriggeredLockTime', {
              timeRemaining: formatBlocks(vault.lockBlocks, t, true)
            })}
          </Text>
        )}
        <View className="gap-2 pt-4">
          {/*this part should be only about the trigger*/}
          {isUnfreezeInitNotConfirmed && (
            <VaultText
              icon={{
                name: 'clock-start',
                family: 'MaterialCommunityIcons'
              }}
            >
              {t('wallet.vault.pushedTriggerNotConfirmed', {
                triggerPushDate: formatVaultDate(
                  vaultStatus?.triggerPushTime,
                  locale
                )
              })}
            </VaultText>
          )}
          {vaultStatus?.triggerTxBlockTime && (
            <VaultText
              icon={{
                name: 'clock-start',
                family: 'MaterialCommunityIcons'
              }}
            >
              {t('wallet.vault.confirmedTrigger', {
                triggerConfirmedDate: formatVaultDate(
                  vaultStatus?.triggerTxBlockTime,
                  locale
                )
              })}
            </VaultText>
          )}
          {isUnfreezeInit && !isUnfrozen && (
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
          {isUnfreezeInit && isUnfrozen && (
            <VaultText
              icon={{
                name: 'flag-checkered',
                family: 'MaterialCommunityIcons'
              }}
            >
              {t('wallet.vault.unfrozenDate', { unfrozenDate })}
            </VaultText>
          )}
          {remainingBlocks === 'NOT_PUSHED' && (
            <Text>
              {t('wallet.vault.notTriggered', {
                lockTime: formatBlocks(vault.lockBlocks, t, true)
              })}
            </Text>
          )}
          {remainingBlocks === 'SPENT_AS_PANIC' && (
            <Text>
              {t('wallet.vault.rescuedAfterUnfreeze', { rescuedDate })}
            </Text>
          )}
          {remainingBlocks === 'SPENT_AS_HOT' && (
            <Text>
              {t('wallet.vault.unfrozenAndSpent', {
                unfrozenDate
              })}
            </Text>
          )}
          {remainingBlocks === 0 && (
            <Text>
              {t('wallet.vault.unfrozenAndHotBalance', {
                unfrozenDate
              })}
            </Text>
          )}
          {remainingBlocks === 'SPENT_AS_HOT' ||
            (remainingBlocks === 0 && (
              <Amount
                title={t('wallet.vault.unfrozenAmount')}
                isConfirming={false}
                satsBalance={unfrozenBalance}
                btcFiat={btcFiat}
                mode={mode}
              />
            ))}
        </View>
        <View>
          {/*this part should be about the rescue / hot*/}
          {
            // Rescued
            vaultStatus?.panicTxHex && <View></View>
          }
          {
            // Spendable
            remainingBlocks === 0 && !vaultStatus?.panicTxHex && <View></View>
          }
        </View>
        <View className="w-full flex-row justify-between pt-4 gap-6">
          {canBeRescued && (
            <View className={`flex-row items-center gap-2 mobmed:gap-4`}>
              <Button
                mode="secondary-alert"
                onPress={handleInitRescue}
                loading={isRescueInitPending}
              >
                {t('wallet.vault.rescueButton')}
              </Button>
              <InfoButton />
            </View>
          )}
          {!isUnfreezeInit && (
            <View className={`flex-row items-center gap-2 mobmed:gap-4`}>
              <View className={`max-w-24 mobmed:max-w-full`}>
                <Button
                  mode="secondary"
                  onPress={handleShowInitUnfreeze}
                  loading={isUnfreezeInitPending}
                >
                  {t('wallet.vault.triggerUnfreezeButton')}
                </Button>
              </View>
              <InfoButton />
            </View>
          )}
          {canBeDelegated && (
            <View className={`flex-row items-center gap-2 mobmed:gap-4`}>
              <Button mode="secondary" onPress={handleDelegateVault}>
                Delegate
              </Button>
              <InfoButton />
            </View>
          )}
        </View>
      </View>
      <InitUnfreeze
        vault={vault}
        isVisible={showInitUnfreeze}
        lockBlocks={vault.lockBlocks}
        onClose={handleCloseInitUnfreeze}
        onInit={handleInitUnfreeze}
      />
    </View>
  );
};

const Vaults = ({
  updateVaultStatus,
  pushTx,
  btcFiat,
  tipStatus,
  vaults,
  vaultsStatuses
}: {
  updateVaultStatus: (vaultId: string, vaultStatus: VaultStatus) => void;
  pushTx: (txHex: string) => Promise<boolean>;
  btcFiat: number | undefined;
  tipStatus: BlockStatus | undefined;
  vaults: VaultsType;
  vaultsStatuses: VaultsStatuses;
}) => {
  const sortedVaults = useMemo(() => {
    return Object.values(vaults).sort(
      (a, b) => b.creationTime - a.creationTime
    );
  }, [vaults]);

  return (
    <View className="gap-4 max-w-2xl self-center">
      {sortedVaults.map((vault, index) => {
        const vaultStatus = vaultsStatuses[vault.vaultId];
        return (
          <Vault
            updateVaultStatus={updateVaultStatus}
            key={vault.vaultId}
            btcFiat={btcFiat}
            tipStatus={tipStatus}
            vault={vault}
            vaultNumber={sortedVaults.length - index}
            vaultStatus={vaultStatus}
            pushTx={pushTx}
          />
        );
      })}
    </View>
  );
};

export default React.memo(Vaults);
