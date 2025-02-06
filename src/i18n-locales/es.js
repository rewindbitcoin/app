//Treat this as a glorified json with comments & multi-line using string literals
export default {
  app: {
    buildNumber: 'Compilación',
    unknownError: 'Ha ocurrido un error desconocido.',
    syncP2PVaultsError: `No se pudo conectar a la red de respaldo P2P. Este problema impide sincronizar las bóvedas creadas en otros dispositivos.

{{message}}`,
    syncNetworkError: `Hubo un problema durante una solicitud de red al actualizar tu cartera.

{{message}}`,
    syncUnexpectedError: `Ha ocurrido un problema inesperado al actualizar tu cartera.

{{message}}`,
    pushError: `¡Ups! Hubo un problema al enviar tu transacción. Por favor, verifica tu conexión e inténtalo de nuevo.

{{message}}`,
    newWalletTitle: 'Nueva Cartera',
    mainTitle: 'Carteras',
    createVaultTitle: 'Creando Bóveda',
    walletTitle: 'Cartera',
    settingsButton: 'Ajustes',
    settingsTitle: 'Ajustes',
    feeEstimatesError: `No se pudieron obtener estimaciones de comisiones actualizadas. Los montos de las comisiones pueden ser ligeramente inexactos.`,
    tipStatusError:
      'No se pudo obtener el último bloque de la blockchain. Los datos mostrados pueden no estar actualizados.',
    btcRatesError:
      'No se pudieron obtener el cambio actual de BTC. Los montos mostrados en {{currency}} pueden no ser precisos.',
    secureStorageAuthenticationPrompt:
      'Por favor, autentícate para acceder a los datos sensibles de tu cartera.',
    secureStorageCreationAuthenticationPrompt:
      'Por favor, autentícate para crear de forma segura una nueva cartera y cifrar tus datos sensibles.'
  },
  netStatus: {
    internetNotReachableWarning:
      'No se detecta conexión a Internet. Esto impide verificar el estado de la cartera, gestionar bóvedas y enviar o recibir fondos.',
    apiNotReachableWarning:
      'No se puede conectar a nuestros servicios. Esto afecta a las actualizaciones del precio de Bitcoin e impide operaciones con bóvedas debido a la interrupción de las copias de seguridad.',
    communityBackupsdNotReachableWarning:
      'No se puede conectar al nodo de Copias de Seguridad Comunitarias. Esto impide operaciones con bóvedas debido a la interrupción de las copias de seguridad.',
    blockchainExplorerNotReachableWarning:
      'No se puede conectar al explorador de la blockchain. Esto impide actualizar el estado de tus transacciones y acceder a información actualizada de la red Bitcoin.',
    blockchainMainnetExplorerNotReachableWarning:
      'No se puede conectar al explorador de la blockchain. Esto impide actualizar el estado de tus transacciones y acceder a información actualizada de la red Bitcoin.',
    connectionRestoredInfo:
      'Conectividad restaurada. Todas las funciones de la cartera están ahora completamente operativas.'
  }
};
