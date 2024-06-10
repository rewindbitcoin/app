import moize from 'moize';
// Define interfaces for type safety
interface BlockStatus {
  confirmed: boolean;
  block_height?: number;
  block_hash?: string;
  block_time?: number;
}

interface Block {
  id: string;
  height: number;
  version: number;
  timestamp: number;
  tx_count: number;
  size: number;
  weight: number;
  merkle_root: string;
  previousblockhash: string;
  nonce: number;
  bits: number;
  difficulty: number;
  mediantime: number;
  status: BlockStatus;
}

// Function to get the block ID by block height
async function getBlockId(
  esploraAPI: string,
  blockHeight: number
): Promise<string> {
  const response = await fetch(`${esploraAPI}/block-height/${blockHeight}`);
  if (!response.ok) {
    throw new Error(`Error fetching block ID: ${response.statusText}`);
  }
  const blockId = await response.text();
  return blockId;
}

// Function to get the block details by block ID
async function getBlockDetails(
  esploraAPI: string,
  blockId: string
): Promise<Block> {
  const response = await fetch(`${esploraAPI}/block/${blockId}`);
  if (!response.ok) {
    throw new Error(`Error fetching block details: ${response.statusText}`);
  }
  const blockData: Block = await response.json();
  return blockData;
}

// Function to get the block timestamp
export const fetchBlockTimestamp = moize.promise(
  async (esploraAPI: string, blockHeight: number): Promise<number> => {
    // Get the block ID from the block height
    const blockId = await getBlockId(esploraAPI, blockHeight);

    // Fetch the block details using the block ID
    const blockData = await getBlockDetails(esploraAPI, blockId);

    // Return the block timestamp
    return blockData.timestamp;
  },
  { maxSize: 1000 }
);
