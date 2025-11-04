export const fixtures = {
  edge2edge: {
    MNEMONIC:
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    COLD_MNEMONIC: 'oil oil oil oil oil oil oil oil oil oil oil oil',
    BURN_MNEMONIC:
      'term title ship scorpion ahead blade error sentence tongue law afford slush',
    FAUCET_AMOUNT: 1000000,
    VAULTED_AMOUNT: 100000,
    GAP_LIMIT: 20,
    SAMPLES: 60,
    PRESIGNED_FEE_RATE_CEILING: 100,
    MAX_PRESIGNED_FEE_RATE_CEILING: 10000,
    LOCK_BLOCKS: 10,
    TRIGGER_FEE_RATE: 1,
    VAULT_PATH: `m/1073/<network>'/0'/<index>`,
    expected: {
      masterFingerprint: '73c5da0a',
      unvaultKey:
        "[73c5da0a/0']tpubD97UxEEVXiRs2uHYkHSU6ddidnoP2XQ54ddFZYJ7Cqo1szH58GtZeEDf7yiGGz5ABCaECZE5AusSmQWfFvoAeM56m6CzoB77UGDb1wTwDyz/0",
      unvaultPubKeyHex:
        '03038c1b21ba6eb640c4d325fcd23e62e1740b05364e2f8cf4d02036e506ad2aec',
      coldAddress: 'bcrt1qdj8q2slg766q6c6atuz0vqjghzrtaum39nxal0',
      defaultAccount:
        "wpkh([73c5da0a/84'/1'/0']tpubDC8msFGeGuwnKG9Upg7DM2b4DaRqg3CUZa5g8v2SRQ6K4NSkxUgd7HsL2XVWbVm39yBA4LAxysQAm397zwQSQoQgewGiYZqrA9DsP4zbQ1M/0/*)",
      descriptors: [
        "wpkh([73c5da0a/84'/1'/0']tpubDC8msFGeGuwnKG9Upg7DM2b4DaRqg3CUZa5g8v2SRQ6K4NSkxUgd7HsL2XVWbVm39yBA4LAxysQAm397zwQSQoQgewGiYZqrA9DsP4zbQ1M/0/*)",
        "wpkh([73c5da0a/84'/1'/0']tpubDC8msFGeGuwnKG9Upg7DM2b4DaRqg3CUZa5g8v2SRQ6K4NSkxUgd7HsL2XVWbVm39yBA4LAxysQAm397zwQSQoQgewGiYZqrA9DsP4zbQ1M/1/*)"
      ],
      changeDescriptor:
        "wpkh([73c5da0a/84'/1'/0']tpubDC8msFGeGuwnKG9Upg7DM2b4DaRqg3CUZa5g8v2SRQ6K4NSkxUgd7HsL2XVWbVm39yBA4LAxysQAm397zwQSQoQgewGiYZqrA9DsP4zbQ1M/1/*)"
    }
  }
};
