export function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex-1 rounded-xl bg-[#f7f7f7] p-4 text-center">
      <p className="mb-1 text-xs text-[#666]">{label}</p>
      <p className="text-2xl font-bold text-ink">{value}</p>
    </div>
  );
}
