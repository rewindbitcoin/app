import type { Locale } from '../../i18n-locales/init';
import type { Currency, SubUnit } from '../lib/settings';
import { numberToLocalizedString } from '../../common/lib/numbers';
import { formatFiat, fromSats } from '../lib/btcRates';
export const formatBalance = ({
  satsBalance,
  btcFiat,
  currency,
  locale,
  mode
}: {
  satsBalance: number;
  btcFiat?: number | undefined;
  currency: Currency;
  locale: Locale;
  mode: SubUnit | 'Fiat';
}) => {
  if (mode === 'Fiat') {
    if (btcFiat === undefined)
      throw new Error(
        'formatBalance cannot format Fiat values without a proper btcRate'
      );
    const balance = fromSats(satsBalance, mode, btcFiat);
    return formatFiat({ amount: balance, locale, currency });
  } else {
    const balance = fromSats(satsBalance, mode, undefined);
    return numberToLocalizedString(balance, locale);
  }
};
