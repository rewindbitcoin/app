import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createStackNavigator } from '@react-navigation/stack';
import { Platform } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { StackScreenProps } from '@react-navigation/stack';
export const SETTINGS = 'SETTINGS' as const;
export const WALLETS = 'WALLETS' as const;
export const WALLET_HOME = 'WALLET_HOME' as const;
export const SETUP_VAULT = 'SETUP_VAULT' as const;
export const CREATE_VAULT = 'CREATE_VAULT' as const;
export const NEW_WALLET = 'NEW_WALLET' as const;
// https://reactnavigation.org/docs/typescript/
export type RootStackParamList = {
  SETTINGS: undefined;
  WALLET_HOME: undefined;
  WALLETS: undefined;
  SETUP_VAULT: undefined;
  CREATE_VAULT: undefined;
  NEW_WALLET: undefined;
};
export type ScreenProps =
  | NativeStackScreenProps<RootStackParamList>
  | StackScreenProps<RootStackParamList>;

// https://reactnavigation.org/docs/typescript/#specifying-default-types-for-usenavigation-link-ref-etc
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

export const isNativeStack = Platform.OS === 'ios' || Platform.OS === 'android';
export const createRootStack = () =>
  isNativeStack
    ? createNativeStackNavigator<RootStackParamList>()
    : createStackNavigator<RootStackParamList>();
