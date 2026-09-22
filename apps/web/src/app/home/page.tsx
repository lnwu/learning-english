"use client";

import { useLocale } from "@/hooks";
import Link from "next/link";
import { MessageSquareIcon, PenLineIcon } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  PageContainer,
  PageHeader,
} from "@/components/ui";

const Home = () => {
  const { t } = useLocale();

  const cards = [
    {
      href: "/words",
      title: t("practiceHub.words.title"),
      description: t("practiceHub.words.description"),
      Icon: PenLineIcon,
    },
    {
      href: "/sentence",
      title: t("practiceHub.sentence.title"),
      description: t("practiceHub.sentence.description"),
      Icon: MessageSquareIcon,
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        className="mb-6"
        title={t("practiceHub.title")}
        description={t("practiceHub.subtitle")}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {cards.map(({ href, title, description, Icon }) => (
          <Link
            key={href}
            href={href}
            className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Card className="h-full transition-colors hover:bg-muted/40">
              <CardHeader>
                <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="size-4" />
                </span>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </PageContainer>
  );
};

export default Home;
