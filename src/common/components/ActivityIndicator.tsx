//import React from 'react';
//import { ActivityIndicator as RNAI } from 'react-native';
//import { useTheme } from '../theme';
//
//const ActivityIndicator = ({
//  size = 'small'
//}: {
//  size?: 'large' | 'small';
//}) => {
//  const theme = useTheme();
//  return <RNAI size={size} color={theme.colors.primary} />;
//};
//
//export default ActivityIndicator;

import React from 'react';
import { View } from 'react-native';
import { Svg, Path, Circle } from 'react-native-svg';
const ActivityIndicator = ({
  size = 'small'
}: {
  size?: 'large' | 'small';
}) => {
  return (
    //See the View container style of the native ActivityIndicator component.
    //Also the sizes:
    //https://github.com/facebook/react-native/blob/19971092b6fe3ff0d2f1e7666d6adb8018ab68a9/packages/react-native/Libraries/Components/ActivityIndicator/ActivityIndicator.js#L162
    <View className="items-center justify-center">
      <Svg
        className={`animate-spin text-primary`}
        width={size === 'small' ? 20 : 36}
        height={size === 'small' ? 20 : 36}
        fill="none"
        viewBox="0 0 24 24"
      >
        <Circle
          opacity={0.25}
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        ></Circle>
        <Path
          opacity={0.75}
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        ></Path>
      </Svg>
    </View>
  );
};

export default ActivityIndicator;
