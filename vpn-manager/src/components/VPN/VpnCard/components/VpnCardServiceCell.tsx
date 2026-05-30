interface VpnCardServiceCellProps {
  service: string;
}

export default function VpnCardServiceCell({ service }: VpnCardServiceCellProps) {
  return (
    <td className="px-4 py-3">
      <span
        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md
          ${service === 'sstp'
            ? 'bg-blue-100 text-blue-700'
            : 'bg-violet-100 text-violet-700'}`}
      >
        {service}
      </span>
    </td>
  );
}
