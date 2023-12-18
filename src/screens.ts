import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { StackScreenProps } from '@react-navigation/stack';
export const HOME = 'HOME' as const; // Doing this, typeof HOME === 'HOME' and not 'string'
export const SETTINGS = 'SETTINGS' as const;
// https://reactnavigation.org/docs/typescript/
export type RootStackParamList = { HOME: undefined; SETTINGS: undefined };
export type Props =
  | NativeStackScreenProps<RootStackParamList, typeof SETTINGS>
  | StackScreenProps<RootStackParamList, typeof SETTINGS>;
