export interface ParsedTranslation {
  englishDefinition: string;
  chineseTranslation: string;
}

export const parseTranslation = (translation: string): ParsedTranslation => {
  const segments = translation
    .split("\n")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return { englishDefinition: "", chineseTranslation: "" };
  }

  if (segments.length === 1) {
    const single = segments[0];
    const hasChinese = /[\u4e00-\u9fff]/.test(single);
    return hasChinese
      ? { englishDefinition: "", chineseTranslation: single }
      : { englishDefinition: single, chineseTranslation: "" };
  }

  return {
    englishDefinition: segments[0],
    chineseTranslation: segments.slice(1).join("\n"),
  };
};
