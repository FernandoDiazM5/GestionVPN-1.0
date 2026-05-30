export function BackgroundDecorations() {
  return (
    <>
      <div className="absolute top-0 left-0 w-96 h-96 bg-indigo-100 rounded-full -translate-x-1/2 -translate-y-1/2 opacity-60 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-100 rounded-full translate-x-1/2 translate-y-1/2 opacity-60 blur-3xl pointer-events-none" />
    </>
  );
}
