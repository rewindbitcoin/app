// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import SkeletonPulse from '../../SkeletonPulse';
import { useLocalization } from '../../../hooks/useLocalization';
import { formatBalance } from '../../../lib/format';
import type { SubUnit } from '../../../lib/settings';

const LOADING_TEXT = '     ';

const VaultBalance = ({
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
        <SkeletonPulse active={satsBalance === undefined}>
          <Text className={`text-black native:text-xl web:text-lg font-bold`}>
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
        </SkeletonPulse>
        {isConfirming ? (
          <Text className="text-slate-500 native:text-sm web:text-xs">
            {`  •  ${t('wallet.vault.confirming')}…`}
          </Text>
        ) : null}
      </View>
    </>
  );
};

export default VaultBalance;
