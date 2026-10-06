"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const TOOLS = [
  { href: "/analise/descritiva", label: "Exploração Descritiva", icon: "Σ", desc: "Médias, frequências e ausências" },
  { href: "/analise/associacao", label: "Associação Bivariada",   icon: "χ²", desc: "Qui-quadrado, OR, RR, Fisher"   },
  { href: "/analise/piramide",   label: "Pirâmide Etária",        icon: "▦",  desc: "Distribuição por idade e sexo"  },
  { href: "/analise/perfil",     label: "Perfil Sintomatológico", icon: "☰",  desc: "Prevalência de sintomas"        },
  { href: "/analise/regressao",  label: "Regressão Logística",    icon: "β",  desc: "aOR · IC 95% · Forest Plot"    },
  { href: "/analise/anomalias",  label: "Detecção de Anomalias",  icon: "Λ",  desc: "Picos atípicos na série (z-score)" },
];

export default function AnaliseIsland() {
  const pathname = usePathname();
  const sp       = useSearchParams();

  function toolHref(base: string) {
    const q = sp.toString();
    return q ? `${base}?${q}` : base;
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 group/island select-none">
      <div
        className="
          flex items-center gap-1
          bg-[#0f2820]/96 backdrop-blur-xl
          border border-white/10
          shadow-[0_8px_40px_rgba(15,40,32,0.55)]
          rounded-full transition-all duration-300 ease-out
          group-hover/island:rounded-2xl
          px-2 py-2
          group-hover/island:px-2.5 group-hover/island:py-2.5
        "
      >
        {TOOLS.map((tool) => {
          const isActive = pathname.startsWith(tool.href);
          return (
            <Link
              key={tool.href}
              href={toolHref(tool.href)}
              className={`
                flex items-center rounded-full
                group-hover/island:rounded-xl
                transition-all duration-300 ease-out
                p-0.5
                group-hover/island:p-1.5
                ${isActive ? "bg-white/15" : "hover:bg-white/10"}
              `}
            >
              {/* Ícone — sempre visível */}
              <span
                className={`
                  w-9 h-9 flex items-center justify-center shrink-0
                  text-sm font-bold rounded-full
                  transition-all duration-300
                  ${isActive ? "bg-[#dff0ea] text-[#0f2820]" : "text-[#a8d5c7]"}
                `}
              >
                {tool.icon}
              </span>

              {/* Texto — revela ao hover via max-width */}
              <div
                className="
                  overflow-hidden
                  max-w-0 group-hover/island:max-w-[180px]
                  opacity-0 group-hover/island:opacity-100
                  transition-all duration-300 ease-out
                "
              >
                <div className="pl-2.5 pr-0.5">
                  <div className={`text-xs font-semibold whitespace-nowrap leading-tight ${isActive ? "text-white" : "text-[#c2e8df]"}`}>
                    {tool.label}
                  </div>
                  <div className="text-[10px] text-[#4a9a80] whitespace-nowrap leading-tight mt-0.5">
                    {tool.desc}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
