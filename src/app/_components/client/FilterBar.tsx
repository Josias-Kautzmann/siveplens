"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  CLASSIFICACOES,
  EVOLUCOES,
  PATOGENOS,
  parseFilters,
  countActiveFilters,
} from "@/lib/filter-utils";
import { IBGE_TO_SIGLA } from "@/lib/constants";
import type { MunNames } from "@/lib/types";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const UF_LIST = [
  { sigla: "AC", nome: "Acre" },
  { sigla: "AL", nome: "Alagoas" },
  { sigla: "AP", nome: "Amapá" },
  { sigla: "AM", nome: "Amazonas" },
  { sigla: "BA", nome: "Bahia" },
  { sigla: "CE", nome: "Ceará" },
  { sigla: "DF", nome: "Distrito Federal" },
  { sigla: "ES", nome: "Espírito Santo" },
  { sigla: "GO", nome: "Goiás" },
  { sigla: "MA", nome: "Maranhão" },
  { sigla: "MT", nome: "Mato Grosso" },
  { sigla: "MS", nome: "Mato Grosso do Sul" },
  { sigla: "MG", nome: "Minas Gerais" },
  { sigla: "PA", nome: "Pará" },
  { sigla: "PB", nome: "Paraíba" },
  { sigla: "PR", nome: "Paraná" },
  { sigla: "PE", nome: "Pernambuco" },
  { sigla: "PI", nome: "Piauí" },
  { sigla: "RJ", nome: "Rio de Janeiro" },
  { sigla: "RN", nome: "Rio Grande do Norte" },
  { sigla: "RS", nome: "Rio Grande do Sul" },
  { sigla: "RO", nome: "Rondônia" },
  { sigla: "RR", nome: "Roraima" },
  { sigla: "SC", nome: "Santa Catarina" },
  { sigla: "SP", nome: "São Paulo" },
  { sigla: "SE", nome: "Sergipe" },
  { sigla: "TO", nome: "Tocantins" },
];

function VDivider() {
  return <div className="hidden sm:block w-px h-5 bg-[#c5ddd6] shrink-0" />;
}

interface FilterBarProps {
  anos: number[];
  anoAtivo?: number;
}

