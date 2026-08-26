"use client";

import { Button, Input } from "@/components/ui";
import { AddWordDialog } from "@/components/word-picker";
import { useRef, useState } from "react";
import Link from "next/link";
import { useFirestoreWords, useLocale, toast } from "@/hooks";
import { checkWordAddable } from "@/lib/wordSelection";

const Home = () => {
  const { words, loading: wordsLoading, error: wordsError } = useFirestoreWords();
  const { t } = useLocale();
  const [word, setWord] = useState("");
  const [pendingWord, setPendingWord] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const clear = () => {
    setWord("");
    inputRef.current?.focus();
  };

  const handleAddWord = () => {
    if (!word) return;

    const status = checkWordAddable(words, word);
    if (status === "exists") {
      toast({ title: t('addWord.wordExists').replace('{word}', word), variant: "destructive" });
      clear();
      return;
    }
    if (status === "invalid") {
      toast({ title: t('addWord.invalidChars').replace('{word}', word), variant: "destructive" });
      clear();
      return;
    }

    setPendingWord(word);
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
          <Button render={<Link href="/home" />} nativeButton={false}>
            {t('practiceHub.back')}
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-4">
      <form
        className="flex space-x-2"
        onSubmit={(e) => {
          e.preventDefault();
          handleAddWord();
        }}
      >
        <Input className="w-48" placeholder={t('addWord.word')} value={word} onChange={(e) => setWord(e.target.value.toLowerCase())} ref={inputRef} />
        <Button onClick={handleAddWord}>
          {t('addWord.add')}
        </Button>
        <Button render={<Link href="/home" />} nativeButton={false}>
          {t('practiceHub.back')}
        </Button>
        <Button render={<Link href="/profile" />} nativeButton={false}>
          {t('menu.profile')}
        </Button>
      </form>
      <AddWordDialog
        word={pendingWord}
        onClose={() => setPendingWord(null)}
        onFinished={() => {
          setPendingWord(null);
          clear();
        }}
      />
    </main>
  );
};

export default Home;
