interface VpnCardProfileCellProps {
  profile: string | undefined;
}

export default function VpnCardProfileCell({ profile }: VpnCardProfileCellProps) {
  return (
    <td className="px-4 py-3">
      <span className="text-xs text-slate-500 truncate block max-w-[120px]" title={profile}>
        {profile || '—'}
      </span>
    </td>
  );
}
