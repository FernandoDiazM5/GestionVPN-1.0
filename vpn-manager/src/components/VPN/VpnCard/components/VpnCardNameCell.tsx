interface VpnCardNameCellProps {
  name: string;
}

export default function VpnCardNameCell({ name }: VpnCardNameCellProps) {
  return (
    <td className="px-4 py-3 min-w-[160px]">
      <p className="font-semibold text-slate-800 text-xs truncate max-w-[220px]" title={name}>
        {name}
      </p>
    </td>
  );
}
