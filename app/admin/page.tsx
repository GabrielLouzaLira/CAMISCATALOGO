import { getAdminData } from "@/db/store";
import { requireAdminPage } from "@/lib/admin-auth";
import Link from "next/link";
import AdminDashboard from "./admin-dashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const access = await requireAdminPage();

  let data;
  try {
    data = await getAdminData();
  } catch (error) {
    return (
      <main className="admin-access">
        <div className="admin-access-card">
          <span className="admin-mark">10</span>
          <p className="eyebrow">Área administrativa</p>
          <h1>Painel em preparação</h1>
          <p>
            {error instanceof Error
              ? error.message
              : "Não foi possível conectar ao banco da loja."}
          </p>
          <Link className="button button-outline" href="/">
            Voltar para a loja
          </Link>
        </div>
      </main>
    );
  }
  return (
    <AdminDashboard
      initialData={data}
      user={{
        displayName: access.user.displayName,
        email: access.user.email,
      }}
      signOutUrl="/api/admin-auth/logout"
    />
  );
}
