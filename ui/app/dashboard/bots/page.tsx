import { Suspense } from "react";
import { BotList } from "@/components/dashboard/bot-list";
import { Spinner } from "@/components/dashboard/ui";

export default function DashboardHome() {
  return (
    <Suspense fallback={<Spinner />}>
      <BotList />
    </Suspense>
  );
}
