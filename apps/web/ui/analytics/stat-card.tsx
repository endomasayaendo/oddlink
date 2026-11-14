export function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex-1 rounded-wobble border-2 border-ink bg-paper-light p-4 text-center shadow-offset">
      <p className="mb-1 text-xs text-ink-muted">{label}</p>
      <p className="font-display text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}
