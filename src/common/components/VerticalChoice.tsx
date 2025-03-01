import React, { ReactNode, useCallback } from 'react';
import { Text, View, Pressable } from 'react-native';
import Divider from './Divider';
import Octicons from '@expo/vector-icons/Octicons';
import { cssInterop } from 'nativewind';

cssInterop(Octicons, {
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
    <View className="w-8 pr-2">
      {check ? (
        //Text tag needed for correct vertically-aligned rendering in iOS/Android
        <Text>
          <Octicons
            className="!text-primary text-base"
            name="check-circle-fill"
          />
        </Text>
      ) : (
        //Text tag needed for correct vertically-aligned rendering in iOS/Android
        <Text>
          <Octicons className="!text-primary text-base" name="circle" />
        </Text>
      )}
    </View>
  );

  return (
    <View className="flex-col gap-4">
      {choices.map((candidate: string | ReactNode, candidateIndex: number) => (
        <React.Fragment key={candidateIndex}>
          {typeof candidate === 'string' ? (
            <>
              <Pressable
                className="flex-row justify-between"
                onPress={onPress(candidateIndex)}
              >
                {Check(index === candidateIndex)}
                <Text className="text-base">{candidate}</Text>
              </Pressable>
              {candidateIndex < choices.length - 1 && <Divider />}
            </>
          ) : (
            <>
              <Pressable
                className="flex-row justify-between"
                onPress={onPress(candidateIndex)}
              >
                <View className="w-8">{Check(index === candidateIndex)}</View>
                {candidate}
              </Pressable>
              <View className="pl-8">
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
