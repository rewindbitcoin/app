import React from 'react';
import { useTheme } from '../theme';
import { View } from 'react-native';
import { styled } from 'nativewind';

const StyledView = styled(View);

export default function Divider({ className }: { className?: string }) {
  const theme = useTheme();
  return (
    <StyledView
      className={`h-[1px] w-full ${className || ''}`}
      style={{
        backgroundColor: theme.colors.listsSeparator
      }}
    />
  );
}
