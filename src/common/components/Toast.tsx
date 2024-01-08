//import React from 'react';

import Toast, {
  useToast,
  ToastProvider as ToastProviderOriginal
} from 'react-native-toast-notifications';

const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => <ToastProviderOriginal placement="top">{children}</ToastProviderOriginal>;
export { Toast, ToastProvider, useToast };
