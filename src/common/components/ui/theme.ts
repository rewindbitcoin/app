import { DefaultTheme } from '@react-navigation/native';
//    https://reactnavigation.org/docs/themes/

const theme = {
  ...DefaultTheme,
  colors: {
    cardSecondary: '#555', //for titles and icons
    darkerBackground: '#e5e5e5',
    darkerOverDarkerBackground: '#d5d5d5',
    ...DefaultTheme.colors,
    white: 'white',
    red: 'red',
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
