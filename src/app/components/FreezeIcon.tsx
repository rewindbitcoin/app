import React from 'react';
import { Path } from 'react-native-svg';
const FreezeIcon = () => (
  <>
    <Path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <Path d="M14 21v-5.5l4.5 2.5" />
    <Path d="M10 21v-5.5l-4.5 2.5" />
    <Path d="M3.5 14.5l4.5 -2.5l-4.5 -2.5" />
    <Path d="M20.5 9.5l-4.5 2.5l4.5 2.5" />
    <Path d="M10 3v5.5l-4.5 -2.5" />
    <Path d="M14 3v5.5l4.5 -2.5" />
    <Path d="M12 11l1 1l-1 1l-1 -1z" />
  </>
);

export default FreezeIcon;
