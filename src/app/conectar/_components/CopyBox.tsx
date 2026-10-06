"use client";

import { useState } from "react";

interface Props {
  value:      string;
  /** Renderiza em bloco multilinha (monospace) em vez de campo inline. */
  multiline?: boolean;
  /** Rótulo do botão quando inline. Padrão: "Copiar". */
  label?:     string;
}

/**
 * Caixa com texto selecionável + botão "Copiar" que dá feedback visual.
 * Usada na página /conectar para a URL do conector e blocos de configuração.
 */
export default function CopyBox({ value, multiline = false, label = "Copiar" }: Props) {
  const [copied, setCopied] = useState(false);

  const copiar = () => {
    navigator.clipboard?.writeText(value)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })
      .catch(() => {});
  };

  if (multiline) {
    return (
      <div className="relative group">
        <pre className="bg-[#0f2820] text-[#c2e8df] rounded-lg p-4 pr-24 text-[11px] leading-relaxed font-mono overflow-x-auto whitespace-pre">
          {value}
        </pre>
        <button
          type="button"
          onClick={copiar}
          className="absolute top-3 right-3 text-[11px] font-semibold px-3 py-1.5 rounded-md bg-[#c2e8df] text-[#0f2820] hover:bg-white transition-colors"
        >
          {copied ? "✓ Copiado" : label}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-stretch gap-2">
      <code className="flex-1 min-w-0 bg-[#0f2820] text-[#c2e8df] rounded-lg px-4 py-3 text-sm font-mono overflow-x-auto whitespace-nowrap flex items-center select-all">
        {value}
      </code>
      <button
        type="button"
        onClick={copiar}
        className="shrink-0 text-xs font-bold px-4 rounded-lg bg-[#1a3a30] text-white hover:bg-[#0f2820] transition-colors"
      >
        {copied ? "✓ Copiado" : label}
      </button>
    </div>
  );
}
