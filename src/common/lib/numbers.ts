import memoize from 'lodash.memoize';
import type { Locale } from '../../i18n-locales/init';
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
/**
 * convert a number 10000.02 to fancy: 10,000.02
 */
const numberToFormattedFixed = (
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
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 20 }).format(
    value
  );
};

/** parses a localized string and returns a number or NaN if it
 * cannot be parsed
 */
const localizedStrToNumber = (str: string, locale: Locale): number => {
  if (str === '') return NaN;
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
 * Localizes unfinished strings while being typed in TexInput
 * For example: 0. will be valid and not formatted to 0
 * or 1,000.034000 will be ok too since the user may be entering zeros
 * to finally enter a non-zero later.
 * It strValue cannot be parsed as a number it simply returns the strValue
 */
function localizeInputNumericString(strValue: string, locale: Locale) {
  if (strValue === '') return strValue;
  const { delimiter, separator } = getLocaleSeparators(locale);

  //remove delimiters
  const cleanStrValue = strValue.replace(new RegExp(`\\${delimiter}`, 'g'), '');
  const number = localizedStrToNumber(cleanStrValue, locale);
  if (!Number.isNaN(number)) {
    let localizedStr = numberToLocalizedString(number, locale);

    //If its a number finished by "."
    if (cleanStrValue[cleanStrValue.length - 1] === separator) {
      localizedStr = localizedStr + separator;
    }
    //If its a decimal number
    else if (cleanStrValue.indexOf(separator) !== -1) {
      const zero = new Intl.NumberFormat(locale).format(0);
      //If the decimal number ends with trailing zeros, leave them
      //  case a: x.0000 -> add back the separator and the zeros
      //  base b: x.y000 -> add back ONLY the zeros
      const matchTrailingSeparatorAndZeros = cleanStrValue.match(
        new RegExp(`\\${separator}${zero}+$`)
      );
      const matchTrailingZeros = cleanStrValue.match(new RegExp(`${zero}+$`));
      if (matchTrailingSeparatorAndZeros) {
        localizedStr += matchTrailingSeparatorAndZeros[0];
      } else if (matchTrailingZeros) {
        localizedStr += matchTrailingZeros[0];
      }
    }
    return localizedStr;
  } else return strValue;
}

const findSingleAdditionDifferenceIndex = (newStr: string, oldStr: string) => {
  if (newStr.length !== oldStr.length + 1) return -1;

  let diffIndex = -1;
  for (let i = 0; i < newStr.length; i++) {
    if (newStr[i] !== oldStr[diffIndex === -1 ? i : i - 1]) {
      if (diffIndex !== -1) return -1; // More than one difference found
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
  const diffIndex = findSingleAdditionDifferenceIndex(newStr, oldStr);

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

/** given a new localized string, find out what should be the cursor
 * position based on the previous cursor position and old string.
 * Here it is assumed that the newStr is received after typying in the
 * keyboard a new charactar  (or after deleting one)
 *
 * The main idea is that if there were N numeric characters to the right
 * of the character, then, after keyboard manipulation, the new cursor should
 * still have N numeric characters to the right on the new string.
 *
 * For example:
 * 123|0.213
 * I add a 4 after the cursor ( | ) ->
 * 1234|0.213
 * I still have 4 numeric character to the right
 *
 * 123|0.213
 * I delete the 3
 * 12|0.213
 * I still have 4 numeric characater to the right
 *
 * There are some special cases commented in the code:
 *
 */
const getNewCursor = (
  newStr: string,
  oldStr: string,
  oldCursor: number,
  locale: Locale
): number => {
  // Count the number of numeric characters to the right of oldCursor in oldStr
  let numbersToTheRight = 0;
  for (let i = oldCursor; i < oldStr.length; i++) {
    if (/\d/.test(oldStr[i]!)) {
      numbersToTheRight++;
    }
  }

  // Find the new cursor position in newStr
  let newCursor = newStr.length;
  for (let i = newStr.length - 1; i >= 0; i--) {
    if (/\d/.test(newStr[i]!)) {
      if (--numbersToTheRight === 0) {
        newCursor = i;
        break;
      }
    }
  }

  //Special case:
  //This is this case: 1|02,020 and the first 1 is deleted:
  if (numbersToTheRight > 0) newCursor = 0;

  const { delimiter, separator } = getLocaleSeparators(locale);

  //Special case:
  //If I used to have a delimiter on the right of the cursor, keep having it
  //This keeps the cursor after the "1" when deleing the "2" in: 12|,345
  if (oldStr[oldCursor] === delimiter) {
    if (newCursor > 0 && newStr[newCursor - 1] === delimiter) newCursor--;
  }

  //Special case:
  //If the string just growed and i have a delimiter to the left the move the
  //cursor to the left. If I have 12,|345 and i place a 9 before the 3, then the
  //cursor will be put after the new 9 -> 129|,345 instead of after it 129,|345
  else if (
    newStr.length > oldStr.length &&
    newCursor > 0 &&
    newStr[newCursor - 1] === delimiter
  )
    newCursor--;

  //Special case:
  //If I used to have a decimal separator on the right of the cursor, keep having it
  //This keeps the cursor right after the "0" in 10|.78 when adding a 3 after the "0"
  //103|.78 instead of 103.|78
  if (oldStr[oldCursor] === separator) {
    if (newCursor > 0 && newStr[newCursor - 1] === separator) newCursor--;
  }

  return newCursor;
};

/** This function returns a number which correspondes to the snap of value into step.
 * The function will return minimumValue or maximumValue if the snapped
 * value is not within the range. It will return null if the snapped value
 * and the value are not within range
 */
function snapWithinRange({
  value,
  minimumValue,
  maximumValue,
  step
}: {
  value: number | null;
  minimumValue: number;
  maximumValue: number;
  step: number;
}): number | null {
  if (value === null) return null;
  const digits = countDecimalDigits(step);
  const snappedValue = Number(
    (step * Math.round(value / step)).toFixed(digits)
  );

  if (snappedValue > maximumValue && value <= maximumValue) return value;
  else if (snappedValue < minimumValue && value >= minimumValue) return value;
  else if (snappedValue >= minimumValue && snappedValue <= maximumValue)
    return snappedValue;
  else return null;
}

export {
  numberToFormattedFixed,
  numberToFixed,
  unlocalizedKeyboardFix,
  numberToLocalizedString,
  localizeInputNumericString,
  localizedStrToNumber,
  getLocaleSeparators,
  getNewCursor,
  countDecimalDigits,
  snapWithinRange
};
