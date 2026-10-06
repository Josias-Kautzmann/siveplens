import sys
from datetime import date
from pathlib import Path
import unittest


ETL_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ETL_DIR))

import normalization  # noqa: E402


class ConversionTests(unittest.TestCase):
    def test_age_domains(self):
        self.assertEqual(normalization.clean_age("366", "1"), (366, 1))
        self.assertEqual(normalization.clean_age("11", "2"), (11, 2))
        self.assertEqual(normalization.clean_age("130", "3"), (130, 3))
        self.assertEqual(normalization.clean_age("367", "1"), (None, None))
        self.assertEqual(normalization.clean_age("12", "2"), (None, None))
        self.assertEqual(normalization.clean_age("131", "3"), (None, None))
        self.assertEqual(normalization.clean_age("10", "9"), (None, None))

    def test_pcr_awaiting_is_missing(self):
        self.assertIsNone(normalization.clean_pcr_result(5))
        self.assertEqual(normalization.clean_pcr_result("1"), 1)

    def test_date_formats(self):
        expected = date(2024, 5, 10)
        self.assertEqual(normalization.to_date("10/05/2024"), expected)
        self.assertEqual(normalization.to_date("2024-05-10"), expected)
        self.assertEqual(normalization.to_date("2024-05-10T00:00:00.000Z"), expected)


class CoreNormalizationTests(unittest.TestCase):
    def test_csv_and_api_key_styles_are_equivalent(self):
        csv_record = {
            "DT_NOTIFIC": "10/05/2024",
            "DT_SIN_PRI": "08/05/2024",
            "DT_NASC": "01/01/1980",
            "NU_IDADE_N": "44",
            "TP_IDADE": "3",
            "PCR_RESUL": "5",
        }
        api_record = {key.lower(): value for key, value in csv_record.items()}

        csv_result, csv_reason = normalization.normalize_core(csv_record)
        api_result, api_reason = normalization.normalize_core(api_record)

        self.assertIsNone(csv_reason)
        self.assertIsNone(api_reason)
        self.assertEqual(csv_result, api_result)
        self.assertIsNone(csv_result.pcr_result)

    def test_rejects_inconsistent_dates_with_reason(self):
        result, reason = normalization.normalize_core({
            "dt_notific": "2024-05-10",
            "dt_sin_pri": "2024-05-11",
        })
        self.assertIsNone(result)
        self.assertEqual(reason, "symptom_onset_after_notification")

    def test_requires_notification_date(self):
        result, reason = normalization.normalize_core({"nu_idade_n": 30, "tp_idade": 3})
        self.assertIsNone(result)
        self.assertEqual(reason, "missing_or_invalid_notification_date")


if __name__ == "__main__":
    unittest.main()
