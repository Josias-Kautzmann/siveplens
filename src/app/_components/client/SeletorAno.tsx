"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface SeletorAnoProps {
  anos: number[];
  anoAtivo: number | null;
}

export default function SeletorAno({ anos, anoAtivo }: SeletorAnoProps) {
  const router      = useRouter();
  const searchParams = useSearchParams();

  function selecionar(ano: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("ano", String(ano));
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex gap-1">
      {anos.map((ano) => (
        <button
          key={ano}
          onClick={() => selecionar(ano)}
          className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
            anoAtivo === ano
              ? "bg-[#1a3a30] border-[#1a3a30] text-white"
              : "bg-white border-[#c5ddd6] text-[#555770] hover:border-[#1a3a30] hover:text-[#1a3a30]"
          }`}
        >
          {ano}
        </button>
      ))}
    </div>
  );
}
