//Treat this as a glorified json with comments & multi-line using string literals
export default {
  app: {
    buildNumber: 'Compilación',
    unknownError: 'Ha ocurrido un error desconocido.',
    syncP2PVaultsError: `No se pudo conectar a la red de respaldo P2P. Este problema impide sincronizar las bóvedas creadas en otros dispositivos.

{{message}}`,
    syncNetworkError: `Hubo un problema durante una solicitud de red al actualizar tu billetera.

{{message}}`,
    syncUnexpectedError: `Ha ocurrido un problema inesperado al actualizar tu billetera.

{{message}}`,
    pushError: `¡Ups! Hubo un problema al enviar tu transacción. Por favor, verifica tu conexión e inténtalo de nuevo.

{{message}}`,
    newWalletTitle: 'Nueva Cartera',
    mainTitle: 'Carteras',
    createVaultTitle: 'Creando Bóveda',
    walletTitle: 'Cartera',
    //settingsButton: 'Ajustes',
    settingsTitle: 'Ajustes',
    feeEstimatesError: `No se pudieron obtener estimaciones de comisiones actualizadas. Los montos de las comisiones pueden ser ligeramente inexactos.`,
    tipStatusError:
      'No se pudo obtener el último bloque de la blockchain. Los datos mostrados pueden no estar actualizados.',
    btcRatesError:
      'No se pudieron obtener el cambio actual de BTC. Los montos mostrados en {{currency}} pueden no ser precisos.',
    secureStorageAuthenticationPrompt:
      'Por favor, autentícate para acceder a los datos sensibles de tu billetera.',
    secureStorageCreationAuthenticationPrompt:
      'Por favor, autentícate para crear de forma segura una nueva billetera y cifrar tus datos sensibles.'
  },
  netStatus: {
    internetNotReachableWarning:
      'No se detecta conexión a Internet. Esto impide verificar el estado de la billetera, gestionar bóvedas y enviar o recibir fondos.',
    apiNotReachableWarning:
      'No se puede conectar a nuestros servicios. Esto afecta a las actualizaciones del precio de Bitcoin e impide operaciones con bóvedas debido a la interrupción de las copias de seguridad.',
    communityBackupsdNotReachableWarning:
      'No se puede conectar al nodo de Community Backups. Esto impide operaciones con bóvedas debido a la interrupción de las copias de seguridad.',
    blockchainExplorerNotReachableWarning:
      'No se puede conectar al explorador de la blockchain. Esto impide actualizar el estado de tus transacciones y acceder a información actualizada de la red Bitcoin.',
    blockchainMainnetExplorerNotReachableWarning:
      'No se puede conectar al explorador de la blockchain. Esto impide actualizar el estado de tus transacciones y acceder a información actualizada de la red Bitcoin.',
    connectionRestoredInfo:
      'Conectividad restaurada. Todas las funciones de la billetera están ahora completamente operativas.'
  },
  wallets: {
    addNew: 'Añadir Nueva',
    //importWalletButton: 'Importar Billetera',
    mainWallet: 'Billetera Principal',
    testWallet: 'Billetera de Prueba',
    noRealValue: 'Sin Valor Real',
    createdOn: 'Creada el',
    walletId: 'Billetera {{id}}'
  },
  wallet: {
    vaultTab: 'Bóvedas',
    historyTab: 'Historial',
    receive: 'Recibir',
    send: 'Enviar',
    freeze: 'Congelar',
    optionalSetPasswordTitle: 'Proteger Billetera',
    focedSetPasswordTitle: 'Establecer Nueva Contraseña',
    forcedSetPasswordText: `Por favor, establece una nueva contraseña (8-32 caracteres).

Si alguna vez olvidas tu contraseña, puedes recuperar tu billetera usando tu Frase de Recuperación.`,
    optionalSetPasswordText: `Te sugerimos establecer una contraseña para aumentar la seguridad de tu billetera.

Aunque es opcional, una contraseña protege tus activos, especialmente en plataformas donde no se puede usar el cifrado biométrico.`,
    skipOptionalSetPasswordButton: 'No Usar Contraseña',
    setPasswordButton: 'Establecer Contraseña',
    requestPasswordTitle: 'Ingresar Contraseña',
    requestPasswordButton: 'Ingresar Contraseña',
    requestPasswordText: `Por favor, ingresa la contraseña de la billetera para continuar.

Si has olvidado la contraseña de tu billetera, puedes crear una nueva usando tu Frase de Recuperación para recuperar el acceso.`,
    advancedOptionsTitle: 'Opciones Avanzadas',
    usePasswordTitle: 'Usar Contraseña',
    biometricEncryptionTitle: 'Cifrado Biométrico',
    passwordProtectionTitle: 'Protección con Contraseña',
    encryptAppDataTitle: 'Cifrar Datos de la App',
    //networkTitle: 'Red',
    //importButton: 'Importar',
    createNonRealBtcButton: 'Crear Billetera de Prueba',
    createRealBtcButton: 'Crear Billetera',
    importNonRealBtcButton: 'Importar Billetera de Prueba',
    importRealBtcButton: 'Importar Billetera',
    testingWalletInfo: 'Esta billetera no usará Bitcoin real.',
    realWalletWarning:
      'Billeteras con Bitcoin real actualmente desaconsejadas.',
    creatingWallet: `⚡ Construyendo tu Billetera Rewind...

¡Organizando bytes y alineando bits. ¡Espera un momento!`,
    biometricsErrorTitle: 'Error Biométrico',
    new: {
      biometricsRequestDeclined: `No pudimos configurar la seguridad biométrica (reconocimiento facial o autenticación de huella digital) para tu billetera.

Esto puede deberse a que no otorgaste los permisos necesarios, o tu dispositivo no es compatible con biometría.`,
      biometricsCurrentlyDisabledNonIOS: `Como la biometría no se puede usar en este dispositivo, las nuevas billeteras usarán seguridad no biométrica por defecto hasta que otorgues los permisos.

Para reactivar la biometría, ve a la Configuración de tu dispositivo y asegúrate de que los permisos biométricos estén habilitados.`,
      biometricsCurrentlyDisabledIOS: `Como la biometría no se puede usar en este dispositivo, las nuevas billeteras usarán seguridad no biométrica por defecto hasta que otorgues los permisos.

Si deseas reactivar la biometría, ve a Configuración > RewindBitcoin y activa Face ID o Touch ID (esto puede variar según tu versión de iOS y dispositivo).`,
      biometricsHowDisable: `Por favor, inténtalo de nuevo y otorga los permisos necesarios.

Si prefieres no usar biometría, puedes desactivar esta función en "Opciones Avanzadas" durante el proceso de configuración de Nueva Billetera.`,
      biometricsReadWriteError: `La implementación biométrica en tu dispositivo tiene problemas.

Esto puede deberse a incompatibilidades con tu dispositivo, actualizaciones recientes en tu configuración biométrica (como agregar una nueva huella digital o actualizar el reconocimiento facial), o fallos repetidos en la autenticación.

Como no se puede usar la biometría, te recomendamos ajustar el proceso de creación de la billetera. Por favor, desactiva la biometría y selecciona una contraseña en 'Opciones Avanzadas' durante la configuración de Nueva Billetera.`
    }
  }
};
