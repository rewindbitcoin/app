//TODO: create a formatter tgat renders: Confirming... or Confirmed on {}. Based on the blockHeight
//Usar este icono oara init unfreeze!!! https://icons.expo.fyi/Index/MaterialCommunityIcons/snowflake-melt
//For the delegage something along this;: https://icons.expo.fyi/Index/FontAwesome/handshake-o
//https://icons.expo.fyi/Index/Foundation/torsos-all
//or this: https://icons.expo.fyi/Index/FontAwesome5/hands-helping
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text } from 'react-native';

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
import { formatBalance } from '../lib/format';
import { Button } from '../../common/ui';

import { useSettings } from '../hooks/useSettings';
import type { SubUnit } from '../lib/settings';
import type { Locale } from '../../i18n-locales/init';
import type { BlockchainData } from '../contexts/WalletContext';

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
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  };

  // If the date is in the current year, delete the year to the options
  if (date.getFullYear() === now.getFullYear()) delete options.year;

  // If the date is in the same month and year, remove the month from the options
  if (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  )
    delete options.month;

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
      <Text className="text-slate-500 native:text-sm web:text-xs font-semibold">
        {title}
      </Text>
      <View className="flex-row items-center justify-start">
        <Text
          className={`native:text-xl web:text-lg font-bold ${satsBalance === undefined ? 'animate-pulse bg-slate-200 rounded' : 'bg-transparent'}`}
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

//const Label = ({ label }: { label: string }) => {
//  return <Text>{label}</Text>;
//};
//
//const DateValue = ({
//  time,
//  locale
//}: {
//  time: undefined | number;
//  locale: Locale;
//}) => {
//  return (
//    <Text
//      className={`${time ? 'bg-transparent' : 'animate-pulse bg-slate-200 rounded'}`}
//    >
//      {time ? formatVaultDate(time, locale) : LOADING_TEXT}
//    </Text>
//  );
//};
//
//const Details = ({
//  remainingBlocks,
//  triggerTime,
//  rescueTime,
//  hotTime,
//  tipTime,
//  locale
//}: {
//  remainingBlocks: ReturnType<typeof getRemainingBlocks> | undefined;
//  triggerTime: undefined | number;
//  rescueTime: undefined | number;
//  hotTime: undefined | number;
//  tipTime: undefined | number;
//  locale: Locale;
//}) => {
//  const { t } = useTranslation();
//  /*
//
//      <Text>Unfrozen Amount</Text>
//      <Text>Rescued Amount</Text>
//      <Text>xxx btc</Text>
//      <Text>This vault was unfrozen on XXX</Text>
//      <Text>xxx btc</Text>
//      <Text>This vault was rescued on XXX</Text>
//       return 'TODO: This vault is being unfrozen • 3 days remaining';
//  */
//
//  if (remainingBlocks === 'SPENT_AS_PANIC') {
//    return (
//      <>
//        <View>
//          <Label label={t('wallet.vault.triggerLabel')} />
//          <DateValue time={hotTime} locale={locale} />
//        </View>
//        <View>
//          <Label label={t('wallet.vault.rescueDateLabel')} />
//          <DateValue time={rescueTime} locale={locale} />
//        </View>
//        <View>
//          <Label label={t('wallet.vault.rescueAddressLabel')} />
//          <DateValue time={panicTxHex.extractAddress} locale={locale} />
//        </View>
//      </>
//    );
//  } else if (typeof remainingBlocks === 'number' && remainingBlocks > 0) {
//    return (
//      <>
//        <View>
//          <Label label={t('wallet.vault.triggerLabel')} />
//          <DateValue time={hotTime} locale={locale} />
//        </View>
//        <View>
//          <Label label={t('wallet.vault.frozenRemainingDateLabel')} />
//          <DateValue
//            locale={locale}
//            time={tipTime && tipTime + 588 * remainingBlocks}
//          />
//        </View>
//        ;
//      </>
//    );
//  } else if (remainingBlocks === 0 /* || remainingBlocks === 'SPENT_AS_HOT'*/) {
//    const isLoading = !triggerTime || !hotTime;
//    return (
//      <Text>
//        <Trans
//          i18nKey="wallet.vault.vaultIsHot"
//          values={{
//            requestDate: isLoading
//              ? LOADING_TEXT
//              : formatVaultDate(triggerTime, locale),
//            time: isLoading ? LOADING_TEXT : formatVaultDate(hotTime, locale)
//          }}
//          components={{
//            wrapper: (
//              <Text
//                className={`${isLoading ? 'animate-pulse bg-slate-200 rounded' : 'bg-transparent'}`}
//              />
//            )
//          }}
//        />
//      </Text>
//    );
//  } else if (remainingBlocks === 0 || remainingBlocks === 'SPENT_AS_HOT') {
//    text = t('wallet.vault.vaultIsHot', {
//      requestDate: triggerTime
//        ? formatVaultDate(triggerTime, locale)
//        : LOADING_TEXT,
//      hotDate: formatVaultDate(hotTime, locale)
//    });
//  } else if (remainingBlocks === 'SPENT_AS_PANIC') {
//    text = t('wallet.vault.rescued', {
//      date: formatVaultDate(rescueTime, locale)
//    });
//  }
//};

