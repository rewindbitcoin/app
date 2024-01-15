import React from 'react';

import { Platform, View } from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';
import Toast, {
  useToast,
  ToastProvider as ToastProviderOriginal
} from 'react-native-toast-notifications';
import { Text, Button } from './ui';
import type { ToastProps } from 'react-native-toast-notifications/lib/typescript/toast';

const defaultPlacement = 'top';

const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  let headerHeight: number | undefined = undefined;

  try {
    //useHeaderHeight will throw when this ToastProvider is rendered on the root
    //of the App. This is because it's not within a screen (with header).
    //
    //However, this provider is also used with Modals (for example ImportWalletScreen).
    //When the provider is set within a modal, then we retrieve the header:
    headerHeight = useHeaderHeight();
  } catch (err) {}

  const helpRenderer = (toast: ToastProps) => (
    <View
      style={{
        maxWidth: 330,
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
        shadowOffset: { width: 50, height: 50 },
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
  );
  //in react-native-web, when using modals, the Toast is hidden below the Screen
  //header. Thus, move it a bit below the header.
  //So, just skip the header altogether when in web && when placement is top:
  const setOffsetTop =
    defaultPlacement === 'top' &&
    Platform.OS === 'web' &&
    headerHeight !== undefined;
  return (
    <ToastProviderOriginal
      placement={defaultPlacement}
      {...(setOffsetTop ? { offsetTop: headerHeight! } : {})}
      offsetBottom={30}
      renderType={{ help: helpRenderer }}
    >
      {children}
    </ToastProviderOriginal>
  );
};
export { Toast, ToastProvider, useToast };
