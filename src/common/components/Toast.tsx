import React from 'react';

import { View } from 'react-native';
import {
  Toast,
  useToast,
  ToastProvider as ToastProviderOriginal
} from 'react-native-toast-notifications';
import { Text } from './Text';
import { Button } from './Button';
import type { ToastProps } from 'react-native-toast-notifications/lib/typescript/toast';

const defaultPlacement = 'top';

const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  //TODO: get rif of helpRenderer!?!? is this ever used?
  const helpRenderer = (toast: ToastProps) => (
    <View
      style={{
        maxWidth: 320,
        paddingHorizontal: 15,
        paddingVertical: 10,
        backgroundColor: '#fff',
        marginVertical: 4,
        borderRadius: 8,
        borderLeftColor: '#00C851',
        //borderColor: 'red',
        //borderWidth: 1,
        borderLeftWidth: 6,
        justifyContent: 'center',
        paddingLeft: 16,

        // Shadow for iOs and Web:
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,

        // Elevation for Android
        elevation: 5
      }}
    >
      <Text
        style={{
          fontSize: 14,
          color: '#333',
          fontWeight: 'bold'
        }}
      >
        {toast.data.title}
      </Text>
      <Text style={{ color: '#a3a3a3', marginTop: 2 }}>{toast.message}</Text>
      <Button onPress={() => toast.onHide()}>Close</Button>
    </View>
  ); //TODO: translate "Close" above, however, the helpRenderer is not being used
  //never in the code?

  return (
    <ToastProviderOriginal
      duration={6000}
      placement={defaultPlacement}
      offsetBottom={30}
      renderType={{ help: helpRenderer }}
      textStyle={{
        maxWidth:
          '100%' /*solves an issue with long words in text which were not beig correctly broken*/
      }}
    >
      {children}
    </ToastProviderOriginal>
  );
};
export { Toast, ToastProvider, useToast };
