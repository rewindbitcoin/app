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
    },
    existing: {
      biometricsRequestDeclined:
        'Se canceló el acceso a tu billetera. Para continuar, por favor permite la autenticación biométrica cuando se te solicite.',
      biometricsAccessFailureIOS: `Estamos teniendo problemas para acceder a tu billetera debido a problemas con los permisos biométricos.

Esto puede deberse a que los permisos biométricos fueron desactivados o revocados, o debido a fallos repetidos en la autenticación.

Además, actualizar la configuración biométrica de tu dispositivo, como agregar una nueva huella digital o actualizar el reconocimiento facial, puede a veces invalidar las configuraciones anteriores.

Si rechazaste el acceso biométrico, puedes activarlo yendo a Configuración > RewindBitcoin de tu dispositivo y activando Face ID o Touch ID (esto puede variar según tu versión de iOS y dispositivo).

Este error también puede ocurrir si la aplicación se reinstala y se restaura con datos antiguos de iCloud de una instalación anterior, ya que la biometría no se incluye. En ese caso, elimina esta billetera usando el ícono de Configuración.

Si el problema persiste, puedes recrear tu billetera usando tu Frase de Recuperación para recuperar el acceso a tus fondos y bóvedas.`,
      biometricsAccessFailureNonIOS: `Estamos teniendo problemas para acceder a tu billetera debido a problemas con los permisos biométricos.

Esto puede deberse a que los permisos biométricos fueron desactivados o revocados, o debido a fallos repetidos en la autenticación.

Además, actualizar la configuración biométrica de tu dispositivo, como agregar una nueva huella digital o actualizar el reconocimiento facial, puede a veces invalidar las configuraciones anteriores.

Si has cambiado recientemente alguna configuración biométrica, intenta reactivar la biometría en tu dispositivo o restaurar los permisos de la aplicación.

Este error también puede ocurrir si la aplicación se reinstala y se restaura con datos antiguos de Google Drive de una instalación anterior, ya que la biometría no se incluye. En ese caso, elimina esta billetera usando el ícono de Configuración.

Si el problema persiste, puedes recrear tu billetera usando tu Frase de Recuperación para recuperar el acceso a tus fondos y bóvedas.`
    },
    errors: {
      //storageTitle: 'Error de Almacenamiento',
      storage: `Hubo un error al leer o escribir en el almacenamiento de tu dispositivo. Este problema puede deberse a datos corruptos, espacio de almacenamiento insuficiente u otros problemas relacionados con el almacenamiento. Ten en cuenta que todos los datos de tu billetera están respaldados de forma segura en formato cifrado en la red P2P de Rewind.

Para resolver este problema, intenta acceder a tu billetera nuevamente. Si el problema persiste, puedes recrear de forma segura tu billetera usando tu Frase Mnemónica de Recuperación. Esto restaurará todos tus datos de forma segura desde los respaldos.

Si necesitas más ayuda, por favor contacta con el equipo de Soporte de Rewind.`
    },
    vault: {
      hideButton: 'Ocultar',
      rescueButton: 'Rescatar',
      delegateButton: 'Delegar',
      triggerUnfreezeButton: 'Iniciar Descongelación',
      vaultTitle: 'Bóveda {{vaultNumber}}',
      vaultDate: 'Creada el {{date}}',
      amountFrozen: 'Cantidad Congelada',
      amountBeingUnfrozen: 'Cantidad en Descongelación',
      unfrozenAmount: 'Cantidad Descongelada',
      rescuedAmount: 'Cantidad Rescatada',
      confirming: 'Confirmando',
      pushedTriggerNotConfirmed:
        'Descongelación solicitada el {{triggerPushDate}}.',
      confirmedTrigger:
        'Cuenta regresiva de {{lockTime}} iniciada el {{triggerConfirmedDate}}.',
      triggerWithEstimatedDate:
        'Descongelación estimada para el {{estimatedUnfreezeDate}}.',
      triggerWithEstimatedDateButRescued:
        'Descongelación planeada para el {{plannedUnfreezeDateButRescued}}.',
      unfrozenDate: 'Descongelada el {{unfrozenDate}}.',
      unfrozenOnNextBlock:
        'La bóveda está virtualmente descongelada. Los fondos podrán ser utilizados en el próximo bloque.',
      timeRemaining: '{{timeRemaining}} restante',
      untriggeredLockTime: 'Tiempo de Bloqueo: {{timeRemaining}}',
      vaultNotFound:
        'Esta bóveda nunca fue incluida en la blockchain. Las comisiones podrían haber sido muy bajas, podría haber sido reemplazada por otra transacción, o podría haber habido un error de red durante el envío.',
      notTriggeredUnconfirmed: `Tus fondos están apartados de forma segura, esperando la confirmación final de la blockchain (esto puede tomar unos minutos).
Si presionas 'Iniciar Descongelación', comenzará un período de espera de {{lockTime}}, después del cual los fondos estarán disponibles.`,
      notTriggered: `Los fondos están congelados de forma segura. Si presionas 'Iniciar Descongelación', comenzará un período de espera de {{lockTime}}, después del cual los fondos estarán disponibles.`,
      rescueNotConfirmed: `Rescate solicitado el {{rescuePushDate}}.`,
      rescueNotConfirmedUnknownPush: `Rescate de Bóveda recientemente transmitido.`,
      confirmedRescue: `Rescatada el {{rescuedDate}}.`,
      rescueNotConfirmedAddress:
        'Rescate solicitado exitosamente (esperando confirmación). Los fondos están siendo movidos a tu dirección segura ahora mismo:',
      confirmedRescueAddress:
        'La bóveda fue rescatada exitosamente y los fondos fueron movidos a tu dirección segura:',
      unfrozenAndSpent:
        'La bóveda fue descongelada exitosamente. Los fondos descongelados fueron gastados el {{spentAsHotDate}} y ya no están disponibles.',
      unfrozenAndSpentPushed:
        'La bóveda fue descongelada exitosamente. Los fondos descongelados están en proceso de ser gastados en una transacción reciente.',
      unfrozenAndHotBalance:
        'La bóveda fue descongelada exitosamente y ahora forma parte de tu saldo disponible.',
      noFundsTile: 'Sin Fondos Congelados Aún',
      noFundsBody:
        'Mantén tus ahorros seguros congelando en Bóvedas los fondos que no necesitas diariamente.',
      triggerUnfreeze: {
        intro: `Estás a punto de iniciar el proceso de desbloqueo de los fondos de tu bóveda, que, llegado el momento, estarán listos para ser gastados.

Esto iniciará la cuenta regresiva de descongelación. Los fondos se desbloquearán y estarán disponibles después de {{timeLockTime}}.

Pulsa "Continuar" para elegir la comisión minera e iniciar la cuenta regresiva de descongelación.`,
        confirmationSpeedLabel: 'Comisión',
        feeSelectorExplanation:
          'Elige la comisión de minería para iniciar la cuenta regresiva de descongelación.',
        additionalExplanation: `La cuenta regresiva de {{timeLockTime}} comenzará una vez que se confirme la solicitud de descongelación.

Pulsa "Iniciar Descongelación" para solicitar el inicio de la cuenta regresiva de descongelación.`
      },
      rescue: {
        confirmationSpeedLabel: 'Comisión',
        intro: `Estás a punto de iniciar el rescate de los fondos de tu bóveda. Esto moverá los fondos inmediatamente a tu Dirección de Emergencia preconfigurada:

{{panicAddress}}

Es probable que esta dirección sea difícil de acceder si seguiste las pautas recomendadas durante la Configuración de la Bóveda. Asegúrate de que, llegado el momento, puedas acceder a ella. Una vez que los fondos sean enviados, esta billetera ya no tendrá acceso a ellos.

Esta acción está diseñada para situaciones extremas, como robo o extorsión, para garantizar la seguridad de tus Bitcoin. Asegúrate de que esta sea una decisión deliberada.`,
        feeSelectorExplanation:
          'Elige la comisión de minería de la transacción de rescate para asegurar un procesamiento rápido.',
        additionalExplanation: `Una vez que se confirme la solicitud de rescate, los fondos serán movidos a tu Dirección de Emergencia instantáneamente.

Pulsa 'Rescatar' para iniciar el proceso de rescate.`
      },
      delegate: {
        title: 'Archivo de Delegación',
        text: `Estás a punto de generar un archivo de delegación. Este archivo puede ser compartido con una persona de confianza que te pueda ayudar a proteger tus Bitcoin.

En caso de emergencia, la persona delegada puede usar el archivo para enviar tus fondos a la Dirección de Emergencia que especificaste durante la Configuración de la Bóveda. El archivo sólo contiene la información necesaria para hacer esto y no incluye ninguna clave para acceder a tus fondos.

Los delegados deben visitar rewindbitcoin.com y seguir instrucciones sencillas para completar la operación de rescate fácilmente. Los delegados con conocimientos técnicos de Bitcoin pueden leer el archivo y seguir las instrucciones directamente.

Pulsa "Delegar" para generar y compartir el archivo de delegación.`
      },
      help: {
        delegate: {
          title: 'Control Delegado',
          text: `La acción 'Delegar' te permite prepararte con anticipación asignando a una persona de confianza para ayudar durante emergencias.

Si no puedes acceder físicamente a tu billetera debido a circunstancias como incapacitación o coerción, la persona delegada puede asegurar tus fondos moviéndolos a tu Dirección de Emergencia.

El delegado no puede acceder ni gastar los fondos; sólo puede enviar los fondos a la Dirección de Emergencia que especificaste durante la Configuración. El delegado nunca tiene acceso a ninguna de tus claves y sólo maneja transacciones pre-firmadas, lo que hace seguro transferir esta responsabilidad.`
        },
        rescue: {
          title: 'Rescatar Fondos',
          text: `La acción 'Rescatar' te permite mover inmediatamente los fondos de tu bóveda a la Dirección de Emergencia que configuraste durante la Configuración de la Bóveda. Esta acción está diseñada para situaciones extremas, como robo o extorsión, para garantizar la seguridad de tus Bitcoin.

Una vez que se inicia el rescate, los fondos serán enviados a la Dirección de Emergencia, y esta billetera ya no tendrá acceso a ellos. Este proceso es irreversible.`
        },
        initUnfreeze: {
          title: 'Iniciar Descongelación',
          text: `La acción 'Iniciar Descongelación' comienza la cuenta regresiva para descongelar tu bóveda. Durante este período de cuenta regresiva, tus fondos permanecen bloqueados y nadie puede acceder a ellos, incluyéndote a ti.

Una vez que termine la cuenta regresiva, tus fondos serán desbloqueados y accesibles.`
        }
      }
    }
  }
};
