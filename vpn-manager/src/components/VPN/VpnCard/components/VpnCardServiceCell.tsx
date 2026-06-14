interface VpnCardServiceCellProps {
  service: string;
}

export default function VpnCardServiceCell({ service }: VpnCardServiceCellProps) {
  return (
    <td className="px-4 py-3">
      <span
        className={`text-2xs font-bold uppercase px-2 py-0.5 rounded-md
          ${service === 'sstp'
            ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400'
            : 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400'}`}
      >
        {service}
      </span>
    </td>
  );
}
