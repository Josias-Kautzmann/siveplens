import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(".env")
conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor()

# Get the first few rows to see what we have
cur.execute("SELECT co_ibge, no_municipio, sg_uf FROM dim_municipio LIMIT 5")
print(f"Sample data: {cur.fetchall()}")

# Check if 999999 exists
cur.execute("SELECT count(*) FROM dim_municipio WHERE co_ibge = '999999'")
print(f"999999 exists: {cur.fetchone()[0] > 0}")

# Check if Brasília standard exists
cur.execute("SELECT co_ibge, no_municipio FROM dim_municipio WHERE co_ibge = '530010'")
print(f"Brasília (530010) exists: {cur.fetchone()}")

cur.close()
conn.close()
