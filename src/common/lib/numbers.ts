import memoize from 'lodash.memoize';
import type { Locale } from '../../i18n/i18n';
//https://stackoverflow.com/a/9539746
const countDecimalDigits = memoize((number: number): number => {
  // Make sure it is a number and use the builtin number -> string.
  const s = '' + +number;
  // Pull out the fraction and the exponent.
  const match = /(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(s);
  // NaN or Infinity or integer.
  // We arbitrarily decide that Infinity is integral.
  if (!match) {
    return 0;
  }
  // Count the number of digits in the fraction and subtract the
  // exponent to simulate moving the decimal point left by exponent places.
  // 1.234e+2 has 1 fraction digit and '234'.length -  2 == 1
  // 1.234e-2 has 5 fraction digit and '234'.length - -2 == 5
  return Math.max(
    0, // lower limit.
    (match[1] == '0' ? 0 : (match[1] || '').length) - // fraction length
      (match[2] ? parseInt(match[2]) : 0)
  ); // exponent
});

const getLocaleSeparators = memoize((locale: Locale) => {
  const defaults = { delimiter: ',', separator: '.' };
  const formattedNumber = new Intl.NumberFormat(locale).format(12345.6);
  if (formattedNumber.length !== 8)
    throw new Error(`Unknow locale ${locale}: 1234.56 -> ${formattedNumber}`);

  const delimiter = formattedNumber[formattedNumber.length - 6];
  const separator = formattedNumber[formattedNumber.length - 2];
  //if (
  //  (delimiter !== '.' && delimiter !== ',') ||
  //  (separator !== '.' && separator !== ',')
  //)
  //  throw new Error(`Unknow separator ${locale}`);
  if (delimiter === undefined || separator === undefined) return defaults;
  return { delimiter, separator };
});
const numberToLocalizedFixed = (
  value: number,
  precision: number,
  locale: Locale
) => {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision
  }).format(value);
};
const numberToFixed = (value: number, precision: number, locale: Locale) => {
  const { separator } = getLocaleSeparators(locale);
  return value.toFixed(precision).replace('.', separator);
};
const numberToLocalizedString = (value: number, locale: Locale) => {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 12 }).format(
    value
  );
};

const localizedStrToNumber = (str: string, locale: Locale): number => {
  const { delimiter, separator } = getLocaleSeparators(locale);
  //console.log({ str, delimiter, separator });

  // Mapping locale-specific numerals to Western Arabic numerals
  const numerals = [
    ...new Intl.NumberFormat(locale, { useGrouping: false }).format(9876543210)
  ].reverse();
  const index = new Map(numerals.map((d, i) => [d, i.toString()]));
  const numeralRegex = new RegExp(`[${numerals.join('')}]`, 'g');

  try {
    let normalizedStr = str.trim();
    //console.log({ normalizedStr });

    // Replace locale-specific numerals with Western Arabic numerals
    normalizedStr = normalizedStr.replace(
      numeralRegex,
      d => index.get(d) || ''
    );
    //console.log({ replNormalizedStr: normalizedStr });

    // Check for multiple decimal separators or if separator precedes a delimiter
    if (
      (normalizedStr.match(new RegExp(`\\${separator}`, 'g')) || []).length >
        1 ||
      (normalizedStr.includes(delimiter) &&
        normalizedStr.includes(separator) &&
        normalizedStr.lastIndexOf(delimiter) > normalizedStr.indexOf(separator))
    ) {
      return NaN;
    }

    // Check for invalid leading zeros before the first delimiter:
    // 0123 is ok, but 0,123 or 01,234 not ok (maybe confusing)
    if (normalizedStr.includes(delimiter)) {
      const parts = normalizedStr.split(delimiter);
      const firstPart = parts.length > 0 ? parts[0] : null;
      if (firstPart && firstPart.startsWith('0') && firstPart.length > 1) {
        return NaN;
      }
    }

    // Split the string into integer and fractional parts
    const [integerPart] = normalizedStr.split(separator);
    //console.log({ integerPart });
    if (integerPart === undefined) return NaN;

    // Check for invalid placements of delimiters
    const reversedIntegerPart = integerPart.split('').reverse().join('');
    for (let i = 0; i < reversedIntegerPart.length; i++) {
      if (i % 4 !== 3 && reversedIntegerPart[i] === delimiter) {
        return NaN;
      }
    }

    // Replace decimal separator with dot and remove delimiters
    normalizedStr = normalizedStr
      .replace(new RegExp(`\\${separator}`), '.')
      .replace(new RegExp(`\\${delimiter}`, 'g'), '');
    //console.log({ finalNormalizedStr: normalizedStr });

    const parsedNumber = Number(normalizedStr);
    //console.log({ parsedNumber });
    return isNaN(parsedNumber) ? NaN : parsedNumber;
  } catch (error) {
    return NaN;
  }
};