export default function FilterBar({ anos, anoAtivo }: FilterBarProps) {
  const router   = useRouter();
  const sp       = useSearchParams();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const filtros     = parseFilters(Object.fromEntries(sp.entries()));
  const activeCount = countActiveFilters(filtros);

  // ── Selected anos (multi) from URL, fallback to anoAtivo prop ───────────
  const selectedAnos: number[] =
    filtros.anos_epi?.length ? filtros.anos_epi
    : filtros.ano_epi        ? [filtros.ano_epi]
    : anoAtivo               ? [anoAtivo]
    : anos.length            ? [anos.at(-1)!]
    : [];

  // ── Ano dropdown + debounce (multi-select) ────────────────────────────────
  // pendingAnos: selection being edited — null = nothing uncommitted
  const [anoOpen, setAnoOpen]           = useState(false);
  const [pendingAnos, setPendingAnos]   = useState<number[] | null>(null);
  const anoRef                          = useRef<HTMLDivElement>(null);
  const spRef                           = useRef(sp);

  useEffect(() => {
    spRef.current = sp;
  }, [sp]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (anoRef.current && !anoRef.current.contains(e.target as Node)) setAnoOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // 1000ms after last year click → navigate (no loading indicator until then)
  useEffect(() => {
    if (pendingAnos === null) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(spRef.current.toString());
      next.set("anos", pendingAnos.join(","));
      next.delete("ano");
      if (pendingAnos.length !== 1) {
        next.delete("data_ini");
        next.delete("data_fim");
      }
      startTransition(() => {
        router.push(`${pathname}?${next.toString()}`, { scroll: false });
      });
      setPendingAnos(null);
    }, 1000);
    return () => clearTimeout(timer);
  }, [pendingAnos, pathname, router]);

  // what to display in the button and dropdown while editing
  const displayAnos = pendingAnos ?? selectedAnos;
  const displayLabel =
    displayAnos.length === 0   ? String(anos.at(-1) ?? "")
    : displayAnos.length === 1 ? String(displayAnos[0])
    : displayAnos.length <= 3  ? displayAnos.join(" · ")
    : `${displayAnos.length} anos`;

  function togglePendingAno(ano: number) {
    const current = pendingAnos ?? selectedAnos;
    // keep at least one year always selected
    if (current.includes(ano) && current.length === 1) return;
    const next = current.includes(ano)
      ? current.filter(a => a !== ano)
      : [...current, ano].sort((a, b) => a - b);
    setPendingAnos(next);
  }

  // ── UF dropdown ───────────────────────────────────────────────────────────
  const [ufOpen, setUfOpen] = useState(false);
  const ufRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ufRef.current && !ufRef.current.contains(e.target as Node)) setUfOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // ── Município search ──────────────────────────────────────────────────────
  const [munNames, setMunNames]     = useState<MunNames>({});
  const [munSearch, setMunSearch]   = useState("");
  const [munOpen, setMunOpen]       = useState(false);
  const munRef                      = useRef<HTMLDivElement>(null);
  const munLoadedRef                = useRef(false);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (munRef.current && !munRef.current.contains(e.target as Node)) setMunOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    if (munLoadedRef.current) return;
    const needLoad = munSearch.length >= 2 || (filtros.co_mun_res?.length ?? 0) > 0;
    if (needLoad) {
      munLoadedRef.current = true;
      fetch("/data/mun-names.json").then(r => r.json()).then(setMunNames).catch(() => {});
    }
  }, [munSearch, filtros.co_mun_res?.length]);

  // ── Idade dropdown ───────────────────────────────────────────────────────
  const [idadeOpen, setIdadeOpen] = useState(false);
  const idadeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (idadeRef.current && !idadeRef.current.contains(e.target as Node)) setIdadeOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const idadeLabel = (() => {
    if (!filtros.faixa_etaria) return "Idade";
    const [min, max] = parseFaixaToSlider(filtros.faixa_etaria);
    return max === 100 ? `${min}+ anos` : `${min}–${max} anos`;
  })();

  // ── Classificação dropdown ──────────────────────────────────────────────
  const [classiOpen, setClassiOpen] = useState(false);
  const classiRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (classiRef.current && !classiRef.current.contains(e.target as Node)) setClassiOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // ── Desfecho dropdown ───────────────────────────────────────────────────
  const [desfechoOpen, setDesfechoOpen] = useState(false);
  const desfechoRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (desfechoRef.current && !desfechoRef.current.contains(e.target as Node)) setDesfechoOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // ── Etiologia dropdown ──────────────────────────────────────────────────
  const [etioOpen, setEtioOpen] = useState(false);
  const etioRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (etioRef.current && !etioRef.current.contains(e.target as Node)) setEtioOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // ── Age slider ────────────────────────────────────────────────────────────
  function parseFaixaToSlider(faixa: string | undefined): [number, number] {
    if (!faixa) return [0, 100];
    if (faixa === "80+") return [80, 100];
    const parts = faixa.split("-").map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]))
      return [Math.max(0, Math.min(100, parts[0])), Math.max(0, Math.min(100, parts[1]))];
    return [0, 100];
  }

  const [sliderMin, setSliderMin] = useState(() => parseFaixaToSlider(filtros.faixa_etaria)[0]);
  const [sliderMax, setSliderMax] = useState(() => parseFaixaToSlider(filtros.faixa_etaria)[1]);
  const sliderMinRef = useRef(sliderMin);
  const sliderMaxRef = useRef(sliderMax);

  useEffect(() => {
    sliderMinRef.current = sliderMin;
    sliderMaxRef.current = sliderMax;
  }, [sliderMin, sliderMax]);

  useEffect(() => {
    const [min, max] = parseFaixaToSlider(filtros.faixa_etaria);
    // Estado local do controle precisa acompanhar mudanças feitas pela URL/presets.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSliderMin(min);
    setSliderMax(max);
  }, [filtros.faixa_etaria]);

  // ── Month range (inside ano dropdown) ────────────────────────────────────
  function parseDateToMonth(ddmm: string | undefined): number | null {
    if (!ddmm) return null;
    const parts = ddmm.split("-");
    const m = parseInt(parts[1]);
    return parts.length === 2 && m >= 1 && m <= 12 ? m : null;
  }

  const [localMonthStart, setLocalMonthStart] = useState<number | null>(() => parseDateToMonth(filtros.data_ini));
  const [localMonthEnd,   setLocalMonthEnd]   = useState<number | null>(() => parseDateToMonth(filtros.data_fim));

  useEffect(() => {
    // O período também pode mudar fora deste componente (presets e chips).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalMonthStart(parseDateToMonth(filtros.data_ini));
    setLocalMonthEnd(parseDateToMonth(filtros.data_fim));
  }, [filtros.data_ini, filtros.data_fim]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const selectedUFs  = filtros.sg_uf      ?? [];
  const selectedMuns = filtros.co_mun_res ?? [];

  const classiLabel = (() => {
    const sel = filtros.classi_fin ?? [];
    if (sel.length === 0) return "Classif.";
    if (sel.length === 1) return CLASSIFICACOES.find(c => c.id === sel[0])?.label ?? "Classif.";
    return `${sel.length} classif.`;
  })();

  const desfechoLabel = (() => {
    const sel = filtros.evolucao ?? [];
    if (sel.length === 0) return "Desfecho";
    if (sel.length === 1) return EVOLUCOES.find(e => e.id === sel[0])?.label ?? "Desfecho";
    return `${sel.length} desfechos`;
  })();

  const etioLabel = (() => {
    const sel = filtros.etiologia ?? [];
    if (sel.length === 0) return "Etiologia";
    if (sel.length === 1) return PATOGENOS.find(p => p.id === sel[0])?.label ?? "Etiologia";
    return `${sel.length} vírus`;
  })();

  const munResults =
    munSearch.length >= 2
      ? Object.entries(munNames)
          .filter(([ibge6, name]) => {
            if (selectedUFs.length > 0) {
              const sigla = IBGE_TO_SIGLA[ibge6.slice(0, 2)];
              if (!selectedUFs.includes(sigla)) return false;
            }
            return name.toLowerCase().includes(munSearch.toLowerCase());
          })
          .slice(0, 12)
      : [];

  // ── Navigation helpers ────────────────────────────────────────────────────
  function go(next: URLSearchParams) {
    startTransition(() => {
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    });
  }

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === "anos" || key === "ano") {
      next.delete("data_ini");
      next.delete("data_fim");
    }
    go(next);
  }

  function toggleMulti(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    const current = (next.get(key) ?? "").split(",").filter(Boolean);
    const idx = current.indexOf(value);
    if (idx >= 0) current.splice(idx, 1);
    else current.push(value);
    if (current.length) next.set(key, current.join(","));
    else next.delete(key);
    go(next);
  }

  function toggleUF(sigla: string) { toggleMulti("uf", sigla); }

  function addMun(ibge6: string) {
    const next = new URLSearchParams(sp.toString());
    const current = (next.get("mun") ?? "").split(",").filter(Boolean);
    if (!current.includes(ibge6)) {
      current.push(ibge6);
      next.set("mun", current.join(","));
      go(next);
    }
    setMunSearch("");
  }

  function removeMun(ibge6: string) {
    const next = new URLSearchParams(sp.toString());
    const current = (next.get("mun") ?? "").split(",").filter(id => id && id !== ibge6);
    if (current.length) next.set("mun", current.join(","));
    else next.delete("mun");
    go(next);
  }

  function applySlider(min: number, max: number) {
    if (min === 0 && max === 100) setParam("faixa", null);
    else setParam("faixa", `${min}-${max}`);
  }

  function clearAge() {
    setSliderMin(0);
    setSliderMax(100);
    setParam("faixa", null);
  }

  function applyMonths(start: number, end: number) {
    const year = displayAnos.length === 1 ? displayAnos[0] : null;
    if (!year) return;
    const lastDay = new Date(year, end, 0).getDate();
    const next = new URLSearchParams(sp.toString());
    next.set("data_ini", `01-${String(start).padStart(2, "0")}`);
    next.set("data_fim", `${lastDay}-${String(end).padStart(2, "0")}`);
    go(next);
  }

  function clearPeriodo() {
    setLocalMonthStart(null);
    setLocalMonthEnd(null);
    const next = new URLSearchParams(sp.toString());
    next.delete("data_ini");
    next.delete("data_fim");
    go(next);
  }

  function handleMonthClick(m: number) {
    if (localMonthStart === null || localMonthEnd !== null) {
      setLocalMonthStart(m);
      setLocalMonthEnd(null);
    } else if (m >= localMonthStart) {
      setLocalMonthEnd(m);
      applyMonths(localMonthStart, m);
    } else {
      setLocalMonthStart(m);
    }
  }

  const periodoSuffix = (() => {
    if (displayAnos.length !== 1) return "";
    const s = parseDateToMonth(filtros.data_ini);
    const e = parseDateToMonth(filtros.data_fim);
    if (s && e && s !== e) return ` · ${MESES[s - 1]}–${MESES[e - 1]}`;
    if (s) return ` · ${MESES[s - 1]}`;
    return "";
  })();

  function clearAll() {
    const next = new URLSearchParams(sp.toString());
    ["sexo", "faixa", "classi", "evolucao", "etio", "data_ini", "data_fim", "semana", "uf", "mun", "criterios", "coorte"]
      .forEach(k => next.delete(k));
    go(next);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={`bg-white rounded-xl border shadow-sm mb-6 overflow-visible transition-colors duration-150 ${isPending ? "border-[#1a3a30]" : "border-[#c5ddd6]"}`}>
      {/* Progress bar */}
      <div
        className={`h-0.5 bg-[#1a3a30] rounded-t-xl transition-all duration-300 ${isPending ? "opacity-100" : "opacity-0"}`}
        style={{ width: isPending ? "100%" : "0%" }}
      />

      <div className={`px-3 sm:px-4 py-2 flex flex-wrap items-center gap-2 transition-opacity duration-150 ${isPending ? "opacity-50 pointer-events-none" : ""}`}>

        {/* ── ANO ───────────────────────────────────────────────────────── */}
        <div ref={anoRef} className="relative shrink-0">
          <button
            onClick={() => setAnoOpen(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border transition-all ${
              pendingAnos !== null
                ? "bg-[#dff0ea] text-[#1a3a30] border-[#1a3a30]"
                : "bg-[#1a3a30] text-white border-[#1a3a30]"
            }`}
          >
            {displayLabel}{periodoSuffix}
            <svg className={`w-3 h-3 transition-transform shrink-0 ${anoOpen ? "rotate-180" : ""}`} viewBox="0 0 12 8" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M1 1l5 5 5-5" />
            </svg>
          </button>

          {anoOpen && (
            <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-xl shadow-xl border border-[#c5ddd6] py-1 min-w-[180px]">
              {anos.map(ano => {
                const checked = displayAnos.includes(ano);
                return (
                  <button
                    key={ano}
                    onClick={() => togglePendingAno(ano)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium transition-colors ${
                      checked ? "text-[#1a3a30]" : "text-[#555770] hover:bg-[#eaf5f1] hover:text-[#1a3a30]"
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      checked ? "bg-[#1a3a30] border-[#1a3a30]" : "border-[#c5ddd6]"
                    }`}>
                      {checked && (
                        <svg className="w-2 h-2 text-white" viewBox="0 0 10 8" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M1 4l3 3 5-6" />
                        </svg>
                      )}
                    </span>
                    {ano}
                  </button>
                );
              })}

              {/* Período — month range, only when 1 year selected */}
              <div className="border-t border-[#eaf5f1] mt-0.5 pt-2 px-3 pb-2">
                {displayAnos.length === 1 ? (
                  <>
                    <p className="text-[9px] font-bold text-[#94A3B8] uppercase tracking-widest mb-1.5">Período</p>
                    <div className="grid grid-cols-6 gap-0.5">
                      {MESES.map((mes, i) => {
                        const m = i + 1;
                        const isStart = localMonthStart === m && localMonthEnd === null;
                        const isStartCommitted = localMonthStart === m;
                        const isEnd = localMonthEnd === m;
                        const inRange = localMonthStart !== null && localMonthEnd !== null
                          && m > localMonthStart && m < localMonthEnd;
                        return (
                          <button
                            key={m}
                            onClick={() => handleMonthClick(m)}
                            className={`text-[9px] py-1 rounded transition-colors ${
                              isStartCommitted && (isEnd || localMonthEnd !== null && m === localMonthEnd)
                                ? "bg-[#1a3a30] text-white font-bold"
                                : isStartCommitted || isEnd
                                ? "bg-[#1a3a30] text-white font-semibold"
                                : inRange
                                ? "bg-[#dff0ea] text-[#1a3a30]"
                                : isStart
                                ? "bg-[#dff0ea] text-[#1a3a30] font-semibold"
                                : "text-[#555770] hover:bg-[#eaf5f1] hover:text-[#1a3a30]"
                            }`}
                          >
                            {mes}
                          </button>
                        );
                      })}
                    </div>
                    {(localMonthStart !== null || filtros.data_ini) && (
                      <button onClick={clearPeriodo} className="mt-1.5 text-[9px] text-[#DC2626] font-semibold hover:underline">
                        Limpar período
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-[9px] text-[#94A3B8] italic">Período disponível com 1 ano</p>
                )}
              </div>
            </div>
          )}
        </div>

        <VDivider />

        {/* ── SEMANA EPIDEMIOLÓGICA ───────────────────────────────────── */}
        <select
          aria-label="Semana epidemiológica"
          value={filtros.semana_epi ?? ""}
          onChange={e => setParam("semana", e.target.value || null)}
          className={`shrink-0 text-xs px-2.5 py-1.5 rounded-md border focus:outline-none focus:ring-1 focus:ring-[#1a3a30] cursor-pointer ${
            filtros.semana_epi
              ? "bg-[#dff0ea] text-[#1a3a30] border-[#1a3a30] font-semibold"
              : "bg-white text-[#555770] border-[#c5ddd6]"
          }`}
          style={{ fontFamily: "inherit" }}
        >
          <option value="">Semana</option>
          {Array.from({ length: 53 }, (_, index) => index + 1).map(semana => (
            <option key={semana} value={semana}>Semana {semana}</option>
          ))}
        </select>

        <VDivider />

        {/* ── ONDE ──────────────────────────────────────────────────────── */}
        <div className="flex flex-1 basis-[240px] items-center gap-2 min-w-0">
          {/* Estado dropdown */}
          <div ref={ufRef} className="relative shrink-0">
            <button
              onClick={() => setUfOpen(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-all ${
                selectedUFs.length > 0
                  ? "bg-[#dff0ea] text-[#1a3a30] border-[#1a3a30] font-semibold"
                  : "bg-white text-[#555770] border-[#c5ddd6] hover:border-[#1a3a30] hover:text-[#1a3a30]"
              }`}
            >
              {selectedUFs.length === 0 ? "Estado" : selectedUFs.length === 1 ? selectedUFs[0] : `${selectedUFs.length} estados`}
              <svg className={`w-3 h-3 transition-transform ${ufOpen ? "rotate-180" : ""}`} viewBox="0 0 12 8" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M1 1l5 5 5-5" />
              </svg>
            </button>

            {ufOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-xl shadow-xl border border-[#c5ddd6] w-56 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#eaf5f1] bg-[#f4fbf8]">
                  <button
                    onClick={() => { const n = new URLSearchParams(sp.toString()); n.delete("uf"); n.delete("mun"); go(n); }}
                    className="text-[10px] text-[#DC2626] font-semibold hover:underline"
                  >Limpar</button>
                  <span className="text-[10px] text-[#94A3B8]">{selectedUFs.length}/{UF_LIST.length}</span>
                  <button
                    onClick={() => { const n = new URLSearchParams(sp.toString()); n.set("uf", UF_LIST.map(u => u.sigla).join(",")); go(n); }}
                    className="text-[10px] text-[#1a3a30] font-semibold hover:underline"
                  >Todos</button>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {UF_LIST.map(uf => (
                    <label key={uf.sigla} className="flex items-center gap-2.5 px-3 py-1.5 text-xs text-[#1C1C1C] hover:bg-[#eaf5f1] cursor-pointer">
                      <input type="checkbox" checked={selectedUFs.includes(uf.sigla)} onChange={() => toggleUF(uf.sigla)} className="accent-[#1a3a30] shrink-0" />
                      <span className="text-[10px] font-bold text-[#94A3B8] w-6 shrink-0">{uf.sigla}</span>
                      <span className="truncate">{uf.nome}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Compact municipality selector: selections stay inside the dropdown. */}
          <div ref={munRef} className="relative flex-1 min-w-0" onKeyDown={e => { if (e.key === "Escape") { setMunOpen(false); munRef.current?.querySelector<HTMLButtonElement>("button")?.focus(); } }}>
            <button
              type="button"
              aria-expanded={munOpen}
              aria-controls="municipality-options"
              onClick={() => setMunOpen(open => !open)}
              className={`w-full flex items-center justify-between gap-1.5 px-3 py-1.5 text-xs rounded-md border ${selectedMuns.length ? "bg-[#dff0ea] text-[#1a3a30] border-[#1a3a30] font-semibold" : "bg-white text-[#555770] border-[#c5ddd6]"}`}
            >
              <span className="truncate">{selectedMuns.length ? `${selectedMuns.length} município${selectedMuns.length === 1 ? "" : "s"}` : "Municípios"}</span>
              <span aria-hidden="true" className="shrink-0">{munOpen ? "▴" : "▾"}</span>
            </button>
            {munOpen && (
              <div id="municipality-options" className="absolute right-0 top-full mt-1 z-50 w-72 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-xl border border-[#c5ddd6] p-3 space-y-3">
                <input
                  type="search"
                  aria-label="Buscar município"
                  value={munSearch}
                  onChange={e => setMunSearch(e.target.value)}
                  placeholder="Buscar município (2 letras ou mais)"
                  className="w-full min-w-0 px-2 py-1.5 text-xs border border-[#c5ddd6] rounded-md text-[#1C1C1C] focus:outline-none focus:ring-1 focus:ring-[#1a3a30]"
                />
                {selectedMuns.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-semibold mb-1">
                      <span>Selecionados ({selectedMuns.length})</span>
                      <button type="button" onClick={() => setParam("mun", null)} className="text-[#DC2626] hover:underline">Limpar municípios</button>
                    </div>
                    <div className="max-h-40 overflow-y-auto">
                      {selectedMuns.map(ibge6 => (
                        <label key={ibge6} className="flex items-start gap-2 py-1.5 text-xs cursor-pointer">
                          <input type="checkbox" checked onChange={() => removeMun(ibge6)} className="accent-[#1a3a30] mt-0.5 shrink-0" />
                          <span className="min-w-0 break-words">{munNames[ibge6] ?? ibge6} · {IBGE_TO_SIGLA[ibge6.slice(0, 2)] ?? ""}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {munSearch.length >= 2 ? (
                  <div className="max-h-48 overflow-y-auto border-t border-[#eaf5f1] pt-1">
                    {munResults.length === 0 && <p className="py-2 text-xs text-[#555770]">Nenhum município encontrado nos estados selecionados.</p>}
                    {munResults.map(([ibge6, name]) => (
                      <label key={ibge6} className="flex items-start gap-2 py-1.5 text-xs cursor-pointer">
                        <input type="checkbox" checked={selectedMuns.includes(ibge6)} onChange={() => selectedMuns.includes(ibge6) ? removeMun(ibge6) : addMun(ibge6)} className="accent-[#1a3a30] mt-0.5 shrink-0" />
                        <span className="min-w-0 break-words">{name} · {IBGE_TO_SIGLA[ibge6.slice(0, 2)] ?? ""}</span>
                      </label>
                    ))}
                  </div>
                ) : <p className="text-[10px] text-[#555770]">Busque para adicionar; desmarque para remover.</p>}
              </div>
            )}
          </div>
        </div>

        <VDivider />

        {/* ── QUEM ──────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Sexo — native select */}
          <select
            aria-label="Filtro global de sexo"
            value={filtros.cs_sexo ?? ""}
            onChange={e => {
              const next = new URLSearchParams(sp.toString());
              if (e.target.value) next.set("sexo", e.target.value);
              else next.delete("sexo");
              go(next);
            }}
            className={`text-xs px-3 py-1.5 rounded-md border focus:outline-none focus:ring-1 focus:ring-[#1a3a30] cursor-pointer ${
              filtros.cs_sexo
                ? "bg-[#dff0ea] text-[#1a3a30] border-[#1a3a30] font-semibold"
                : "bg-white text-[#555770] border-[#c5ddd6]"
            }`}
            style={{ fontFamily: "inherit" }}
          >
            <option value="">Sexo</option>
            <option value="F">Feminino</option>
            <option value="M">Masculino</option>
          </select>

          {/* Idade dropdown */}
          <div ref={idadeRef} className="relative">
            <button
              onClick={() => setIdadeOpen(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-all ${
                filtros.faixa_etaria
                  ? "bg-[#dff0ea] text-[#1a3a30] border-[#1a3a30] font-semibold"
                  : "bg-white text-[#555770] border-[#c5ddd6] hover:border-[#1a3a30] hover:text-[#1a3a30]"
              }`}
            >
              {idadeLabel}
              <svg className={`w-3 h-3 transition-transform shrink-0 ${idadeOpen ? "rotate-180" : ""}`} viewBox="0 0 12 8" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M1 1l5 5 5-5" />
              </svg>
            </button>

            {idadeOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-xl shadow-xl border border-[#c5ddd6] w-52 px-4 pt-3 pb-4">
                {/* Live values */}
                <div className="flex justify-between mb-3">
                  <span className="text-xs font-semibold text-[#1a3a30]">{sliderMin} anos</span>
                  <span className="text-xs font-semibold text-[#1a3a30]">{sliderMax === 100 ? "100+" : sliderMax} anos</span>
                </div>

                {/* Dual range slider */}
                <div className="relative h-5 flex items-center">
                  {/* Track */}
                  <div className="absolute inset-x-0 h-1.5 bg-[#c5ddd6] rounded-full pointer-events-none">
                    <div
                      className="absolute h-full bg-[#1a3a30] rounded-full"
                      style={{ left: `${sliderMin}%`, right: `${100 - sliderMax}%` }}
                    />
                  </div>

                  {/* Min thumb */}
                  <input
                    type="range" min={0} max={100} value={sliderMin}
                    onChange={e => {
                      const v = Math.min(Number(e.target.value), sliderMaxRef.current - 1);
                      sliderMinRef.current = v;
                      setSliderMin(v);
                    }}
                    onMouseUp={() => applySlider(sliderMinRef.current, sliderMaxRef.current)}
                    onTouchEnd={() => applySlider(sliderMinRef.current, sliderMaxRef.current)}
                    className="absolute inset-0 w-full h-full appearance-none bg-transparent cursor-pointer pointer-events-none [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#1a3a30] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[#1a3a30] [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow-md [&::-moz-range-track]:bg-transparent"
                    style={{ zIndex: sliderMin >= sliderMax - 2 ? 3 : 2 }}
                  />

                  {/* Max thumb */}
                  <input
                    type="range" min={0} max={100} value={sliderMax}
                    onChange={e => {
                      const v = Math.max(Number(e.target.value), sliderMinRef.current + 1);
                      sliderMaxRef.current = v;
                      setSliderMax(v);
                    }}
                    onMouseUp={() => applySlider(sliderMinRef.current, sliderMaxRef.current)}
                    onTouchEnd={() => applySlider(sliderMinRef.current, sliderMaxRef.current)}
                    className="absolute inset-0 w-full h-full appearance-none bg-transparent cursor-pointer pointer-events-none [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#1a3a30] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[#1a3a30] [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow-md [&::-moz-range-track]:bg-transparent"
                    style={{ zIndex: sliderMin >= sliderMax - 2 ? 2 : 3 }}
                  />
                </div>

                {filtros.faixa_etaria && (
                  <button
                    onClick={() => { clearAge(); setIdadeOpen(false); }}
                    className="mt-3 text-[10px] text-[#DC2626] font-semibold hover:underline"
                  >
                    Limpar
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <VDivider />

        {/* ── CLÍNICA — flex-1 com botões que crescem igualmente ────────── */}
        <div className="flex flex-1 basis-full sm:basis-auto items-center gap-2 min-w-0">
          {/* Classificação */}
          <div ref={classiRef} className="relative flex-1 min-w-0">
            <button
              onClick={() => setClassiOpen(v => !v)}
              className={`w-full flex items-center justify-center gap-1.5 px-2 sm:px-3 py-1.5 text-xs rounded-md border transition-all ${
                (filtros.classi_fin?.length ?? 0) > 0
                  ? "bg-[#dff0ea] text-[#1a3a30] border-[#1a3a30] font-semibold"
                  : "bg-white text-[#555770] border-[#c5ddd6] hover:border-[#1a3a30] hover:text-[#1a3a30]"
              }`}
            >
              {classiLabel}
              <svg className={`w-3 h-3 transition-transform shrink-0 ${classiOpen ? "rotate-180" : ""}`} viewBox="0 0 12 8" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M1 1l5 5 5-5" />
              </svg>
            </button>
            {classiOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-xl shadow-xl border border-[#c5ddd6] py-1 min-w-[148px]">
                {CLASSIFICACOES.map(c => {
                  const checked = (filtros.classi_fin ?? []).includes(c.id);
                  return (
                    <button key={c.id} onClick={() => toggleMulti("classi", String(c.id))}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium transition-colors ${checked ? "text-[#1a3a30]" : "text-[#555770] hover:bg-[#eaf5f1] hover:text-[#1a3a30]"}`}
                    >
                      <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${checked ? "bg-[#1a3a30] border-[#1a3a30]" : "border-[#c5ddd6]"}`}>
                        {checked && <svg className="w-2 h-2 text-white" viewBox="0 0 10 8" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M1 4l3 3 5-6" /></svg>}
                      </span>
                      {c.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Desfecho */}
          <div ref={desfechoRef} className="relative flex-1 min-w-0">
            <button
              onClick={() => setDesfechoOpen(v => !v)}
              className={`w-full flex items-center justify-center gap-1.5 px-2 sm:px-3 py-1.5 text-xs rounded-md border transition-all ${
                (filtros.evolucao?.length ?? 0) > 0
                  ? "bg-[#dff0ea] text-[#1a3a30] border-[#1a3a30] font-semibold"
                  : "bg-white text-[#555770] border-[#c5ddd6] hover:border-[#1a3a30] hover:text-[#1a3a30]"
              }`}
            >
              {desfechoLabel}
              <svg className={`w-3 h-3 transition-transform shrink-0 ${desfechoOpen ? "rotate-180" : ""}`} viewBox="0 0 12 8" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M1 1l5 5 5-5" />
              </svg>
            </button>
            {desfechoOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-xl shadow-xl border border-[#c5ddd6] py-1 min-w-[172px]">
                {EVOLUCOES.map(e => {
                  const checked = (filtros.evolucao ?? []).includes(e.id);
                  return (
                    <button key={e.id} onClick={() => toggleMulti("evolucao", String(e.id))}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium transition-colors ${checked ? "text-[#1a3a30]" : "text-[#555770] hover:bg-[#eaf5f1] hover:text-[#1a3a30]"}`}
                    >
                      <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${checked ? "bg-[#1a3a30] border-[#1a3a30]" : "border-[#c5ddd6]"}`}>
                        {checked && <svg className="w-2 h-2 text-white" viewBox="0 0 10 8" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M1 4l3 3 5-6" /></svg>}
                      </span>
                      {e.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Etiologia */}
          <div ref={etioRef} className="relative flex-1 min-w-0">
            <button
              onClick={() => setEtioOpen(v => !v)}
              className={`w-full flex items-center justify-center gap-1.5 px-2 sm:px-3 py-1.5 text-xs rounded-md border transition-all ${
                (filtros.etiologia?.length ?? 0) > 0
                  ? "bg-[#dff0ea] text-[#1a3a30] border-[#1a3a30] font-semibold"
                  : "bg-white text-[#555770] border-[#c5ddd6] hover:border-[#1a3a30] hover:text-[#1a3a30]"
              }`}
            >
              {etioLabel}
              <svg className={`w-3 h-3 transition-transform shrink-0 ${etioOpen ? "rotate-180" : ""}`} viewBox="0 0 12 8" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M1 1l5 5 5-5" />
              </svg>
            </button>
            {etioOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-xl shadow-xl border border-[#c5ddd6] py-1 min-w-[176px]">
                {PATOGENOS.map(p => {
                  const checked = (filtros.etiologia ?? []).includes(p.id);
                  return (
                    <button key={p.id} onClick={() => toggleMulti("etio", p.id)}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium transition-colors ${checked ? "text-[#1a3a30]" : "text-[#555770] hover:bg-[#eaf5f1] hover:text-[#1a3a30]"}`}
                    >
                      <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${checked ? "bg-[#1a3a30] border-[#1a3a30]" : "border-[#c5ddd6]"}`}>
                        {checked && <svg className="w-2 h-2 text-white" viewBox="0 0 10 8" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M1 4l3 3 5-6" /></svg>}
                      </span>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.cor }} />
                      {p.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Limpar filtros ativos */}
        {activeCount > 0 && (
          <button
            onClick={clearAll}
            className="shrink-0 flex items-center gap-1.5 text-xs text-[#1a3a30] hover:text-[#DC2626] font-semibold transition-colors"
          >
            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" d="M2 2l8 8M10 2l-8 8" />
            </svg>
            Limpar ({activeCount})
          </button>
        )}

      </div>
    </div>
  );
}
