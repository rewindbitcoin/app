Rename errors->status in errors.ts
    walletErrors -> appStatus
        app:
            Status
        wallet:
            Status
    Differentiat: 
        -> errors
        -> status

In toast of errors, then the timeout time should be larger!!!

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
 - fetchOutoutHistory
 - sync
    - But handling is pretty bad because if network fails then it
    basically errors that feeEstimates was bad
    - Here I have fetchVaultStatus that does not retry...

Explorer should retry stuff...
Explorer should already return some error stuff?