/**
 * localizes unfinished strings while being typed in TexInput
 * For example: 0. will be valid and not formatted to 0
 * or 1,000.034000 will be ok too since the user may be entering zeros
 * to finally enter a non-zero later
 */
function localizeInputNumericString(strValue: string, locale: Locale) {
  if (strValue === '') return strValue;
  const { delimiter, separator } = getLocaleSeparators(locale);
  const number = localizedStrToNumber(
    //remove delimiters
    strValue.replace(new RegExp(`\\${delimiter}`, 'g'), ''),
    locale
  );
  if (!Number.isNaN(number)) {
    let localizedStr = numberToLocalizedString(number, locale);

    //If its a number finished by "."
    if (strValue[strValue.length - 1] === separator) {
      localizedStr = localizedStr + separator;
    }
    //If its a decimal number
    else if (strValue.indexOf(separator) !== -1) {
      const zero = new Intl.NumberFormat(locale).format(0);
      //If the decimal number ends with trailing zeros, leave them
      //  case a: x.0000 -> add back the zeros
      //  base b: x.y000 -> add back the separator and the zeros
      const matchTrailingZeros = strValue.match(
        new RegExp(`${separator}?${zero}+$`)
      );
      if (matchTrailingZeros) {
        localizedStr += matchTrailingZeros[0];
      }
    }
    return localizedStr;
  } else return strValue;
}

const findSingleDifferenceIndex = (newStr: string, oldStr: string) => {
  if (newStr.length !== oldStr.length + 1) return -1;

  let diffIndex = -1;
  for (let i = 0; i < newStr.length; i++) {
    if (newStr[i] !== oldStr[i - (diffIndex >= 0 ? 1 : 0)]) {
      if (diffIndex >= 0) return -1; // More than one difference found
      diffIndex = i;
    }
  }
  return diffIndex;
};

/** In iOS, numeric keyboards show only the decimal separator character.
 * When the user localization preferences in iOS are, fex., es-ES then the
 * decimal separator is a ".". However, the user may have chosen within the
 * app another locale. For example "en-US". So, the user cannot input
 * decimal separator for the app locale.
 * This function checks if the last character entered (newStr wrt oldStr) is
 * either a ".,'" and replaces it with the locale decimal separator.
 *
 * https://lefkowitz.me/visual-guide-to-react-native-textinput-keyboardtype-options/
 */
const unlocalizedKeyboardFix = (
  newStr: string,
  oldStr: string,
  locale: Locale
) => {
  const diffIndex = findSingleDifferenceIndex(newStr, oldStr);

  if (diffIndex >= 0) {
    const { separator } = getLocaleSeparators(locale);
    if (
      newStr[diffIndex] === '.' ||
      newStr[diffIndex] === ',' ||
      newStr[diffIndex] === "'"
    ) {
      // Create a new string with the locale correct separator
      return (
        newStr.substring(0, diffIndex) +
        separator +
        newStr.substring(diffIndex + 1)
      );
    }
  }

  return newStr;
};

export {
  numberToLocalizedFixed,
  numberToFixed,
  unlocalizedKeyboardFix,
  numberToLocalizedString,
  localizeInputNumericString,
  localizedStrToNumber,
  getLocaleSeparators,
  countDecimalDigits
};
