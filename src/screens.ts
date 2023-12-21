//import type { NativeStackScreenProps } from '@react-navigation/native-stack';
//import type { StackScreenProps } from '@react-navigation/stack';
export const HOME = 'HOME' as const; // Doing this, typeof HOME === 'HOME' and not 'string'
export const SETTINGS = 'SETTINGS' as const;
export const WALLETS = 'WALLETS' as const;
export const WALLET_HOME = 'WALLET_HOME' as const;
// https://reactnavigation.org/docs/typescript/
export type RootStackParamList = {
  HOME: undefined;
  SETTINGS: undefined;
  WALLET_HOME: undefined;
  WALLETS: undefined;
};
// https://reactnavigation.org/docs/typescript/#specifying-default-types-for-usenavigation-link-ref-etc
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
