"use client";

import { Input, Button } from "@/components/ui";
import { useRef, useState } from "react";
import Link from "next/link";
import { useFirestoreWords, useLocale } from "@/hooks";

const Home = () => {
  const { words, addWord, loading: wordsLoading, error: wordsError } = useFirestoreWords();
  const { t } = useLocale();
  const [word, setWord] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const clear = () => {
    setWord("");
    inputRef.current?.focus();
  };

  // Fallback dictionary for common English words
  const fallbackDictionary: Record<string, string> = {
    hello: "你好",
    world: "世界",
    love: "爱",
    water: "水",
    food: "食物",
    house: "房子",
    car: "汽车",
    book: "书",
    computer: "电脑",
    friend: "朋友",
    family: "家庭",
    work: "工作",
    school: "学校",
    time: "时间",
    money: "钱",
    happy: "快乐",
    good: "好",
    bad: "坏",
    big: "大",
    small: "小",
  };

  const translateToChinese = async (word: string): Promise<string | null> => {
    try {
      // Try Google Translate API first
      const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(word)}`);

      if (!response.ok) {
        throw new Error("Translation failed");
      }

      const data = await response.json();
      const translation = data[0][0][0];

      if (translation && translation !== word) {
        return translation;
      }
      throw new Error("No translation found");
    } catch (error) {
      console.error("Translation API error:", error);
      // Fallback to local dictionary
      return fallbackDictionary[word.toLowerCase()] || null;
    }
  };

  const getEnglishDefinition = async (word: string): Promise<string | null> => {
    try {
      const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
      if (!response.ok) {
        throw new Error("Word not found");
      }
      const data = await response.json();
      return data.length > 0 ? data[0].meanings[0].definitions[0].definition : null;
    } catch {
      return null;
    }
  };

  const validateWord = async (word: string): Promise<boolean> => {
    try {
      const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
      if (!response.ok) {
        throw new Error("Word not found");
      }
      const data = await response.json();
      return data.length > 0;
    } catch {
      return false;
    }
  };

  const handleAddWord = async () => {
    if (!word) return;

    setLoading(true);

    const existingWord = words.allWords.has(word);
    if (existingWord) {
      alert(t('addWord.wordExists').replace('{word}', word));
      clear();
      setLoading(false);
      return;
    }

    const isValidWord = /^[a-zA-Z]+$/.test(word);
    if (!isValidWord) {
      alert(t('addWord.invalidChars').replace('{word}', word));
      clear();
      setLoading(false);
      return;
    }

    const isValidEnglishWord = await validateWord(word);
    if (!isValidEnglishWord) {
      alert(t('addWord.notRecognized').replace('{word}', word));
      clear();
      setLoading(false);
      return;
    }

    const chineseTranslation = await translateToChinese(word);
    const englishDefinition = await getEnglishDefinition(word);

    let combinedTranslation = "";
    if (chineseTranslation && englishDefinition) {
      combinedTranslation = `${englishDefinition}\n${chineseTranslation}`;
    } else if (chineseTranslation) {
      combinedTranslation = chineseTranslation;
    } else if (englishDefinition) {
      combinedTranslation = englishDefinition;
    } else {
      alert(t('addWord.translationFailed').replace('{word}', word));
      clear();
      setLoading(false);
      return;
    }

    try {
      await addWord(word, combinedTranslation);
      // Success - just clear the input, no alert needed
      clear();
    } catch (error) {
      console.error("Failed to add word:", error);
      alert(t('addWord.addFailed') + error);
    } finally {
      setLoading(false);
    }
  };

  if (wordsLoading) {
    return (
      <main className="space-y-4">
        <div className="text-center">{t('common.loading')}</div>
      </main>
    );
  }

  if (wordsError) {
    return (
      <main className="space-y-4">
        <div className="text-center text-red-500">{t('common.error')}: {wordsError}</div>
        <div className="text-center">
          <Link href="/">
            <Button>{t('addWord.goHome')}</Button>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-4">
      <form className="flex space-x-2" onSubmit={(e) => e.preventDefault()}>
        <Input className="w-48" placeholder={t('addWord.word')} value={word} onChange={(e) => setWord(e.target.value.toLowerCase())} ref={inputRef} />
        <Button onClick={handleAddWord} disabled={loading}>
          {t('addWord.add')}
        </Button>
        <Link href="/">
          <Button type="button">{t('addWord.home')}</Button>
        </Link>
        <Link href="/profile">
          <Button type="button">{t('menu.profile')}</Button>
        </Link>
      </form>
    </main>
  );
};

export default Home;
