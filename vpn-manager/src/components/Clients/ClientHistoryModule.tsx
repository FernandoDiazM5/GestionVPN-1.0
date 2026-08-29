import {
  BookOpenText,
  Bot,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";
import TelegramForums from "../Settings/ModeratorSettings/tabs/TelegramForums";

const COMMANDS = [
  {
    command: "/informacion",
    description:
      "Muestra identificación, contacto y dirección del cliente del tema.",
  },
  {
    command: "/servicios",
    description:
      "Consulta los servicios, plan, nodo, estado técnico y datos permitidos.",
  },
  {
    command: "/facturacion",
    description: "Muestra facturas pendientes y deuda total del cliente.",
  },
  {
    command: "/ayuda",
    description: "Explica los comandos disponibles dentro del tema.",
  },
  {
    command: "/registrartema ID_CLIENTE",
    description: "Vincula un tema existente con un cliente de MikroWisp.",
  },
];

export default function ClientHistoryModule() {
  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-violet-50 p-2.5 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300">
            <BookOpenText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              Historial de clientes
            </h1>
            <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
              Organiza los grupos privados de Telegram y los temas asociados a
              cada cliente. Joinpoint consulta MikroWisp en el momento y no
              guarda conversaciones.
            </p>
          </div>
        </div>
      </header>

      <section
        className="rounded-2xl border border-violet-200 bg-white p-3 shadow-sm dark:border-violet-800/60 dark:bg-slate-900 sm:p-5"
        aria-labelledby="telegram-groups-heading"
      >
        <div className="mb-4 flex items-start gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
          <Bot className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" />
          <div>
            <h2
              id="telegram-groups-heading"
              className="text-base font-bold text-slate-900 dark:text-white"
            >
              Grupos y temas de Telegram
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              Selecciona un grupo para administrar sus temas, participantes o
              vincular un grupo nuevo.
            </p>
          </div>
        </div>
        <TelegramForums standalone />
      </section>

      <section
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-5"
        aria-labelledby="commands-heading"
      >
        <div className="flex items-start gap-3">
          <MessageSquareText className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
          <div>
            <h2
              id="commands-heading"
              className="text-base font-bold text-slate-900 dark:text-white"
            >
              Comandos disponibles
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              Úsalos dentro del tema correspondiente al cliente.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {COMMANDS.map((item) => (
            <div
              key={item.command}
              className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"
            >
              <code className="text-sm font-bold text-indigo-700 dark:text-indigo-300">
                {item.command}
              </code>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {item.description}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Sólo participantes activos del grupo pueden consultar los datos
            permitidos del cliente.
          </span>
        </div>
      </section>
    </div>
  );
}
