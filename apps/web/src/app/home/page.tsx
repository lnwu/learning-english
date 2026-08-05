"use client";

import { Button } from "@/components/ui";
import { useLocale } from "@/hooks";
import Link from "next/link";

const Home = () => {
  const { t } = useLocale();

  const cards = [
    {
      href: "/words",
      title: t("practiceHub.words.title"),
      description: t("practiceHub.words.description"),
      icon: "✍️",
    },
    {
      href: "/sentence",
      title: t("practiceHub.sentence.title"),
      description: t("practiceHub.sentence.description"),
      icon: "💬",
    },
  ];

  return (
    <main className="w-full max-w-3xl px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold">{t("practiceHub.title")}</h1>
        <p className="text-gray-500 mt-2">{t("practiceHub.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group rounded-xl border p-6 flex flex-col items-center text-center transition-all hover:border-blue-500 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <div className="text-4xl mb-3" aria-hidden>
              {card.icon}
            </div>
            <h2 className="text-lg font-semibold group-hover:text-blue-600">{card.title}</h2>
            <p className="text-sm text-gray-500 mt-2">{card.description}</p>
          </Link>
        ))}
      </div>

      <div className="flex justify-center mt-8">
        <Link href="/add-word">
          <Button type="button" variant="outline">
            {t("addWord.title")}
          </Button>
        </Link>
      </div>
    </main>
  );
};

export default Home;
