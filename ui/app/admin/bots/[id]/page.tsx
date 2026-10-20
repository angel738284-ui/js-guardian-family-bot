import { Suspense } from "react";
import { BotView } from "@/components/dashboard/bot-view";
import { Spinner } from "@/components/dashboard/ui";

export default function AdminBotPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <BotView mode="admin" />
    </Suspense>
  );
}
