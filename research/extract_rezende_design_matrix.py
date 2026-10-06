"""Build the exact Rezende et al. design matrix from the public XLSX.

This script mirrors the filtering and recoding in the authors' analysis.Rmd.
It writes a temporary JSON input for the SivepLens TypeScript regression engine.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import pandas as pd


EXPECTED_SHA256 = "721c8c40212b9f11c1b211f2fde89de73f896765f65ed16a44bfec8e6366bf6d"
DOSE_COLUMNS = [
    "DOSE_1_COV",
    "DOSE_2_COV",
    "DOSE_ADIC",
    "DOSE_REF",
    "DOSE_2REF",
    "DOS_RE_BI",
]


def numeric(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("xlsx", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    source_hash = hashlib.sha256(args.xlsx.read_bytes()).hexdigest()
    if source_hash != EXPECTED_SHA256:
        raise SystemExit(
            f"Unexpected XLSX SHA-256: {source_hash}; expected {EXPECTED_SHA256}"
        )

    df = pd.read_excel(args.xlsx)
    required = {
        "NOSOCOMIAL", "NU_IDADE_N", "IMUNODEPRE", "HOSPITAL", "DT_INTERNA",
        "CLASSI_FIN", "PCR_SARS2", "AN_SARS2", "EVOLUCAO", "DT_EVOLUCA",
        "CS_SEXO", "CS_ESCOL_N", "UTI", "SUPORT_VEN", *DOSE_COLUMNS,
    }
    missing = sorted(required - set(df.columns))
    if missing:
        raise SystemExit(f"Missing required columns: {', '.join(missing)}")

    num = {column: numeric(df[column]) for column in required if column not in {
        "DT_INTERNA", "DT_EVOLUCA", "CS_SEXO", *DOSE_COLUMNS,
    }}
    evolution_date = pd.to_datetime(df["DT_EVOLUCA"], errors="coerce")

    eligible = (
        (num["NOSOCOMIAL"] == 2)
        & (num["NU_IDADE_N"] >= 60)
        & (num["IMUNODEPRE"] == 1)
        & (num["HOSPITAL"] == 1)
        & df["DT_INTERNA"].notna()
        & (num["CLASSI_FIN"] == 5)
        & ((num["PCR_SARS2"] == 1) | (num["AN_SARS2"] == 1))
        & num["EVOLUCAO"].isin([1, 2])
        & evolution_date.between("2023-12-31", "2024-12-28", inclusive="both")
    )
    cohort = df.loc[eligible].copy()

    for column in ["NU_IDADE_N", "CS_ESCOL_N", "UTI", "SUPORT_VEN", "EVOLUCAO"]:
        cohort[column] = numeric(cohort[column])

    sex = cohort["CS_SEXO"].astype("string").str.strip()
    unexpected_sex = sorted(set(sex.dropna()) - {"F", "M"})
    if unexpected_sex:
        raise SystemExit(f"Unexpected CS_SEXO levels in model cohort: {unexpected_sex}")

    education = pd.Series("unknown", index=cohort.index, dtype="string")
    education.loc[cohort["CS_ESCOL_N"].isin([0, 1])] = "elementary"
    education.loc[cohort["CS_ESCOL_N"] == 2] = "middle"
    education.loc[cohort["CS_ESCOL_N"].isin([3, 4])] = "high"

    dose_count = cohort[DOSE_COLUMNS].notna().sum(axis=1)
    dose_group = pd.Series("unvaccinated", index=cohort.index, dtype="string")
    dose_group.loc[dose_count.between(1, 2)] = "1-2"
    dose_group.loc[dose_count == 3] = "3"
    dose_group.loc[dose_count == 4] = "4"
    dose_group.loc[dose_count >= 5] = "5+"

    names = [
        "(Intercept)",
        "NU_IDADE_N",
        "CS_SEXOM",
        "education_levelElementary",
        "education_levelMiddle",
        "education_levelUnknown",
        "nominal_icu_admissionYes",
        "nominal_invasive_support_venYes",
        "categorical_doses1-2",
        "categorical_doses3",
        "categorical_doses4",
        "categorical_doses5+",
    ]

    matrix = pd.DataFrame(
        {
            "(Intercept)": 1.0,
            "NU_IDADE_N": cohort["NU_IDADE_N"].astype(float),
            "CS_SEXOM": (sex == "M").astype(float),
            "education_levelElementary": (education == "elementary").astype(float),
            "education_levelMiddle": (education == "middle").astype(float),
            "education_levelUnknown": (education == "unknown").astype(float),
            "nominal_icu_admissionYes": (cohort["UTI"] == 1).astype(float),
            "nominal_invasive_support_venYes": (cohort["SUPORT_VEN"] == 1).astype(float),
            "categorical_doses1-2": (dose_group == "1-2").astype(float),
            "categorical_doses3": (dose_group == "3").astype(float),
            "categorical_doses4": (dose_group == "4").astype(float),
            "categorical_doses5+": (dose_group == "5+").astype(float),
        },
        index=cohort.index,
    )

    events = (cohort["EVOLUCAO"] == 2).astype(int)
    if len(cohort) != 474 or int(events.sum()) != 171:
        raise SystemExit(
            f"Cohort mismatch: N={len(cohort)}, deaths={int(events.sum())}; expected 474/171"
        )

    payload = {
        "source": {
            "fileName": args.xlsx.name,
            "sha256": source_hash,
            "protocol": "JoaoFelipe/COVID-Study analysis.Rmd main model",
        },
        "names": names,
        "X": matrix[names].values.tolist(),
        "y": events.tolist(),
        "w": [1] * len(cohort),
        "cohort": {
            "n": len(cohort),
            "events": int(events.sum()),
            "survivors": int(len(cohort) - events.sum()),
            "doseGroups": {str(key): int(value) for key, value in dose_group.value_counts().items()},
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(payload["cohort"], ensure_ascii=False))


if __name__ == "__main__":
    main()
