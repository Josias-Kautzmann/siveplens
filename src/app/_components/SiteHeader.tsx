"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/painel",   label: "Painel"        },
  { href: "/analise",  label: "Análise"       },
  { href: "/noticias", label: "Notícias"      },
  { href: "/docs",     label: "Documentação"  },
  { href: "/conectar", label: "Conectar"      },
];

/**
 * Header global do app (não usado na landing, que tem nav própria).
 * Slot opcional `right` para informação contextual (ex: frescor dos dados).
 */
export default function SiteHeader({ right }: { right?: React.ReactNode }) {
  const pathname = usePathname();
  const eramiaActive = pathname.startsWith("/artigo/eramia-2026");

  return (
    <header className="sticky top-0 z-40 border-b border-[#c5ddd6] bg-[#f4fbf8]/85 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-3 sm:px-5 h-14 flex items-center gap-2 sm:gap-3 overflow-hidden">

        {/* Marca */}
        <Link href="/" className="flex items-center gap-2 shrink-0 group" aria-label="Início">
          <span className="w-7 h-7 rounded-md bg-[#1a3a30] flex items-center justify-center shrink-0 transition-transform group-hover:scale-105">
            <svg viewBox="0 0 16 16" className="w-4 h-4">
              <circle cx="4"  cy="4"  r="2" fill="#c2e8df" />
              <circle cx="12" cy="4"  r="2" fill="#c2e8df" />
              <circle cx="4"  cy="12" r="2" fill="#c2e8df" />
              <circle cx="12" cy="12" r="2" fill="#c2e8df" />
              <line x1="4" y1="4" x2="12" y2="12" stroke="#c2e8df" strokeWidth="1.2" />
              <line x1="12" y1="4" x2="4" y2="12" stroke="#c2e8df" strokeWidth="1.2" />
            </svg>
          </span>
          <span className="text-sm font-bold tracking-wide text-[#1a3a30] hidden sm:block whitespace-nowrap">
            SivepLens
          </span>
        </Link>

        {/* Navegação */}
        <nav className="flex min-w-0 flex-1 items-center gap-1 ml-1 overflow-x-auto no-scrollbar">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  active
                    ? "bg-[#1a3a30] text-white"
                    : "text-[#555770] hover:bg-[#eaf5f1] hover:text-[#1a3a30]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Contexto e chamada acadêmica à direita */}
        {right && (
          <div className="pl-3 text-[11px] text-[#94A3B8] hidden xl:block text-right leading-tight shrink-0">
            {right}
          </div>
        )}

        <Link
          href="/artigo/eramia-2026"
          aria-label="Abrir artefato científico da ERAMIA-RS 2026"
          className={`ml-auto inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] transition-all sm:px-4 ${
            eramiaActive
              ? "border-[#1a3a30] bg-[#1a3a30] text-white shadow-sm"
              : "border-[#9fc9bc] bg-[#def1eb] text-[#1a3a30] hover:-translate-y-px hover:border-[#1a3a30] hover:bg-white hover:shadow-sm"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${eramiaActive ? "bg-[#bfe8dc]" : "bg-[#2f7d65]"}`} />
          <span className="hidden sm:inline">ERAMIA-RS 2026</span>
          <span className="sm:hidden">ERAMIA</span>
        </Link>
      </div>
    </header>
  );
}
