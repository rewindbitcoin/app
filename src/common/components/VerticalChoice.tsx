import React, { ReactNode, useCallback } from 'react';
import { Text, View, Pressable } from 'react-native';
import Divider from './Divider';
import AntDesign from '@expo/vector-icons/AntDesign';
import { cssInterop } from 'nativewind';

cssInterop(AntDesign, {
  className: {
    target: 'style',
    nativeStyleToProp: { color: true, fontSize: 'size' }
  }
});

const VerticalChoice = ({
  choices,
  index,
  onSelect
}: {
  choices: Array<string | ReactNode>;
  index?: number;
  onSelect: (index: number) => void;
}) => {
  const onPress = useCallback(
    (index: number) => () => onSelect(index),
    [onSelect]
  );

  const Check = (check: boolean) => (
    <View className="w-5">
      {check && <AntDesign className="!text-primary text-xl" name="check" />}
    </View>
  );

  return (
    <View className="flex-col">
      {choices.map((candidate: string | ReactNode, candidateIndex: number) => (
        <React.Fragment key={candidateIndex}>
          {typeof candidate === 'string' ? (
            <>
              <Pressable
                className="flex-row justify-between pr-2.5"
                onPress={onPress(candidateIndex)}
              >
                <Text>{candidate}</Text>
                {Check(index === candidateIndex)}
              </Pressable>
              {candidateIndex < choices.length - 1 && <Divider />}
            </>
          ) : (
            <>
              <Pressable
                className="flex-row justify-between py-2.5 pr-2.5"
                onPress={onPress(candidateIndex)}
              >
                <View className="w-7.5">{Check(index === candidateIndex)}</View>
                {candidate}
              </Pressable>
              <View className="pl-7.5">
                {candidateIndex < choices.length - 1 && <Divider />}
              </View>
            </>
          )}
        </React.Fragment>
      ))}
    </View>
  );
};

export default React.memo(VerticalChoice);
