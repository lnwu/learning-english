"use client";

import { useLocalStorage } from "react-use";
import { makeAutoObservable } from "mobx";
import { useEffect } from "react";

class Words {
  static MAX_RANDOM_WORDS = 5;

  wordTranslations: Map<string, string> = new Map();
  userInputs: Map<string, string> = new Map();

  constructor() {
    makeAutoObservable(this);
  }

  setWords(words: [string, string][]) {
    this.wordTranslations = new Map(words);
  }

  addWord(word: string, translation: string) {
    this.wordTranslations.set(word, translation);
  }

  deleteWord(word: string) {
    this.wordTranslations.delete(word);
  }

  removeAllWords() {
    this.wordTranslations.clear();
  }

  setUserInput(word: string, value: string) {
    this.userInputs.set(word, value);
  }

  get correct() {
    const randomWords = this.getRandomWords();
    return this.userInputs.size === randomWords.length && Array.from(this.userInputs.entries()).every(([word, value]) => word === value);
  }

  get allWords(): Map<string, string> {
    const storedWords = localStorage.getItem("words");
    if (storedWords) {
      try {
        const parsedWords = JSON.parse(storedWords);
        return new Map(parsedWords);
      } catch {
        return new Map();
      }
    }
    return new Map();
  }

  getRandomWords(max: number = Words.MAX_RANDOM_WORDS): [string, string][] {
    const storedWords = Array.from(this.allWords.entries());
    if (storedWords.length > 0) {
      const shuffled = [...storedWords].sort(() => 0.5 - Math.random());
      return shuffled.slice(0, max);
    }
    return [];
  }
}

const words = new Words();

export const useWords = () => {
  const [storedWords, setStoredWords] = useLocalStorage<[string, string][]>("words", []);

  useEffect(() => {
    if (storedWords && words.wordTranslations.size === 0) {
      words.setWords(storedWords);
    }
  }, [storedWords]);

  const addWord = (word: string, translation: string) => {
    words.addWord(word, translation);
    setStoredWords(Array.from(words.wordTranslations.entries()));
  };

  const deleteWord = (word: string) => {
    words.deleteWord(word);
    setStoredWords(Array.from(words.wordTranslations.entries()));
  };

  const removeAllWords = () => {
    words.removeAllWords();
    setStoredWords([]);
  };

  return { words, addWord, deleteWord, removeAllWords };
};
