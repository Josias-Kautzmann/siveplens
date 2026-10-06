interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  highlight?: boolean;
}

export default function KpiCard({ label, value, sub, highlight }: KpiCardProps) {
  return (
    <div className={`rounded-xl border px-6 py-5 flex flex-col gap-1 shadow-sm ${
      highlight
        ? "bg-[#1a3a30] border-[#1a3a30] text-white"
        : "bg-white border-[#c5ddd6] text-[#1C1C1C]"
    }`}>
      <span className={`text-xs font-semibold uppercase tracking-wide ${
        highlight ? "text-[#a8d5c7]" : "text-[#555770]"
      }`}>
        {label}
      </span>
      <span className={`text-3xl font-bold tabular-nums ${
        highlight ? "text-white" : "text-[#1a3a30]"
      }`}>
        {value}
      </span>
      {sub && (
        <span className={`text-xs ${highlight ? "text-[#a8d5c7]" : "text-[#555770]"}`}>
          {sub}
        </span>
      )}
    </div>
  );
}
