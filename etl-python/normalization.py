"""Shared, deterministic normalization rules for every SIVEP-Gripe ingestion path."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
import math
from typing import Any, Mapping


NORMALIZATION_VERSION = "sivep-normalization/1.0.0"


def is_missing(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, float) and math.isnan(value):
        return True
    return not str(value).strip() or str(value).strip().lower() in {"none", "nan", "nat"}


def to_int(value: Any) -> int | None:
    if is_missing(value):
        return None
    try:
        return int(float(str(value).strip()))
    except (ValueError, TypeError, OverflowError):
        return None


def to_str(value: Any, length: int | None = None) -> str | None:
    if is_missing(value):
        return None
    result = str(value).strip()
    return result[:length] if length else result


def to_date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if is_missing(value):
        return None
    text = str(value).strip()
    for date_format in (
        "%Y-%m-%dT%H:%M:%S.%fZ",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y",
    ):
        try:
            return datetime.strptime(text, date_format).date()
        except ValueError:
            continue
    return None


def to_ibge6(value: Any) -> str | None:
    text = to_str(value)
    if text is None:
        return None
    digits = text.split(".")[0]
    return digits.zfill(6)[:6]


def clean_age(age_value: Any, age_unit_value: Any) -> tuple[int | None, int | None]:
    """Validate age using TP_IDADE domains: 1=days, 2=months, 3=years."""
    age = to_int(age_value)
    age_unit = to_int(age_unit_value)
    if age is None or age_unit not in {1, 2, 3}:
        return None, None
    valid = (
        (age_unit == 1 and 0 <= age <= 366)
        or (age_unit == 2 and 0 <= age <= 11)
        or (age_unit == 3 and 0 <= age <= 130)
    )
    return (age, age_unit) if valid else (None, None)


def clean_pcr_result(value: Any) -> int | None:
    """PCR_RESUL=5 means awaiting result and is represented as missing."""
    result = to_int(value)
    return None if result == 5 else result


def record_value(record: Mapping[str, Any], field: str) -> Any:
    if field in record:
        return record[field]
    return record.get(field.lower())


@dataclass(frozen=True)
class CoreNormalization:
    notification_date: date
    epidemiological_year: int
    age: int | None
    age_unit: int | None
    pcr_result: int | None


def normalize_core(record: Mapping[str, Any]) -> tuple[CoreNormalization | None, str | None]:
    """Apply rules that must be identical in full and incremental ETLs."""
    notification_date = to_date(record_value(record, "DT_NOTIFIC"))
    if notification_date is None:
        return None, "missing_or_invalid_notification_date"

    symptom_onset = to_date(record_value(record, "DT_SIN_PRI"))
    birth_date = to_date(record_value(record, "DT_NASC"))
    if symptom_onset and symptom_onset > notification_date:
        return None, "symptom_onset_after_notification"
    if birth_date and symptom_onset and birth_date > symptom_onset:
        return None, "birth_after_symptom_onset"
    if birth_date and birth_date > notification_date:
        return None, "birth_after_notification"

    age, age_unit = clean_age(
        record_value(record, "NU_IDADE_N"),
        record_value(record, "TP_IDADE"),
    )
    return CoreNormalization(
        notification_date=notification_date,
        epidemiological_year=notification_date.year,
        age=age,
        age_unit=age_unit,
        pcr_result=clean_pcr_result(record_value(record, "PCR_RESUL")),
    ), None
