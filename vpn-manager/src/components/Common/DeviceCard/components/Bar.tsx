function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden shadow-inner">
      <div className={`h-full rounded-full ${color} shadow-[0_0_8px_currentColor]`}
        style={{ width: `${pct}%`, transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)' }} />
    </div>
  );
}

export default Bar;
