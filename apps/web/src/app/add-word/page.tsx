"use client";

import { Input, Button } from "@/components/ui";
import { useRef, useState } from "react";
import Link from "next/link";
import { useFirestoreWords, useLocale, toast } from "@/hooks";
import { auth } from "@/lib/firebase";

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

  const handleAddWord = async () => {
    if (!word) return;

    setLoading(true);

    if (words.allWords.has(word)) {
      toast({ title: t('addWord.wordExists').replace('{word}', word), variant: "destructive" });
      clear();
      setLoading(false);
      return;
    }

    if (!/^[a-zA-Z]+$/.test(word)) {
      toast({ title: t('addWord.invalidChars').replace('{word}', word), variant: "destructive" });
      clear();
      setLoading(false);
      return;
    }

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error(t('error.notAuthenticated'));
      }

      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ word }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data && typeof data.error === 'string' ? data.error : t('addWord.addFailed'));
      }

      const { chineseTranslation, englishDefinition } = data as {
        chineseTranslation: string | null;
        englishDefinition: string | null;
      };

      if (!englishDefinition) {
        toast({ title: t('addWord.notRecognized').replace('{word}', word), variant: "destructive" });
        clear();
        setLoading(false);
        return;
      }

      const combinedTranslation = chineseTranslation
        ? `${englishDefinition}\n${chineseTranslation}`
        : englishDefinition;

      await addWord(word, combinedTranslation);
      clear();
    } catch (error) {
      console.error("Failed to add word:", error);
      toast({ title: error instanceof Error ? error.message : t('addWord.addFailed'), variant: "destructive" });
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
          <Button asChild>
            <Link href="/home">{t('practiceHub.back')}</Link>
          </Button>
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
        <Button asChild type="button">
          <Link href="/home">{t('practiceHub.back')}</Link>
        </Button>
        <Button asChild type="button">
          <Link href="/profile">{t('menu.profile')}</Link>
        </Button>
      </form>
    </main>
  );
};

export default Home;
