import { BarcodeType, CameraView, useCameraPermissions } from 'expo-camera';
import { Camera } from 'expo-camera/legacy';
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, AppState, Platform } from 'react-native';
import { batchedUpdates } from '~/common/lib/batchedUpdates';
import {
  TextInput,
  Text,
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
  networkId,
  type = 'external'
}: {
  onValueChange: (value: string | null) => void;
  networkId: NetworkId;
  type: 'external' | 'emergency';
}) {
  const capitalizedNetworkId =
    networkId.charAt(0).toUpperCase() + networkId.slice(1).toLowerCase();
  const network = networkMapping[networkId];
  const [address, setAddress] = useState<string>('');
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
  const [showNewAddress, setShowNewAddress] = useState<boolean>(false);
  const handleNewAddress = useCallback(() => setShowNewAddress(true), []);
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
  const handleCloseNewAddress = useCallback(() => setShowNewAddress(false), []);

  const onAddress = useCallback(
    (address: string) => {
      setAddress(address);
      onValueChange(validateAddress(address, network) ? address : null);
      setShowNewAddress(false);
    },
    [onValueChange, network]
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
        <Text variant="cardTitle" className="px-2 text-left">
          {t('addressInput.coldAddress.label', {
            network: capitalizedNetworkId
          })}
        </Text>
        {type === 'emergency' && <InfoButton onPress={showColdAddressHelp} />}
      </View>
      <View className="py-1 px-2 pl-4 bg-white rounded-md">
        <View className="flex-row items-center">
          <TextInput
            enablesReturnKeyAutomatically
            placeholder={
              type === 'emergency'
                ? t('addressInput.textInputPlaceholderWithCreate')
                : t('addressInput.textInputPlaceholder')
            }
            placeholderTextColor="#A9A9A9"
            autoComplete="off"
            spellCheck={false}
            autoCorrect={false}
            autoCapitalize="none"
            maxLength={100}
            onChangeText={onAddress}
            value={address}
            className={`native:text-base web:text-xs web:mobmed:text-sm web:sm:text-base flex-1 overflow-hidden web:outline-none border-none p-2 pl-0 border-md ${address === '' && robotoLoaded ? ' tracking-tightest mobmed:tracking-tighter moblg:tracking-normal' : 'tracking-normal'} ${robotoLoaded ? "font-['RobotoMono400Regular']" : ''}`}
          />
          {camAvailable && (
            <View className="py-1">
              <IconButton
                text={t('addressInput.scan')}
                onPress={handleScanQR}
                iconFamily="MaterialCommunityIcons"
                iconName="qrcode-scan"
              />
            </View>
          )}
          {type === 'emergency' && (
            <View className={`py-1 ${camAvailable ? 'pl-3' : ''}`}>
              <IconButton
                text={t('addressInput.createNewButton')}
                onPress={handleNewAddress}
                iconFamily="MaterialCommunityIcons"
                iconName="wallet-plus-outline"
              />
            </View>
          )}
        </View>
        {address !== '' && !validateAddress(address, network) && (
          <Text
            className={`${robotoLoaded ? "font-['RobotoMono400Regular']" : ''}`}
            style={{ fontSize: 13, color: 'red' }}
          >
            {t('addressInput.invalidAddress', {
              network: capitalizedNetworkId
            })}
          </Text>
        )}
      </View>
      <CreateColdAddress
        networkId={networkId}
        isVisible={showNewAddress}
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
          <View className="items-center gap-6 flex-row justify-center mb-4">
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
            <Button onPress={handleCloseScanQR}>{t('cancelButton')}</Button>
          </View>
        }
      >
        {!camPermission?.granted ? (
          <View className="gap-4 p-8">
            <Text className="text-slate-600">
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
            <View className="h-40 w-72 self-center">
              <CameraView {...cameraViewProps} />
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
        <Text className="pl-2 pr-2 text-slate-600">
          {t('addressInput.coldAddress.helpText')}
        </Text>
      </Modal>
    </View>
  );
}

export default React.memo(AddressInput);
