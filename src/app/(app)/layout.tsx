import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { logoutAction } from "@/features/authentication/actions";
import { getCurrentUser } from "@/server/security/session";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <AppShell email={user.email} logoutAction={logoutAction}>
      {children}
    </AppShell>
  );
}
