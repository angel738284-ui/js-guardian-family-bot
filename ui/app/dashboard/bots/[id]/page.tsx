import { Suspense } from "react";
import { BotView } from "@/components/dashboard/bot-view";
import { Spinner } from "@/components/dashboard/ui";

export default function BotPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <BotView mode="user" />
    </Suspense>
  );
}
