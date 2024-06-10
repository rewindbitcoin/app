//TODO: create a formatter tgat renders: Confirming... or Confirmed on {}. Based on the blockHeight
//Usar este icono oara init unfreeze!!! https://icons.expo.fyi/Index/MaterialCommunityIcons/snowflake-melt
//For the delegage something along this;: https://icons.expo.fyi/Index/FontAwesome/handshake-o
//https://icons.expo.fyi/Index/Foundation/torsos-all
//or this: https://icons.expo.fyi/Index/FontAwesome5/hands-helping
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef
} from 'react';
import { View, Text } from 'react-native';

import {
  type Vault,
  type VaultStatus,
  type VaultsStatuses,
  type Vaults as VaultsType,
  getVaultFrozenBalance,
  getRemainingBlocks
} from '../lib/vaults';
import VaultIcon from './VaultIcon';
import { useTranslation } from 'react-i18next';
import { delegateVault } from '../lib/backup';
import { formatBalance } from '../lib/format';
import { Button } from '../../common/ui';
import { fetchBlockTimestamp } from '../lib/blockchain';

import { useSettings } from '../hooks/useSettings';
import type { SubUnit } from '../lib/settings';

/*
 *
  <Pressable className="flex-row items-center p-4 shadow rounded-xl bg-primary hover:opacity-90 active:opacity-90 active:scale-95">
    <Spin />
    <Text className="font-semibold text-white">Processing...</Text>
  </Pressable>
*/

const LOADING_TEXT = '     ';

const formatVaultDate = (unixTime: number) => {
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

  return date.toLocaleString(undefined, options);
};

