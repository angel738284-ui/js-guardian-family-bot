import { Suspense } from "react";
import { AdminBots } from "@/components/admin/admin-bots";
import { Spinner } from "@/components/dashboard/ui";

export default function AdminBotsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <AdminBots />
    </Suspense>
  );
}
