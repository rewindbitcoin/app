//This works on web: https://snack.expo.dev/@bycedric/expo-issue-15442
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Camera } from 'expo-camera/legacy';
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Platform, View, StyleSheet, ActivityIndicator } from 'react-native';
import {
  TextInput,
  Text,
  useTheme,
  Theme,
  IconButton,
  InfoButton,
  Modal,
  Button
} from '../../common/ui';
import { useTranslation } from 'react-i18next';
import Bip39 from './Bip39';
import { TouchableOpacity } from 'react-native-gesture-handler';

function AddressInput() {
  const [address, setAddress] = useState<string>('');
  const [scanQR, setScanQR] = useState<boolean>(false);
  const [camFacing, setCamFacing] = useState<'back' | 'front'>('back');
  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [hasMultipleCameras, setHasMultipleCameras] = useState<boolean>(false);

  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useMemo(() => getStyles(theme), [theme]);
  const [showNewAddress, setShowNewAddress] = useState<boolean>(false);
  const handleNewAddress = useCallback(() => setShowNewAddress(true), []);
  const handleScanQR = useCallback(() => setScanQR(true), []);
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

  const handleBarCodeScanned = useCallback(({ data }: { data: string }) => {
    console.log('handleBarCodeScanned', { data });
    setScanQR(false);
    setAddress(data);
  }, []);

  const toggleCameraFacing = useCallback(() => {
    setCamFacing(current => (current === 'back' ? 'front' : 'back'));
  }, []);

  useEffect(() => {
    const checkCameras = async () => {
      const devices = await Camera.getAvailableCameraTypesAsync();
      console.log({ devices });
      setHasMultipleCameras(devices.length > 1);
    };
    checkCameras();
  }, []);

  console.log(camPermission);

  return (
    <View>
      <View style={styles.cardHeader}>
        <Text variant="cardTitle" className="px-2 text-left">
          {t('addressInput.coldAddress.label')}
        </Text>
        <InfoButton />
      </View>
      <View style={styles.inputWrapper}>
        <TextInput
          enablesReturnKeyAutomatically
          placeholder={t('addressInput.coldAddress.textInputPlaceholder')}
          autoComplete="off"
          spellCheck={false}
          autoCorrect={false}
          autoCapitalize="none"
          maxLength={100}
          onChangeText={address => setAddress(address)}
          value={address}
          style={styles.input}
        />
        <View className="py-1 ml-4">
          <IconButton
            text={t('addressInput.scan')}
            onPress={handleScanQR}
            iconFamily="MaterialCommunityIcons"
            iconName="qrcode-scan"
          />
        </View>
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
      {scanQR &&
        (!camPermission ? (
          <ActivityIndicator />
        ) : !camPermission.granted ? (
          <View>
            <Text>TODO We need your permission to show the camera</Text>
            <Button onPress={requestCamPermission}>
              TODO: Grant Permission
            </Button>
          </View>
        ) : (
          <View className="h-96">
            <CameraView
              facing={camFacing}
              barcodeScannerSettings={{
                barcodeTypes: ['qr']
              }}
              onBarcodeScanned={handleBarCodeScanned}
              className="flex-1 w-full h-96"
            >
              {hasMultipleCameras && (
                <View className="bg-white p-2 rounded-md">
                  <TouchableOpacity onPress={toggleCameraFacing}>
                    <Text>{t('camera.flip')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </CameraView>
          </View>
        ))}
    </View>
  );
}

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    cardHeader: {
      marginBottom: theme.screenMargin / 2,
      flexDirection: 'row',
      alignItems: 'center'
    },
    inputWrapper: {
      paddingVertical: 4,
      borderRadius: 5,
      flexDirection: 'row',
      paddingHorizontal: 8,
      paddingLeft: 16,
      alignItems: 'center',
      backgroundColor: theme.colors.card
    },
    input: {
      flex: 1,
      ...Platform.select({
        //clean style for web browsers
        web: {
          outlineStyle: 'none'
        }
      }),
      borderWidth: 0,
      padding: 8,
      paddingLeft: 0,
      borderRadius: 5
    }
  });
export default React.memo(AddressInput);
