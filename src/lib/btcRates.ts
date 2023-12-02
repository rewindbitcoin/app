export type Currency = 'USD' | 'EUR' | 'GBP';
export async function getBtcFiat(currency: Currency): Promise<number> {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=${currency.toLowerCase()}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }
    const data = await response.json();
    return data.bitcoin.usd;
  } catch (error) {
    console.error(`Failed to fetch BTC/${currency} rate:`, error);
    throw error; // Rethrow the error for further handling if necessary
  }
}
