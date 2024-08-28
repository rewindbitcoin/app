import { Gzip } from 'fflate';
import { TextEncoder } from './textencoder';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * compresses data in chunks so that it does not lock the javascript engine.
 * returns compressed data or undefined if requested onProgress.
 */
export const compressData = async ({
  data,
  chunkSize,
  onProgress
}: {
  data: Uint8Array | string;
  chunkSize: number;
  onProgress?: (progress: number) => boolean;
}) => {
  let totalProcessedLength = 0; // Total length of data processed so far

  const compressedChunks: Uint8Array[] = []; // Array to collect compressedChunks

  const compressor = new Gzip(
    //{ level: 9, mem: 12 }, Use default values
    (compressedChunk: Uint8Array) => {
      compressedChunks.push(compressedChunk);
    }
  );

  for (let i = 0; i * chunkSize < data.length; i++) {
    const start = i * chunkSize;
    const end = Math.min((i + 1) * chunkSize, data.length);
    let chunk;
    if (typeof data === 'string') {
      // If data is a string, slice the string chunk and convert to Uint8Array
      const stringChunk = data.substring(start, end);
      //chunk = strToU8(stringChunk);
      chunk = new TextEncoder().encode(stringChunk);
    } else {
      // If data is already a Uint8Array, just slice the chunk
      chunk = data.subarray(start, end);
    }
    const isLast = end >= data.length;

    compressor.push(chunk, isLast);
    totalProcessedLength += chunk.length;
    // Calculate and report progress for each chunk except the last
    const progress = totalProcessedLength / data.length;
    if (onProgress && onProgress(progress) === false) {
      return;
    } else await sleep(0);
  }
  return concatenateChunks(compressedChunks);
};

function concatenateChunks(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((acc, val) => acc + val.length, 0);
  const result = new Uint8Array(totalLength);

  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}
