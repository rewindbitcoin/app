- No re-meter un toast si ya está puesto!
    -feeEstimates por algun motivo me sale mucho?

- Si no tengo conexion a internet entonces hay muchos toast q no se debemn de poner
y simplemente mostrar un mensaje permanente de q no hay red y no se puede usar la wallet

ME FALTA useTipStatus too!
el useNetStatus debería sacar un mensaje de no networrk /no api / network /api recovered en CAMBOPS de estado
Also, antes de sacar los errores de tipStatus o feeEstimates o lo q sea hacer un check the connectibity. Exportar de los hools
la funcion de check inidiviual
Incluso devería ser posible poder mirar el status de la conexion a electrum server (por si no se usa esplora...)
así como los isExplorerUp? Si
    -> Entonces antes de hacer un tast the feeError or tipStatus error hacer un await chek de api/internet/exploer

- Entonces no permitir los sync, y los btcRates automáticos y los useFeeEstimates automaticos

- Si no tengo red y accedo a una wallet no sync, entonces me sale el pulse pero no sale
error nunca de timeout... ??
    -> poruqe updateTipStatus me hace swallow del error y ne debería ?!?!
        Luegoi simplemente no se hace el update...

- Tengo un monton de toasts que no deberían aparecer si la causa principal

- Loading a Wallet without internet connedction triggers 2 consecutive btc rates erorrs simultanenously

- Si voy muy rapudo a creat un Vault me da error q aun no esta set el feeEstiamtes
muchos de esos...

- revisar todas mis llamadas a mis propias apis - ahí tengo q tener toast
    buscar en lvim -> "fetch("
      const response = await fetch(`${serviceAddressAPI}/get`);

es que a) No tengo acceso a Internet b) RewindBitcion está caído.
En ese caso simplemente mostrar un mensaje de error permanente. Diciendo
que will keep retrying every 60 seconds (tap to retry now)

 | Importante tengo los fetchVaultStatus que hacen uso de explorer.fetch y 
 || ya me han dado error durante un fetcg... hacer un retrial y hacer un toast...
 || handle eso
 ||   -> Asociado con esto, si quito la red y hago un refresh, me salen 2 veces
 ||   el mismo mensaje de error toast de fee-estimates...
 ||   En realidad debería tener el mensaje de q no hay red. y no repetir mensajes toast...
 ||   Probar todo tipo de errores de red como el de arriba con los vault.


Problems:
  do not repeat messages...
    -> fee Estimates too many times
  Dont let the app move if the app/wallet is experiencing an error:
    - fees incorrect ?
    - Show USD if values not correct ?
    - Incorrect sync ?
    - Old data, so do not allow to create vault/txs... ?
    
  Some errors are recoverable:  
    -> network
  Some are not recoverable:
    -> storage error
    -> many of the throw new Error() that i force

BTC/USD errors...

serviceApi errors...

Backup errors...

Network errors...
  - ensureConnected
  - explorer.fetchBlockHeight
  - explorer.fetchBlockStatus
  - explorer.fetchTxHistory

Some Network errors being handled:
 - pushTx
 - fetchOutputHistory
 - fetchServiceAddress
    -> Aqui si el faucet me falla printo 2 toasts... una en fetchOutputHistory y otra
        -> Además me hace un throw dentro del try!!! pero luego no lo capturo fuera?
    en useFaucet
- updateTipStatus
    - me hace swallow del error. Pero aquí no es correcto, no?
- updateBtcFiat
    - me hace swallow del error. Aquí es correcto.
- fetchP2PVaults
- p2pBackupVault -> hay un try catch
 - sync
    - But handling is pretty bad because if network fails then it
    basically errors that feeEstimates was bad
    - Here I have fetchVaultStatus that does not retry...

Explorer should retry stuff...
Explorer should already return some error stuff?
