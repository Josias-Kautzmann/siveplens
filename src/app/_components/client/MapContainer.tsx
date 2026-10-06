"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import BrazilMap from "./BrazilMap";
import StateMap from "./StateMap";
import { UF_POPULACAO } from "@/lib/constants";
import type { SelectedState, MunNames, UfNames } from "@/lib/types";
import type { DadoUFEtio } from "@/dal/casos.repo";
import { PATOGENOS } from "@/lib/filter-utils";

type PatKey = "flu_a" | "flu_b" | "sars2" | "vsr" | "rino" | "metap";

// Todos os patógenos — usado como fallback quando nenhum está selecionado
const ALL_PAT_KEYS = PATOGENOS.map((p) => p.id) as PatKey[];

interface MapContainerProps {
  dadosUFEtio: DadoUFEtio[];
  ufAtiva?:    string[];
  munAtiva?:   string[];
  anoAtivo?:   number;
  etiologia?:  string[];
}

export default function MapContainer({ dadosUFEtio, ufAtiva, munAtiva, etiologia }: MapContainerProps) {
  const [selectedState, setSelectedState] = useState<SelectedState | null>(null);
  const [munNames,      setMunNames]      = useState<MunNames>({});
  const [ufNames,       setUfNames]       = useState<UfNames>({});
  const [triggerSigla,  setTriggerSigla]  = useState<string | null>(null);

  // Patógenos a somar no coroplético: os selecionados na FilterBar, ou todos se nenhum
  const activePats = (etiologia?.length ? etiologia : ALL_PAT_KEYS) as PatKey[];

  const router       = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    Promise.all([
      fetch("/data/mun-names.json").then((r) => r.json()),
      fetch("/data/uf-names.json").then((r)  => r.json()),
    ]).then(([mun, uf]) => {
      setMunNames(mun);
      setUfNames(uf);
    });
  }, []);

  // ─── Sincroniza estado visual do mapa com o filtro de UF ─────────────────
  // • 1 estado selecionado → navega para o detalhe desse estado (municípios)
  // • 2+ estados           → volta para a visão Brasil (com destaque nos selecionados)
  // • 0 estados            → mantém a visão atual (usuário controla livremente)
  const ufKey = (ufAtiva ?? []).join(",");
  useEffect(() => {
    const count = ufAtiva?.length ?? 0;
    if (count === 1) {
      const sigla = ufAtiva![0];
      // Só navega se ainda não está nesse estado
      if (selectedState?.sigla !== sigla) {
        setTriggerSigla(sigla);
      }
    } else if (count !== 1 && selectedState !== null) {
      // Mais de um (ou nenhum com estado ativo via mapa) → volta ao Brasil
      setSelectedState(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ufKey]);

  // ─── Coroplético ─────────────────────────────────────────────────────────

  const { casosUF, tooltipLinesUF } = useMemo(() => {
    const byUF: Record<string, Record<PatKey, number>> = {};
    for (const row of dadosUFEtio) {
      if (!byUF[row.sg_uf])
        byUF[row.sg_uf] = { flu_a: 0, flu_b: 0, sars2: 0, vsr: 0, rino: 0, metap: 0 };
      for (const p of PATOGENOS) byUF[row.sg_uf][p.id as PatKey] += row[p.id as PatKey];
    }

    const casosUF: Record<string, number>          = {};
    const tooltipLinesUF: Record<string, string[]> = {};

    for (const [uf, vals] of Object.entries(byUF)) {
      const totalAbsoluto = activePats.reduce((s, p) => s + vals[p], 0);
      const pop = UF_POPULACAO[uf] ?? 1_000_000;
      // Taxa por 100 mil habitantes para normalizar estados populosos
      casosUF[uf] = (totalAbsoluto / pop) * 100_000;
      const linhas = [ufNames[uf] ?? uf];
      linhas.push(`${totalAbsoluto.toLocaleString("pt-BR")} casos (${casosUF[uf].toFixed(1)}/100k hab.)`);
      for (const p of PATOGENOS)
        if (activePats.includes(p.id as PatKey) && vals[p.id as PatKey] > 0)
          linhas.push(`${p.label}: ${vals[p.id as PatKey].toLocaleString("pt-BR")}`);
      tooltipLinesUF[uf] = linhas;
    }

    return { casosUF, tooltipLinesUF };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dadosUFEtio, etiologia?.join(","), ufNames]);

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleStateSelect = useCallback(
    (state: SelectedState) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("uf", state.sigla);
      params.delete("mun");
      router.push(`?${params.toString()}`);
      setSelectedState(state);
    },
    [router, searchParams],
  );

  const handleBack = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("uf");
    params.delete("mun");
    router.push(`?${params.toString()}`);
    setSelectedState(null);
  }, [router, searchParams]);

  const handleMunSelect = useCallback(
    (ibge: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const current = (params.get("mun") ?? "").split(",").filter(Boolean);
      const idx = current.indexOf(ibge);
      if (idx >= 0) current.splice(idx, 1);
      else current.push(ibge);
      if (current.length) params.set("mun", current.join(","));
      else params.delete("mun");
      router.push(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  const handleMunClear = useCallback(
    (ibge6: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const current = (params.get("mun") ?? "").split(",").filter((id) => id && id !== ibge6);
      if (current.length) params.set("mun", current.join(","));
      else params.delete("mun");
      router.push(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col">

      {/* Mapa */}
      <div className="flex-1 overflow-hidden flex items-center justify-center">
        {!selectedState ? (
          <BrazilMap
            onStateSelect={handleStateSelect}
            ufNames={ufNames}
            casosUF={casosUF}
            tooltipLinesUF={tooltipLinesUF}
            ufAtiva={ufAtiva}
            triggerSigla={triggerSigla}
            onTriggerConsumed={() => setTriggerSigla(null)}
          />
        ) : (
          <div className="h-full w-full overflow-auto p-3">
            <StateMap
              selectedState={selectedState}
              onBack={handleBack}
              munNames={munNames}
              munAtiva={munAtiva}
              onMunSelect={handleMunSelect}
              onMunClear={handleMunClear}
            />
          </div>
        )}
      </div>
    </div>
  );
}