const getVaultInitDate = (vault: Vault, vaultStatus: VaultStatus) => {
  //vaultPushTime is a bit more precise but may not be available in a device
  //using the same mnemonic. creationTime is good enough.
  //Remember there are some props in vaultStatus that
  //are used to keep internal track of user actions. See docs on VaultStatus.
  const creationOrPushTime = vaultStatus.vaultPushTime || vault.creationTime;
  return formatVaultDate(creationOrPushTime);
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

const Label = ({ label }: { label: string }) => {
  return <Text>{label}</Text>;
};

const DateValue = ({ time }: { time: undefined | number }) => {
  return (
    <Text
      className={`${time ? 'bg-transparent' : 'animate-pulse bg-slate-200 rounded'}`}
    >
      {time ? formatVaultDate(time) : LOADING_TEXT}
    </Text>
  );
};

const Details = ({
  remainingBlocks,
  triggerBlockTime,
  rescueBlockTime,
  hotBlockTime,
  tipBlockTime
}: {
  remainingBlocks: ReturnType<typeof getRemainingBlocks> | undefined;
  triggerBlockTime: undefined | number;
  rescueBlockTime: undefined | number;
  hotBlockTime: undefined | number;
  tipBlockTime: undefined | number;
}) => {
  const { t } = useTranslation();
  /*

      <Text>Unfrozen Amount</Text>
      <Text>Rescued Amount</Text>
      <Text>xxx btc</Text>
      <Text>This vault was unfrozen on XXX</Text>
      <Text>xxx btc</Text>
      <Text>This vault was rescued on XXX</Text>
       return 'TODO: This vault is being unfrozen • 3 days remaining'; 
  */

  if (remainingBlocks === 'SPENT_AS_PANIC') {
    return (
      <>
        <View>
          <Label label={t('wallet.vault.unfreezeRequestLabel')} />
          <DateValue time={hotBlockTime} />
        </View>
        <View>
          <Label label={t('wallet.vault.rescueDateLabel')} />
          <DateValue time={rescueBlockTime} />
        </View>
        <View>
          <Label label={t('wallet.vault.rescueAddressLabel')} />
          <DateValue time={panicTxHex.extractAddress} />
        </View>
      </>
    );
  } else if (typeof remainingBlocks === 'number' && remainingBlocks > 0) {
    <>
      <View>
        <Label label={t('wallet.vault.unfreezeRequestLabel')} />
        <DateValue time={hotBlockTime} />
      </View>
      <View>
        <Label label={t('wallet.vault.frozenRemainingDateLabel')} />
        <DateValue
          time={tipBlockTime && tipBlockTime + 588 * remainingBlocks}
        />
      </View>
      ;
    </>;
  } else if (remainingBlocks === 0 /* || remainingBlocks === 'SPENT_AS_HOT'*/) {
    const isLoading = !triggerBlockTime || !hotBlockTime;
    return (
      <Text>
        <Trans
          i18nKey="wallet.vault.vaultIsHot"
          values={{
            requestDate: isLoading
              ? LOADING_TEXT
              : formatVaultDate(triggerBlockTime),
            time: isLoading ? LOADING_TEXT : formatVaultDate(hotBlockTime)
          }}
          components={{
            wrapper: (
              <Text
                className={`${isLoading ? 'animate-pulse bg-slate-200 rounded' : 'bg-transparent'}`}
              />
            )
          }}
        />
      </Text>
    );
  } else if (remainingBlocks === 0 || remainingBlocks === 'SPENT_AS_HOT') {
    text = t('wallet.vault.vaultIsHot', {
      requestDate: triggerBlockTime
        ? formatVaultDate(triggerBlockTime)
        : LOADING_TEXT,
      hotDate: formatVaultDate(hotBlockTime)
    });
  } else if (remainingBlocks === 'SPENT_AS_PANIC') {
    text = t('wallet.vault.rescued', {
      date: formatVaultDate(rescueBlockTime)
    });
  }
};

const Vault = ({
  btcFiat,
  blockchainTip,
  vault,
  vaultNumber,
  vaultStatus,
  esploraApi
}: {
  btcFiat: number | undefined;
  blockchainTip: number | undefined;
  vault: Vault;
  vaultNumber: number;
  vaultStatus: VaultStatus | undefined;
  esploraApi: string;
}) => {
  const [rescueBlockTime, setRescueBlockTime] = useState<number | undefined>(
    undefined
  );
  const [triggerBlockTime, setTriggerBlockTime] = useState<number | undefined>(
    undefined
  );
  const [hotBlockTime, setHotBlockTime] = useState<number | undefined>(
    undefined
  );
  const [tipBlockTime, setTipBlockTime] = useState<number | undefined>(
    undefined
  );
  const vaultStatusRef = useRef(vaultStatus);
  useEffect(() => {
    return () => {
      vaultStatusRef.current = undefined; //unset on unmount
    };
  }, []);
  useEffect(() => {
    vaultStatusRef.current = vaultStatus;
    const setBlockTimes = async () => {
      const { triggerTxBlockHeight, panicTxBlockHeight } = vaultStatus || {};
      try {
        if (blockchainTip) {
          const tipBlockTime = await fetchBlockTimestamp(
            esploraApi,
            blockchainTip
          );
          setTipBlockTime(tipBlockTime);
        }
        if (triggerTxBlockHeight) {
          const triggerBlockTime = await fetchBlockTimestamp(
            esploraApi,
            triggerTxBlockHeight
          );
          if (vaultStatus === vaultStatusRef.current)
            setTriggerBlockTime(triggerBlockTime);
          if (
            blockchainTip &&
            triggerTxBlockHeight + vault.lockBlocks <= blockchainTip
          ) {
            const hotBlockTime = await fetchBlockTimestamp(
              esploraApi,
              triggerTxBlockHeight + vault.lockBlocks
            );
            if (vaultStatus === vaultStatusRef.current)
              setHotBlockTime(hotBlockTime);
          }
        }
        if (panicTxBlockHeight) {
          const rescueBlockTime = await fetchBlockTimestamp(
            esploraApi,
            panicTxBlockHeight
          );
          if (vaultStatus === vaultStatusRef.current)
            setRescueBlockTime(rescueBlockTime);
        }
      } catch (error) {}
    };
    setBlockTimes();
  }, [esploraApi, vaultStatus, blockchainTip, vault.lockBlocks]);

  const { settings } = useSettings();
  const { t } = useTranslation();
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );

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
    blockchainTip &&
    vaultStatus &&
    getVaultFrozenBalance(vault, vaultStatus, blockchainTip);

  const remainingBlocks =
    blockchainTip &&
    vaultStatus &&
    getRemainingBlocks(vault, vaultStatus, blockchainTip);

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
                date: getVaultInitDate(vault, vaultStatus)
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
        <Details
          remainingBlocks={remainingBlocks}
          triggerBlockTime={triggerBlockTime}
          rescueBlockTime={rescueBlockTime}
          hotBlockTime={hotBlockTime}
          tipBlockTime={tipBlockTime}
        />
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
  blockchainTip,
  vaults,
  vaultsStatuses,
  esploraApi
}: {
  btcFiat: number | undefined;
  blockchainTip: number | undefined;
  vaults: VaultsType;
  vaultsStatuses: VaultsStatuses;
  esploraApi: string;
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
            blockchainTip={blockchainTip}
            vault={vault}
            esploraApi={esploraApi}
            vaultNumber={sortedVaults.length - index}
            vaultStatus={vaultStatus}
          />
        );
      })}
    </View>
  );
};

export default React.memo(Vaults);
