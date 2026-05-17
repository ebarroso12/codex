import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomePage from "./page";

describe("HomePage", () => {
  it("renders the dashboard shell", () => {
    const html = renderToString(<HomePage />);

    expect(html).toContain("Dashboard de auditoria WhatsApp");
    expect(html).toContain("Conversas recentes");
    expect(html).toContain("Alertas IA");
  });
});
