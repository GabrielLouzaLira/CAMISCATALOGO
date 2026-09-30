import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; config?: string }>;
}) {
  const query = await searchParams;
  return (
    <main className="admin-access">
      <div className="admin-access-card">
        <span className="admin-mark">10</span>
        <p className="eyebrow">Área administrativa</p>
        <h1>Entrar no painel</h1>
        <p>Use o usuário e a senha definidos pelo responsável pela loja.</p>
        {query.config && <p className="form-error">O acesso do painel ainda não foi configurado.</p>}
        {query.error && <p className="form-error">E-mail ou senha incorretos.</p>}
        <form className="admin-login-form" action="/api/admin-auth/login" method="post">
          <label>
            <span>Usuário</span>
            <input name="email" type="text" autoComplete="username" required />
          </label>
          <label>
            <span>Senha</span>
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button className="button button-gold" type="submit">Entrar</button>
        </form>
        <Link className="button button-outline" href="/">Voltar para a loja</Link>
      </div>
    </main>
  );
}
