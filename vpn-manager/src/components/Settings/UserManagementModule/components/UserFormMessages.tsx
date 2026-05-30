interface UserFormMessagesProps {
  errorMsg: string;
}

export function UserFormMessages({ errorMsg }: UserFormMessagesProps) {
  if (!errorMsg) return null;

  return (
    <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm font-bold rounded-lg">
      {errorMsg}
    </div>
  );
}
