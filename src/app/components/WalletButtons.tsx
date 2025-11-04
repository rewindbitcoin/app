// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import React from 'react';
import FreezeIcon from './FreezeIcon';
import ReceiveIcon from './ReceiveIcon';
import SendIcon from './SendIcon';
import { View, Text, Pressable, LayoutChangeEvent } from 'react-native';
import { Svg } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

const Button = ({
  onPress,
  type
}: {
  onPress: () => void;
  type: 'SEND' | 'RECEIVE' | 'FREEZE';
}) => {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      className={
        'py-2.5 pl-2.5 pr-3.5 mobmed:py-4 mobmed:pl-4 mobmed:pr-5 bg-primary rounded-full hover:opacity-90 active:scale-95 active:opacity-90 shadow flex-row gap-1 justify-center items-center'
      }
    >
      <Svg
        className={`native:text-base web:text-xs web:sm:text-base stroke-white stroke-2 w-5 h-5 ${type === 'SEND' ? '-rotate-45' : ''} ${type === 'FREEZE' ? 'fill-white' : 'fill-none'}`}
        viewBox="0 0 24 24"
      >
        {type === 'RECEIVE' ? (
          <ReceiveIcon />
        ) : type === 'SEND' ? (
          <SendIcon />
        ) : (
          <FreezeIcon />
        )}
      </Svg>
      <Text
        className={
          'native:text-base web:text-xs web:mobmed:text-sm web:sm:text-base text-center text-white font-semibold pl-1'
        }
      >
        {type === 'RECEIVE'
          ? t('wallet.receive')
          : type === 'SEND'
            ? t('wallet.send')
            : t('wallet.freeze')}
      </Text>
    </Pressable>
  );
};

const WalletButtons = ({
  handleReceive,
  handleSend,
  handleFreeze,
  onLayout
}: {
  handleReceive?: (() => void) | undefined;
  handleSend?: (() => void) | undefined;
  handleFreeze?: (() => void) | undefined;
  onLayout?: (e: LayoutChangeEvent) => void;
}) => {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{ marginBottom: insets.bottom }}
      className="self-center bottom-8 max-w-screen-sm px-2 moblg:px-4 w-full z-10 fixed native:absolute"
      onLayout={onLayout}
    >
      {/* Center-aligned container with flex-wrap */}
      <View className="flex-row flex-wrap justify-center gap-2 sm:gap-4">
        {handleReceive && <Button type="RECEIVE" onPress={handleReceive} />}
        {handleSend && <Button type="SEND" onPress={handleSend} />}
        {handleFreeze && <Button type="FREEZE" onPress={handleFreeze} />}
      </View>
    </View>
  );
};

export default React.memo(WalletButtons);
