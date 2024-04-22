import type {
  CompositeNavigationProp,
  NavigationProp
} from '@react-navigation/native';
import {
  createNativeStackNavigator,
  NativeStackNavigationProp,
  NativeStackNavigationOptions
} from '@react-navigation/native-stack';
import {
  createStackNavigator,
  StackNavigationProp,
  StackNavigationOptions
} from '@react-navigation/stack';
import { Platform } from 'react-native';
export const SETTINGS = 'SETTINGS' as const;
export const WALLETS = 'WALLETS' as const;
export const WALLET_HOME = 'WALLET_HOME' as const;
export const SETUP_VAULT = 'SETUP_VAULT' as const;
export const CREATE_VAULT = 'CREATE_VAULT' as const;
export const NEW_WALLET = 'NEW_WALLET' as const;
// https://reactnavigation.org/docs/typescript/
export type RootStackParamList = {
  SETTINGS: undefined;
  WALLET_HOME: { walletId: number };
  WALLETS: undefined;
  SETUP_VAULT: undefined;
  CREATE_VAULT: undefined;
  NEW_WALLET: { walletId: number };
};

// https://reactnavigation.org/docs/typescript/#specifying-default-types-for-usenavigation-link-ref-etc
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

export const isNativeStack = Platform.OS !== 'web';
export const createRootStack = () =>
  isNativeStack
    ? createNativeStackNavigator<RootStackParamList>()
    : createStackNavigator<RootStackParamList>();

type UniversalNavigationProps<T extends keyof RootStackParamList> =
  | NativeStackNavigationProp<RootStackParamList, T>
  | StackNavigationProp<RootStackParamList, T>;

export type NavigationPropsByScreenId = {
  [K in keyof RootStackParamList]: CompositeNavigationProp<
    UniversalNavigationProps<K>,
    NavigationProp<RootStackParamList>
  >;
};

export type UniversalNavigationOptions = NativeStackNavigationOptions &
  StackNavigationOptions;

//How correcly type useNavigation<>():

//1)
//export type NewWalletNavigationProps = CompositeNavigationProp<
//  UniversalNavigationProps<'NEW_WALLET'>,
//  NavigationProp<RootStackParamList>
//>;
//const navigation = useNavigation<NewWalletNavigationProps>();

//or 2)
//const navigation = useNavigation<NavigationPropsByScreenId['NEW_WALLET']>();