const Vault = ({
  btcFiat,
  blockchainData,
  vault,
  vaultNumber,
  vaultStatus
}: {
  btcFiat: number | undefined;
  blockchainData: BlockchainData | undefined;
  vault: Vault;
  vaultNumber: number;
  vaultStatus: VaultStatus | undefined;
}) => {
  const { settings } = useSettings();
  if (!settings) throw new Error('Settings has not been retrieved');
  const tipHeight = blockchainData?.tipStatus.blockHeight;
  //const tipTime = blockchainData?.tipStatus.blockTime;
  const remainingBlocks =
    tipHeight &&
    vaultStatus &&
    getRemainingBlocks(vault, vaultStatus, tipHeight);
  const locale = settings.LOCALE;
  const triggerDate = formatVaultDate(vaultStatus?.triggerTxBlockTime, locale);
  const rescueDate = formatVaultDate(vaultStatus?.panicTxBlockTime, locale);
  const unfreezeDate = formatVaultDate(vaultStatus?.hotBlockTime, locale);
  const estimatedUnfreezeDate =
    vaultStatus?.triggerTxBlockTime && typeof remainingBlocks === 'number'
      ? formatVaultDate(
          vaultStatus?.triggerTxBlockTime + remainingBlocks,
          locale
        )
      : undefined;
  const vaultStatusRef = useRef(vaultStatus);
  useEffect(() => {
    return () => {
      vaultStatusRef.current = undefined; //unset on unmount
    };
  }, []);

  const { t } = useTranslation();

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

      {/* Body */}
      <View className="p-4 pt-0">
        <Amount
          title={t('wallet.vault.amountFrozen')}
          isConfirming={!vaultStatus?.vaultTxBlockHeight}
          satsBalance={frozenBalance}
          btcFiat={btcFiat}
          mode={mode}
        />
        {/*this part should be only about the trigger*/}
        <Text>
          {
            //TODO: Note that here below some of the dates may be undefined so
            //I'd need some kind of LOADING_TEXT
            remainingBlocks === 'SPENT_AS_PANIC'
              ? t('wallet.vault.rescuedAfterUnfreeze', { rescueDate })
              : remainingBlocks === 'SPENT_AS_HOT'
                ? t('wallet.vault.unfrozenAndSpent', {
                    triggerDate,
                    unfreezeDate
                  })
                : remainingBlocks === 0
                  ? t('wallet.vault.unfrozenAndHotBalance', {
                      triggerDate,
                      unfreezeDate
                    })
                  : typeof remainingBlocks === 'number' && remainingBlocks > 0
                    ? t('wallet.vault.triggerWithEstimatedDate', {
                        triggerDate,
                        estimatedUnfreezeDate
                      })
                    : null
          }
        </Text>
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
        <Text>Unfrozen amount / Rescued amount</Text>
        {/*this part should be about the rescue / hot*/}
        {/*<Details
          remainingBlocks={remainingBlocks}
          triggerTime={triggerTime}
          rescueTime={rescueTime}
          hotTime={hotTime}
          tipTime={tipTime}
        />*/}
        {
          // Rescued
          vaultStatus?.panicTxHex && <View></View>
        }
        {
          // Spendable
          remainingBlocks === 0 && !vaultStatus?.panicTxHex && <View></View>
        }
        <View className="w-full flex-row justify-between">
          <Button mode="secondary" onPress={handleDelegateVault}>
            {t('wallet.vault.triggerUnfreezeButton')}
          </Button>
          <Button mode="secondary" onPress={handleDelegateVault}>
            Delegate
          </Button>
        </View>
      </View>
    </View>
  );
};

const Vaults = ({
  btcFiat,
  blockchainData,
  vaults,
  vaultsStatuses
}: {
  btcFiat: number | undefined;
  blockchainData: BlockchainData | undefined;
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
            key={vault.vaultId}
            btcFiat={btcFiat}
            blockchainData={blockchainData}
            vault={vault}
            vaultNumber={sortedVaults.length - index}
            vaultStatus={vaultStatus}
          />
        );
      })}
    </View>
  );
};

export default React.memo(Vaults);
