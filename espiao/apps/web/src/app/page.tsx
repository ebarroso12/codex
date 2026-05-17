import React from "react";
import { RealtimeDashboard, type ConversationRow } from "../components/RealtimeDashboard";

const navItems = [
  "Dashboard",
  "Conversas",
  "Pacientes",
  "Colaboradores",
  "Analise IA",
  "Relatorios",
  "Auditoria"
];

const metrics = [
  { label: "Conversas auditadas", value: "1.284", delta: "+12% vs. semana" },
  { label: "Tempo medio resposta", value: "3m 42s", delta: "-18% vs. meta" },
  { label: "Conformidade", value: "91%", delta: "+4 pts" },
  { label: "Alertas IA abertos", value: "17", delta: "5 criticos" }
];

const initialConversations: ConversationRow[] = [
  {
    id: "conv-mock-1",
    patient: "Marina Costa",
    agent: "Ana Paula",
    channel: "Cloud API",
    status: "Em auditoria",
    score: 94,
    lastMessage: "Hoje, 10:42"
  },
  {
    id: "conv-mock-2",
    patient: "Roberto Lima",
    agent: "Diego Ramos",
    channel: "Cloud API",
    status: "Alerta",
    score: 61,
    lastMessage: "Hoje, 09:18"
  },
  {
    id: "conv-mock-3",
    patient: "Camila Rocha",
    agent: "Fernanda Alves",
    channel: "Cloud API",
    status: "Concluida",
    score: 88,
    lastMessage: "Ontem, 17:05"
  },
  {
    id: "conv-mock-4",
    patient: "Paulo Nunes",
    agent: "Lucas Vieira",
    channel: "Cloud API",
    status: "Pendente",
    score: 72,
    lastMessage: "Ontem, 15:31"
  }
];

const aiAlerts = [
  {
    title: "Possivel quebra de protocolo",
    detail: "Atendimento sem confirmacao final de consentimento.",
    level: "Critico"
  },
  {
    title: "Resposta com atraso",
    detail: "Tempo entre mensagens acima da meta configurada.",
    level: "Medio"
  },
  {
    title: "Sentimento negativo",
    detail: "Paciente demonstrou frustracao no fechamento.",
    level: "Medio"
  }
];

export default function HomePage() {
  return (
    <main className="shell">
      <aside className="sidebar" aria-label="Navegacao principal">
        <div className="brand">
          <span className="brandMark">WA</span>
          <span>Audit SaaS</span>
        </div>
        <nav className="sidebarNav">
          {navItems.map((item) => (
            <a className={item === "Dashboard" ? "active" : ""} href="#" key={item}>
              {item}
            </a>
          ))}
        </nav>
        <div className="sidebarFooter">
          <span>Ambiente</span>
          <strong>Realtime ativo</strong>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Operacao de qualidade</p>
            <h1>Dashboard de auditoria WhatsApp</h1>
            <p>Conexao em tempo real via Meta Cloud API oficial.</p>
          </div>
          <div className="topbarActions">
            <span className="status">Cloud API oficial</span>
            <button type="button">Exportar relatorio</button>
          </div>
        </header>

        <section className="metrics" aria-label="Resumo operacional">
          {metrics.map((metric) => (
            <article className="metricCard" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.delta}</small>
            </article>
          ))}
        </section>

        <section className="dashboardGrid">
          <section className="panel conversationsPanel">
            <div className="panelHeader">
              <div>
                <h2>Conversas recentes</h2>
                <p>Atualiza em tempo real quando novas mensagens chegam.</p>
              </div>
              <button type="button" className="ghostButton">
                Ver todas
              </button>
            </div>

            <RealtimeDashboard
              initialConversations={initialConversations}
              initialActiveCount={initialConversations.length}
            />
          </section>

          <aside className="panel alertsPanel" aria-label="Alertas IA">
            <div className="panelHeader">
              <div>
                <h2>Alertas IA</h2>
                <p>Prioridades simuladas para triagem.</p>
              </div>
            </div>
            <div className="alertsList">
              {aiAlerts.map((alert) => (
                <article className="alertItem" key={alert.title}>
                  <div>
                    <strong>{alert.title}</strong>
                    <p>{alert.detail}</p>
                  </div>
                  <span>{alert.level}</span>
                </article>
              ))}
            </div>
          </aside>
        </section>
      </section>
    </main>
  );
}
