import React from 'react';
import { ActivityIndicator as RNAI } from 'react-native';
import { useTheme } from '../theme';
const ActivityIndicator = ({
  size = 'small'
}: {
  size?: 'large' | 'small';
}) => {
  const theme = useTheme();
  return <RNAI size={size} color={theme.colors.primary} />;
};
export default ActivityIndicator;
