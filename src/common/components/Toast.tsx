//import React from 'react';

import Toast, { ToastOptions } from 'react-native-toast-notifications';
export { Toast };

const show = (
  toastRef: React.RefObject<Toast>,
  message: string | JSX.Element,
  toastOptions?: ToastOptions
) => {
  return toastRef.current?.show(message, { placement: 'top', ...toastOptions });
};
export { show };

const update = (
  toastRef: React.RefObject<Toast>,
  id: string,
  message: string | JSX.Element,
  toastOptions?: ToastOptions
) => {
  toastRef.current?.update(id, message, { placement: 'top', ...toastOptions });
};
export { update };
/*
    swipeEnabled={true}
    successColor="green"
    dangerColor="red"
    warningColor="orange"
    normalColor="gray"
*/
//const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => (
//  <ToastProviderOriginal placement="top">{children}</ToastProviderOriginal>
//);

//import React, { ReactNode, ForwardRefRenderFunction } from 'react';
//import Toast, { useToast, Toast } from 'react-native-toast-notifications';
//
//interface ToastProviderProps {
//  children: ReactNode;
//}
//
//const ToastProvider: ForwardRefRenderFunction<unknown, ToastProviderProps> = (
//  { children },
//  ref
//) => (
//  <>
//    {' '}
//    {children} <Toast ref={ref} />
//  </>
//);
//
//export { ToastProvider, Toast, useToast };
//

//export function withToast<T extends React.ComponentProps<React.ComponentType>>(
//  Component: React.ComponentType<T>
//) {
//  const toastRef = useRef<Toast>(null);
//
//  return (props: T) => (
//    <>
//      <Component {...props} toastRef />
//      <Toast ref={toastRef} />
//    </>
//  );
//}
