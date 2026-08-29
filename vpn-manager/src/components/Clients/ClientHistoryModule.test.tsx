import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../Settings/ModeratorSettings/tabs/TelegramForums", () => ({
  default: ({ standalone }: { standalone?: boolean }) => (
    <div data-testid="telegram-forums">standalone:{String(standalone)}</div>
  ),
}));

import ClientHistoryModule from "./ClientHistoryModule";

describe("ClientHistoryModule", () => {
  it("presenta grupos y comandos como módulo independiente", () => {
    render(<ClientHistoryModule />);

    expect(
      screen.getByRole("heading", { name: "Historial de clientes" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Grupos y temas de Telegram" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("telegram-forums")).toHaveTextContent(
      "standalone:true",
    );
    expect(screen.getByText("/informacion")).toBeInTheDocument();
    expect(screen.getByText("/servicios")).toBeInTheDocument();
    expect(screen.getByText("/facturacion")).toBeInTheDocument();
    expect(screen.getByText("/ayuda")).toBeInTheDocument();
    expect(screen.getByText("/registrartema ID_CLIENTE")).toBeInTheDocument();
  });
});
