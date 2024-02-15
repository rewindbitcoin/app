import { Gzip, strToU8 } from 'fflate';

export const compressData = (
  data: Uint8Array | string,
  chunkSize: number,
  progressCallback: (progress: number) => boolean // Updated to expect a boolean return value
) => {
  let totalProcessedLength = 0; // Total length of data processed so far

  const compressedChunks: Uint8Array[] = []; // Array to collect compressedChunks

  const compressor = new Gzip(
    //{ level: 9, mem: 12 }, Use default values
    (compressedChunk: Uint8Array) => {
      compressedChunks.push(compressedChunk);
    }
  );

  let interrupted = false;
  for (let i = 0; !interrupted && i * chunkSize < data.length; i++) {
    const start = i * chunkSize;
    const end = Math.min((i + 1) * chunkSize, data.length);
    let chunk;
    if (typeof data === 'string') {
      // If data is a string, slice the string chunk and convert to Uint8Array
      const stringChunk = data.substring(start, end);
      chunk = strToU8(stringChunk);
    } else {
      // If data is already a Uint8Array, just slice the chunk
      chunk = data.subarray(start, end);
    }
    const isLast = end >= data.length;

    compressor.push(chunk, isLast);
    totalProcessedLength += chunk.length;
    // Calculate and report progress for each chunk except the last
    const progress = totalProcessedLength / data.length;
    interrupted = progressCallback(progress); // Use the return value to control interruption

    if (interrupted) {
      break; // Exit the loop if the process was interrupted during the last callback
    }
  }

  if (!interrupted) {
    // If the process was not interrupted, concatenate all chunks
    return concatenateChunks(compressedChunks);
  } else return;
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

//// Example usage
//const data = new Uint8Array(/* your data here */);
//const chunkSize = Math.ceil(data.length / 100); // Adjust chunk size as needed
//compressData(data, chunkSize, (progress, interrupt) => {
//  console.log(`Compression progress: ${progress * 100}%`);
//  // Example condition to interrupt the compression
//  if (progress > 0.5) {
//    // Interrupt compression when 50% is reached
//    interrupt(); // Call the interrupt function to stop the compression
//  }
//});
