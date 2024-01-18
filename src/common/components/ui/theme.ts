import { DefaultTheme } from '@react-navigation/native';

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    listsSecondary: 'gray',
    white: 'white',
    listsSeparator: '#D0D0D0'
  }
};
export type Theme = typeof theme;
//This is not a hook but may be converted into one in the future (if we want
//to be able to change theme live Dark->Light->Dark). So just call it "useTheme"
//use
export const useTheme = () => {
  return theme;
};
