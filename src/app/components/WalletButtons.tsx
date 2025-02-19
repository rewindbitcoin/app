import React, { useState, useRef } from 'react';
import FreezeIcon from './FreezeIcon';
import ReceiveIcon from './ReceiveIcon';
import SendIcon from './SendIcon';
import { View, Text, Pressable } from 'react-native';
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
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      style={{ marginBottom: insets.bottom }}
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
  handleFreeze
}: {
  handleReceive?: (() => void) | undefined;
  handleSend?: (() => void) | undefined;
  handleFreeze?: (() => void) | undefined;
}) => {
  const [buttonHeight, setButtonHeight] = useState(0);
  const [isMultiRow, setIsMultiRow] = useState(false);
  console.log('WalletButtons', { buttonHeight, isMultiRow });
  const elCount =
    (handleReceive ? 1 : 0) + (handleSend ? 1 : 0) + (handleFreeze ? 1 : 0);
  return (
    <View
      className={`self-center bottom-8 max-w-2xl px-2 moblg:px-4 w-full z-10 fixed native:absolute flex-wrap flex-row gap-4 ${isMultiRow ? 'justify-center' : elCount === 1 ? 'justify-center' : elCount === 2 ? 'justify-evenly' : 'justify-between'}`}
      onLayout={e => {
        const height = e.nativeEvent.layout.height;
        if (buttonHeight > 0) {
          setIsMultiRow(height > buttonHeight * 1.2);
        }
      }}
    >
      {handleReceive && (
        <Button
          type="RECEIVE"
          onPress={handleReceive}
          onLayout={e => {
            console.log('button height', e);
            if (!buttonHeight) {
              setButtonHeight(e.nativeEvent.layout.height);
            }
          }}
        />
      )}
      {handleSend && <Button type="SEND" onPress={handleSend} />}
      {handleFreeze && <Button type="FREEZE" onPress={handleFreeze} />}
    </View>
  );
};

export default React.memo(WalletButtons);
