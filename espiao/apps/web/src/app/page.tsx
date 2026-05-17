import React from "react";

const modules = [
  "Atendimentos",
  "Mensagens",
  "Pacientes",
  "Colaboradores",
  "Análise IA",
  "Relatórios",
  "Logs de auditoria"
];

export default function HomePage() {
  return (
    <main className="shell">
      <aside className="sidebar" aria-label="Navegação principal">
        <div className="brand">WhatsApp Audit</div>
        <nav>
          {modules.map((moduleName) => (
            <a href="#" key={moduleName}>
              {moduleName}
            </a>
          ))}
        </nav>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <h1>Auditoria de atendimentos</h1>
            <p>Base SaaS preparada para Meta WhatsApp Business Cloud API oficial.</p>
          </div>
          <span className="status">Cloud API only</span>
        </header>

        <section className="metrics" aria-label="Resumo operacional">
          <article>
            <span>Conversas pendentes</span>
            <strong>0</strong>
          </article>
          <article>
            <span>Análises na fila</span>
            <strong>0</strong>
          </article>
          <article>
            <span>Alertas críticos</span>
            <strong>0</strong>
          </article>
        </section>

        <section className="panel">
          <h2>Estrutura inicial</h2>
          <p>
            O produto ainda não implementa os fluxos finais. Esta tela valida o shell do
            dashboard, enquanto a API expõe módulos, autenticação JWT/RBAC, Prisma, BullMQ,
            Redis e integração preparada com OpenAI GPT-4.1 mini.
          </p>
        </section>
      </section>
    </main>
  );
}
