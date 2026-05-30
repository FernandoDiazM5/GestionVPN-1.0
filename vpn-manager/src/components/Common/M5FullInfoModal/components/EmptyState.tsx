import { EMPTY_STATE_MESSAGE } from '../constants';

export default function EmptyState() {
  return <div className="text-center py-8 text-slate-400 text-sm">{EMPTY_STATE_MESSAGE}</div>;
}
