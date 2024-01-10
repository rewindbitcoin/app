import React from 'react';

import { Platform } from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';
import Toast, {
  useToast,
  ToastProvider as ToastProviderOriginal
} from 'react-native-toast-notifications';

const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const placement = 'top';
  let headerHeight: number | undefined = undefined;

  try {
    //useHeaderHeight will throw when this ToastProvider is rendered on the root
    //of the App. This is because it's not within a screen (with header).
    //
    //However, this provider is also used with Modals (for example ImportWalletScreen).
    //When the provider is set within a modal, then we retrieve the header:
    headerHeight = useHeaderHeight();
  } catch (err) {}

  //in react-native-web, when using modals, the Toast is hidden below the Screen
  //header. Thus, move it a bit below the header.
  //So, just skip the header altogether when in web && when placement is top:
  const setOffsetTop =
    placement === 'top' && Platform.OS === 'web' && headerHeight !== undefined;
  return (
    <ToastProviderOriginal
      placement={placement}
      {...(setOffsetTop ? { offsetTop: headerHeight! } : {})}
    >
      {children}
    </ToastProviderOriginal>
  );
};
export { Toast, ToastProvider, useToast };
