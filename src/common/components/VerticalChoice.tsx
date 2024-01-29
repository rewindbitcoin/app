import React, { ReactNode, useCallback } from 'react';
import { View, Pressable } from 'react-native';
import Divider from './Divider';
import { Text } from './Text';
import AntDesign from '@expo/vector-icons/AntDesign';
import { useTheme } from '../theme';

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
  const theme = useTheme();

  const Check = (check: boolean) => (
    <View style={{ width: 20 }}>
      {check && (
        <AntDesign
          style={{
            color: theme.colors.primary,
            fontSize: 20
          }}
          name="check"
        />
      )}
    </View>
  );

  return (
    <View style={{ flexDirection: 'column' }}>
      {choices.map((candidate: string | ReactNode, candidateIndex: number) => (
        <React.Fragment key={candidateIndex}>
          {typeof candidate === 'string' ? (
            <>
              <Pressable
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingRight: 10
                }}
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
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingVertical: 10,
                  paddingRight: 10
                }}
                onPress={onPress(candidateIndex)}
              >
                <View style={{ width: 30 }}>
                  {Check(index === candidateIndex)}
                </View>
                {candidate}
              </Pressable>
              <View style={{ paddingLeft: 30 }}>
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
