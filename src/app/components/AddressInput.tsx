import { BarcodeType, CameraView, useCameraPermissions } from 'expo-camera';
import { Camera } from 'expo-camera/legacy';
import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef
} from 'react';
import {
  Text,
  View,
  AppState,
  Platform,
  LayoutChangeEvent
} from 'react-native';
import { batchedUpdates } from '~/common/lib/batchedUpdates';
import {
  TextInput,
  IconButton,
  InfoButton,
  ActivityIndicator,
  Modal,
  Button
} from '../../common/ui';
import { useTranslation } from 'react-i18next';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { validateAddress } from '../lib/vaults';
import { networkMapping, type NetworkId } from '../lib/network';
import { useFonts } from 'expo-font';
import { RobotoMono_400Regular } from '@expo-google-fonts/roboto-mono';
import CreateColdAddress from './CreateColdAddress';

function AddressInput({
  onValueChange,
  initialValue,
  networkId,
  type = 'external'
}: {
  onValueChange: (value: string | null) => void;
  initialValue?: string;
  networkId: NetworkId;
  type: 'external' | 'emergency';
}) {
  const capitalizedNetworkId =
    networkId.charAt(0).toUpperCase() + networkId.slice(1).toLowerCase();
  const network = networkMapping[networkId];
  const [address, setAddress] = useState<string>(initialValue || '');
  const [scanQR, setScanQR] = useState<boolean>(false);
  const [camAvailable, setCamAvailable] = useState<boolean>(false);
  const [camFacing, setCamFacing] = useState<'back' | 'front' | null>(null);
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [camTypes, setCamTypes] = useState<Array<'back' | 'front'> | null>(
    null
  );
  const [coldAddressHelp, setColdAddressHelp] = useState<boolean>(false);
  const showColdAddressHelp = useCallback(() => setColdAddressHelp(true), []);
  const hideColdAddressHelp = useCallback(() => setColdAddressHelp(false), []);

  //https://github.com/expo/expo/issues/28069#issuecomment-2112876966
  const [camPermissionGrantedDelay, setCamPermissionGrantedDelay] =
    useState(false);

  const [robotoLoaded] = useFonts({
    RobotoMono400Regular: RobotoMono_400Regular
  });

  // Fix for Android placeholder text breaking into multiple lines after text deletion
  // See: https://github.com/facebook/react-native/issues/30666#issuecomment-2681501484
  const [inputWidth, setInputWidth] = useState<number | undefined>();
  // Memoize the entire style object for the TextInput to prevent unnecessary re-renders.
  // This includes the base flicker fix (lineHeight: undefined) and the conditional
  // Android width fix.
  // Background on thee flicker fix:
  // NativeWind's `text-base` sets a lineHeight, which causes a subtle jump/flicker
  // on each keystroke in TextInput. This is a known React Native quirk.
  // Setting lineHeight to `undefined` prevents layout recalculations while typing.
  const textInputStyle = useMemo(() => {
    const baseStyle = { lineHeight: undefined }; // Flicker fix
    const androidWidthStyle =
      Platform.OS === 'android' && inputWidth && address === ''
        ? { width: inputWidth }
        : {};
    return [baseStyle, androidWidthStyle];
  }, [inputWidth, address]);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handleInputLayout = useCallback(
    (e: LayoutChangeEvent) => {
      if (inputWidth !== undefined) return;
      //if (address !== '') return;
      // e.persist() is not available in React for web
      if (e.persist) e.persist();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      //android may call onLayout before the layout is complete...
      //then it calls it again...
      //so just wait for 300ms to be sure its been rendered
      timeoutRef.current = setTimeout(() => {
        const { width } = e.nativeEvent.layout;
        setInputWidth(prev => (prev === width ? prev : Math.floor(width - 1)));
      }, 300);
    },
    [inputWidth]
  );

  useEffect(() => {
    const checkCameras = async () => {
      if (Platform.OS !== 'web' || (await CameraView.isAvailableAsync())) {
        setCamAvailable(true);
      }
    };
    checkCameras();
  }, []);
  useEffect(() => {
    const prepareCameras = async () => {
      const camTypes =
        Platform.OS === 'web'
          ? await Camera.getAvailableCameraTypesAsync()
          : (['back', 'front'] as Array<'back' | 'front'>);

      if (camTypes.length) {
        batchedUpdates(() => {
          setCamTypes(camTypes);
          const camFacing = camTypes.length === 1 ? camTypes[0]! : 'back';
          setCamFacing(camFacing);
        });
        //https://github.com/expo/expo/issues/28069#issuecomment-2112876966
        setTimeout(() => setCamPermissionGrantedDelay(true), 2000);
      }
    };
    if (camAvailable && camPermission?.granted) prepareCameras();
  }, [camAvailable, camPermission?.granted]);

  const { t } = useTranslation();
  const [showCreateColdAddress, setShowCreateColdAddress] =
    useState<boolean>(false);
  const handleNewAddress = useCallback(
    () => setShowCreateColdAddress(true),
    []
  );
  const handleScanQR = useCallback(() => setScanQR(true), []);
  const handleCloseScanQR = useCallback(() => setScanQR(false), []);

  //Close the camera when the app looses focus (prevents crashes in iOS)
  //https://github.com/expo/expo/pull/28911#issuecomment-2114706008
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (
        nextAppState.match(/inactive|background/) &&
        //If not granted yet, then no need to close (this is when we show the grant permission pop-up, not the camera):
        camPermission?.granted === true
      )
        handleCloseScanQR();
    });
    return () => subscription.remove();
  }, [handleCloseScanQR, camPermission?.granted]);
  const handleCloseNewAddress = useCallback(
    () => setShowCreateColdAddress(false),
    []
  );

  //const onAddress = useCallback(
  //  (address: string) => {
  //    setAddress(address);
  //    onValueChange(validateAddress(address, network) ? address : null);
  //    setShowCreateColdAddress(false);
  //  },
  //  [onValueChange, network]
  //);
  const onAddress = useCallback(
    (qrResult: string) => {
      // Regular expression to match Bitcoin:
      // https://github.com/bitcoin/bips/blob/master/bip-0021.mediawiki#simpler-syntax
      const regex =
        /^([bB][iI][tT][cC][oO][iI][nN]:)?([a-zA-Z0-9]+)(\?[\s\S]*)?$/;
      let address = qrResult; // Default to using the full result as address

      // Extract address if it matches Bitcoin URI scheme
      const match = qrResult.match(regex);
      if (match && match[2]) {
        address = match[2]; // The actual address part after 'bitcoin:'
      }

      // Set the address whether it's valid or not
      setAddress(address);

      // Validate the extracted address and update the state accordingly
      onValueChange(validateAddress(address, network) ? address : null);

      // Hide QR scanner or any related UI component
      setShowCreateColdAddress(false);
    },
    [setAddress, onValueChange, network, setShowCreateColdAddress]
  );

  const onBarcodeScanned = useCallback(
    ({ data }: { data: string }) => {
      setScanQR(false);
      onAddress(data);
    },
    [onAddress]
  );
  const onBarCodeScanned = useCallback(
    ({
      nativeEvent
    }: {
      nativeEvent: {
        data: string;
      };
    }) => {
      setScanQR(false);
      onAddress(nativeEvent.data);
    },
    [onAddress]
  );

  const toggleCameraFacing = useCallback(() => {
    setCamFacing(current => (current === 'back' ? 'front' : 'back'));
  }, []);

  //https://github.com/expo/expo/issues/27934#issuecomment-2111797240
  //Note, the above was true on version 15.0.9. I've updated expo-camera
  //since then and web must be re-tested
  const cameraViewProps = useMemo(() => {
    if (!camFacing) return {};
    else
      return Platform.select({
        native: {
          mute: true,
          videoQuality: '1080p',
          facing: camFacing,
          onBarcodeScanned: onBarcodeScanned,
          barcodeScannerSettings: {
            barcodeTypes: ['qr' as BarcodeType]
          }
        },
        web: {
          mute: true,
          videoQuality: '1080p',
          type: camFacing,
          onBarCodeScanned: onBarCodeScanned,
          barCodeScannerSettings: {
            barCodeTypes: ['qr'],
            interval: 500
          }
        }
      });
  }, [camFacing, onBarcodeScanned, onBarCodeScanned]);

  return (
    <View>
      <View className="pb-2 flex-row items-center">
        <Text className="px-2 text-left font-medium text-card-secondary text-sm uppercase">
          {type === 'emergency'
            ? t('addressInput.coldAddress.label')
            : t('addressInput.recipientAddress.label')}
        </Text>
        {type === 'emergency' && <InfoButton onPress={showColdAddressHelp} />}
      </View>
      <View className="py-1 pr-2 p-2 mobmed:pl-4 bg-white rounded-md">
        <View className="flex-row items-center">
          <TextInput
            enablesReturnKeyAutomatically
            placeholder={
              type === 'emergency'
                ? t('addressInput.coldAddress.textInputPlaceholderWithCreate')
                : t('addressInput.recipientAddress.textInputPlaceholder')
            }
            placeholderTextColor="#A9A9A9"
            autoComplete="off"
            spellCheck={false}
            autoCorrect={false}
            autoCapitalize="none"
            maxLength={100}
            onChangeText={onAddress}
            value={address}
            className={`w-full ios:mb-1 native:text-base web:text-xs web:mobmed:text-sm web:sm:text-base overflow-hidden web:outline-none border-none p-2 pl-0 border-md tracking-normal ${robotoLoaded ? "font-['RobotoMono400Regular']" : ''} ${Platform.OS === 'android' && inputWidth && address === '' ? '' : 'flex-1'}`}
            onLayout={handleInputLayout}
            style={textInputStyle}
          />
          {type === 'emergency' && (
            <View className="py-1">
              <IconButton
                size={16}
                text={t('addressInput.createNewButton')}
                onPress={handleNewAddress}
                iconFamily="MaterialCommunityIcons"
                iconName="wallet-plus-outline"
              />
            </View>
          )}
          {camAvailable && (
            <View className={`py-1 ${type === 'emergency' ? 'pl-4' : ''}`}>
              <IconButton
                size={16}
                text={t('addressInput.scan')}
                onPress={handleScanQR}
                iconFamily="MaterialCommunityIcons"
                iconName="qrcode-scan"
              />
            </View>
          )}
        </View>
        {address !== '' && !validateAddress(address, network) && (
          <Text
            className={`${robotoLoaded ? "font-['RobotoMono400Regular']" : ''}`}
            style={{ fontSize: 14, color: 'red' }}
          >
            {t('addressInput.invalidAddress', {
              network: capitalizedNetworkId
            })}
          </Text>
        )}
      </View>
      <CreateColdAddress
        networkId={networkId}
        isVisible={showCreateColdAddress}
        onAddress={onAddress}
        onClose={handleCloseNewAddress}
      />
      <Modal
        title={t('addressInput.scanQRModalTitle')}
        isVisible={scanQR}
        icon={{
          family: 'MaterialCommunityIcons',
          name: 'qrcode-scan'
        }}
        onClose={handleCloseScanQR}
        customButtons={
          <View className="items-center gap-6 gap-y-4 flex-row flex-wrap justify-center mb-4">
            <Button mode="secondary" onPress={handleCloseScanQR}>
              {t('cancelButton')}
            </Button>
            {camTypes !== null && camTypes.length > 1 && (
              <Button onPress={toggleCameraFacing}>
                <View className="flex-row items-center">
                  <MaterialCommunityIcons
                    name="camera-flip-outline"
                    className="text-white text-xl -my-4 pr-2"
                  />
                  <Text className="text-center native:text-sm font-semibold text-white web:text-xs web:sm:text-sm select-none">
                    {t('addressInput.flipCam')}
                  </Text>
                </View>
              </Button>
            )}
          </View>
        }
      >
        {!camPermission?.canAskAgain ? (
          <View className="p-8">
            <Text className="text-base">
              {t('addressInput.cameraPermissionDenied')}
            </Text>
          </View>
        ) : !camPermission?.granted ? (
          <View className="gap-4 p-8">
            <Text className="text-slate-600 text-base pb-4">
              {t('addressInput.requestPermissionRationale')}
            </Text>
            <Button onPress={requestCamPermission}>
              {t('addressInput.triggerNativeRequestPermissionButton')}
            </Button>
          </View>
        ) : !camPermissionGrantedDelay ? (
          <View className="p-12">
            <ActivityIndicator />
          </View>
        ) : (
          <View className="gap-4 px-2 items-center">
            <Text>{t('addressInput.scanQRCall2Action')}</Text>
            <View
              className="h-40 w-72 self-center android:my-8" /*The extra margin on bottom on android is to avoid this problem: https://github.com/expo/expo/issues/30684#issuecomment-2379539652 (fails on Samsung)- the extra on top my-8 is so that this looks symetrical*/
            >
              <CameraView style={{ flex: 1 }} {...cameraViewProps} />
            </View>
          </View>
        )}
      </Modal>
      <Modal
        title={t('addressInput.coldAddress.helpTitle')}
        icon={{ family: 'FontAwesome6', name: 'shield-halved' }}
        isVisible={coldAddressHelp}
        onClose={hideColdAddressHelp}
        closeButtonText={t('understoodButton')}
      >
        <Text className="text-base pl-2 pr-2 text-slate-600">
          {t('addressInput.coldAddress.helpText')}
        </Text>
      </Modal>
    </View>
  );
}

export default React.memo(AddressInput);
