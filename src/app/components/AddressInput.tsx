//This works on web: https://snack.expo.dev/@bycedric/expo-issue-15442
import { BarcodeType, CameraView, useCameraPermissions } from 'expo-camera';
import { Camera } from 'expo-camera/legacy';
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Platform, View, ActivityIndicator } from 'react-native';
import {
  TextInput,
  Text,
  IconButton,
  InfoButton,
  Modal,
  Button
} from '../../common/ui';
import { useTranslation } from 'react-i18next';
import Bip39 from './Bip39';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { isAvailableAsync } from 'expo-secure-store';

function AddressInput() {
  const [address, setAddress] = useState<string>('');
  const [scanQR, setScanQR] = useState<boolean>(false);
  const [camFacing, setCamFacing] = useState<'back' | 'front' | null>(null);
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [camTypes, setCamTypes] = useState<Array<'back' | 'front'> | null>(
    null
  );

  //https://github.com/expo/expo/issues/28069#issuecomment-2088224873
  const [camPermissionGrantedDelay, setCamPermissionGrantedDelay] =
    useState(false);

  useEffect(() => {
    if (camPermission?.granted)
      setTimeout(() => setCamPermissionGrantedDelay(true), 2000);
  }, [camPermission?.granted]);

  const { t } = useTranslation();
  const [showNewAddress, setShowNewAddress] = useState<boolean>(false);
  const handleNewAddress = useCallback(() => setShowNewAddress(true), []);
  const handleScanQR = useCallback(() => setScanQR(true), []);
  const handleCloseScanQR = useCallback(() => setScanQR(false), []);
  const handleCloseNewAddress = useCallback(() => setShowNewAddress(false), []);
  const [words, setWords] = useState<string[]>([
    'december',
    'abandon',
    'abandon',
    'abandon',
    'abandon',
    'abandon',
    'abandon',
    'abandon',
    'abandon',
    'abandon',
    'abandon',
    'about'
  ]);
  const onWords = useCallback((words: Array<string>) => {
    setWords(words);
  }, []);

  const onChangeText = useCallback(
    (address: string) => setAddress(address),
    []
  );

  const onBarcodeScanned = useCallback(({ data }: { data: string }) => {
    setScanQR(false);
    setAddress(data);
  }, []);
  const onBarCodeScanned = useCallback(
    ({
      nativeEvent
    }: {
      nativeEvent: {
        data: string;
      };
    }) => {
      setAddress(nativeEvent.data);
      setScanQR(false);
    },
    []
  );

  const toggleCameraFacing = useCallback(() => {
    setCamFacing(current => (current === 'back' ? 'front' : 'back'));
  }, []);

  useEffect(() => {
    const checkCameras = async () => {
      if (Platform.OS !== 'web' || (await isAvailableAsync())) {
        const camTypes =
          Platform.OS === 'web'
            ? await Camera.getAvailableCameraTypesAsync()
            : (['back', 'front'] as Array<'back' | 'front'>);

        if (camTypes.length) {
          setCamTypes(camTypes);
          const camFacing = camTypes.length === 1 ? camTypes[0]! : 'back';
          setCamFacing(camFacing);
        }
      }
    };
    checkCameras();
  }, []);

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
          {t('addressInput.coldAddress.label')}
        </Text>
        <InfoButton />
      </View>
      <View className="py-1 px-2 pl-4 items-center bg-white flex-row rounded-md">
        <TextInput
          enablesReturnKeyAutomatically
          placeholder={t('addressInput.coldAddress.textInputPlaceholder')}
          autoComplete="off"
          spellCheck={false}
          autoCorrect={false}
          autoCapitalize="none"
          maxLength={100}
          onChangeText={onChangeText}
          value={address}
          className="flex-1 web:outline-none border-none p-2 pl-0 border-md"
        />
        {camFacing && (
          <View className="py-1 ml-4">
            <IconButton
              text={t('addressInput.scan')}
              onPress={handleScanQR}
              iconFamily="MaterialCommunityIcons"
              iconName="qrcode-scan"
            />
          </View>
        )}
        <View className="py-1 ml-4">
          <IconButton
            text={t('addressInput.coldAddress.createNewButton')}
            onPress={handleNewAddress}
            iconFamily="MaterialCommunityIcons"
            iconName="wallet-plus-outline"
          />
        </View>
      </View>
      <Modal
        isVisible={showNewAddress}
        title={t('addressInput.coldAddress.createNewModalTitle')}
        icon={{
          family: 'Ionicons',
          name: 'wallet'
        }}
        onClose={handleCloseNewAddress}
      >
        <Text>{t('addressInput.coldAddress.createNewModalText')}</Text>
        <Bip39 readonly onWords={onWords} words={words} />
      </Modal>
      <Modal
        title="TODO Scan QR"
        isVisible={scanQR}
        icon={{
          family: 'MaterialCommunityIcons',
          name: 'qrcode-scan'
        }}
        onClose={handleCloseScanQR}
        closeButtonText="TODO close button"
      >
        {!camPermission || !camTypes ? (
          <ActivityIndicator />
        ) : !camPermission.granted ? (
          <View>
            <Text>TODO We need your permission to show the camera</Text>
            <Button onPress={requestCamPermission}>
              TODO: Grant Permission
            </Button>
          </View>
        ) : !camPermissionGrantedDelay ? (
          <ActivityIndicator />
        ) : (
          <View className="h-40 w-72 self-center">
            <CameraView {...cameraViewProps}>
              {camTypes !== null && camTypes.length > 1 && (
                <View className="bg-white p-2 rounded-md">
                  <TouchableOpacity onPress={toggleCameraFacing}>
                    <Text>{t('camera.flip')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </CameraView>
          </View>
        )}
      </Modal>
    </View>
  );
}

export default React.memo(AddressInput);
