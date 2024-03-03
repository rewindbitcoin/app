import fs from "fs";
import path from "path";

import { locales } from "./i18next.config";

type LocaleData = {
  [key: string]: string | LocaleData;
};

const importLocaleData = async (locale: string) => {
  const module = await import(`./${locale}.js`);
  return module.default;
};

// Helper function to recursively collect keys from an object (including nested keys)
const collectKeys = (obj: LocaleData, prefix = ""): string[] => {
  return Object.keys(obj).reduce((res, key) => {
    const value = obj[key];
    const fullPath = `${prefix}${key}`;
    if (typeof value === "object" && value !== null) {
      // TypeScript needs assurance that value is not an array or null
      res = res.concat(collectKeys(value as LocaleData, `${fullPath}.`));
    } else {
      res.push(fullPath);
    }
    return res;
  }, [] as string[]);
};

// Function to load JSON files and compare keys
const compareKeys = async (specificLocale?: string) => {
  const localesToCheck = specificLocale ? [specificLocale] : locales;
  for (const locale of localesToCheck) {
    const filePath = path.join("src", "i18n", `${locale}.keys.json`);
    try {
      const fileContents = fs.readFileSync(filePath, "utf8");
      const data = JSON.parse(fileContents);

      // Collect keys from the loaded JSON file
      const loadedKeys = collectKeys(data);

      const localeData = await importLocaleData(locale);
      const definedKeys = collectKeys(localeData);

      // Find missing and undefined keys
      const missingKeys = definedKeys.filter(
        (key) => !loadedKeys.includes(key),
      );
      const undefinedKeys = loadedKeys.filter(
        (key) => !definedKeys.includes(key),
      );

      if (undefinedKeys.length > 0) {
        console.log(`Needs translation for ${locale}:`, undefinedKeys);
      }
      if (missingKeys.length > 0) {
        console.log(`Translation not used for ${locale}:`, missingKeys);
      }
    } catch (error) {
      console.error(`Error reading or parsing ${filePath}:`, error);
    }
  }
};

// Get locale from command-line arguments
const specificLocale = process.argv[2];

// Call compareKeys with the specificLocale if it's provided and part of the known locales
if (specificLocale && locales.includes(specificLocale)) {
  compareKeys(specificLocale);
} else {
  compareKeys();
}
