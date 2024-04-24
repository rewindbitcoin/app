import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Svg, Path } from 'react-native-svg';
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
        className="native:text-base web:text-xs web:sm:text-base fill-none stroke-white stroke-2 w-5 h-5"
        viewBox="0 0 24 24"
      >
        {type === 'RECEIVE' ? (
          <Path d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
        ) : type === 'SEND' ? (
          <Path d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
        ) : (
          <>
            <Path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <Path d="M14 21v-5.5l4.5 2.5" />
            <Path d="M10 21v-5.5l-4.5 2.5" />
            <Path d="M3.5 14.5l4.5 -2.5l-4.5 -2.5" />
            <Path d="M20.5 9.5l-4.5 2.5l4.5 2.5" />
            <Path d="M10 3v5.5l-4.5 -2.5" />
            <Path d="M14 3v5.5l4.5 -2.5" />
            <Path d="M12 11l1 1l-1 1l-1 -1z" />
          </>
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
  const elCount =
    (handleReceive ? 1 : 0) + (handleSend ? 1 : 0) + (handleFreeze ? 1 : 0);
  return (
    <View
      className={`self-center bottom-8 max-w-2xl px-4 w-full z-10 fixed native:absolute flex-row ${elCount === 1 ? 'justify-center' : elCount === 2 ? 'justify-evenly' : 'justify-between'}`}
    >
      {handleReceive && <Button type="RECEIVE" onPress={handleReceive} />}
      {handleSend && <Button type="SEND" onPress={handleSend} />}
      {handleFreeze && <Button type="FREEZE" onPress={handleFreeze} />}
    </View>
  );
};

export default React.memo(WalletButtons);
