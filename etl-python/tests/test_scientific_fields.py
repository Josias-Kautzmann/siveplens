import importlib
import os
import sys
import types
from pathlib import Path
import unittest


ETL_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ETL_DIR))
os.environ.setdefault("DATABASE_URL", "postgresql://unused:unused@localhost/unused")

# Os testes exercitam apenas transformação de registros; nenhuma conexão é aberta.
if "psycopg2" not in sys.modules:
    psycopg2 = types.ModuleType("psycopg2")
    extras = types.ModuleType("psycopg2.extras")
    psycopg2.extras = extras
    sys.modules["psycopg2"] = psycopg2
    sys.modules["psycopg2.extras"] = extras
if "requests" not in sys.modules:
    sys.modules["requests"] = types.ModuleType("requests")
if "dotenv" not in sys.modules:
    dotenv = types.ModuleType("dotenv")
    dotenv.load_dotenv = lambda *_args, **_kwargs: None
    sys.modules["dotenv"] = dotenv


NEW_FIELDS = {
    "dt_sin_pri", "sem_pri", "dt_digita", "dt_encerra",
    "dose_adic", "dos_re_bi", "fab_cov_1", "fab_cov_2", "fab_adic",
    "fab_covref", "fab_covrf2", "fab_re_bi", "pcr_para1", "pcr_para2",
    "pcr_para3", "pcr_para4", "pcr_outro", "an_sars2", "trat_cov", "tipo_trat",
}


def sample_record(key_style="upper"):
    record = {
        "NU_NOTIFIC": "123456789",
        "DT_NOTIFIC": "10/05/2024",
        "SEM_NOT": "19",
        "DT_SIN_PRI": "08/05/2024",
        "SEM_PRI": "19",
        "DT_DIGITA": "11/05/2024",
        "DT_ENCERRA": "20/05/2024",
        "NU_IDADE_N": "65",
        "TP_IDADE": "3",
        "CO_MUN_NOT": "430510",
        "CO_MUN_RES": "430510",
        "CO_MU_INTE": "430510",
        "DOSE_ADIC": "01/01/2022",
        "DOS_RE_BI": "01/01/2024",
        "FAB_COV_1": "FAB 1",
        "FAB_COV_2": "FAB 2",
        "FAB_ADIC": "FAB 3",
        "FAB_COVREF": "FAB 4",
        "FAB_COVRF2": "FAB 5",
        "FAB_RE_BI": "FAB 6",
        "PCR_PARA1": "1",
        "PCR_PARA2": "2",
        "PCR_PARA3": "1",
        "PCR_PARA4": "2",
        "PCR_OUTRO": "1",
        "AN_SARS2": "1",
        "TRAT_COV": "1",
        "TIPO_TRAT": "2",
    }
    return record if key_style == "upper" else {key.lower(): value for key, value in record.items()}


class ScientificFieldAlignmentTests(unittest.TestCase):
    def test_full_loader_tuple_matches_insert_columns(self):
        module = importlib.import_module("load_influd")
        row = module.row_to_tuple(sample_record())
        self.assertIsNotNone(row)
        self.assertEqual(len(row), len(module.INSERT_COLUMNS))
        mapped = dict(zip(module.INSERT_COLUMNS, row))
        self.assertTrue(NEW_FIELDS.issubset(mapped))
        self.assertEqual(mapped["an_sars2"], 1)
        self.assertEqual(mapped["fab_re_bi"], "FAB 6")
        self.assertEqual(str(mapped["dt_sin_pri"]), "2024-05-08")

    def test_incremental_loader_matches_copy_columns(self):
        module = importlib.import_module("fetch_incremental")
        columns = tuple(column.strip() for column in module.COPY_COLS.split(","))
        row = module.parse_record(sample_record("lower"), {"430510"})
        self.assertIsNotNone(row)
        self.assertEqual(len(row), len(columns))
        mapped = dict(zip(columns, row))
        self.assertTrue(NEW_FIELDS.issubset(mapped))
        self.assertEqual(mapped["an_sars2"], 1)

    def test_csv_loader_matches_copy_columns(self):
        module = importlib.import_module("update_csv")
        columns = tuple(column.strip() for column in module.COPY_COLS.split(","))
        line = module.row_to_copy_line(sample_record(), {"430510"})
        self.assertIsNotNone(line)
        values = line.split("\t")
        self.assertEqual(len(values), len(columns))
        mapped = dict(zip(columns, values))
        self.assertTrue(NEW_FIELDS.issubset(mapped))
        self.assertEqual(mapped["an_sars2"], "1")


if __name__ == "__main__":
    unittest.main()
