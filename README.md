# 🪨 GeoAnalytics — Análise de Favorabilidade Mineral

Plataforma web completa para análise geoespacial de prospecção mineral baseada na metodologia **PSI Analytics**.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS + Mapbox GL |
| Backend | FastAPI + Python 3.12 |
| Banco | PostgreSQL + PostGIS |
| Geoespacial | GeoServer + GDAL + rasterio |
| Análise | NumPy · SciPy · scikit-learn |

---

## Início Rápido (Docker)

```bash
# 1. Copiar variáveis de ambiente
cp .env.example .env

# 2. Adicionar seu Mapbox token em .env
# VITE_MAPBOX_TOKEN=pk.eyJ1...

# 3. Subir todos os serviços
docker compose up --build
```

| Serviço | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |
| GeoServer | http://localhost:8600/geoserver |

---

## Desenvolvimento Local

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
cp ../.env.example .env   # ajuste VITE_MAPBOX_TOKEN
npm run dev               # http://localhost:3000
```

---

## Pipeline de Análise

1. **Configuração** — bounding box, alvos (lon/lat), commodity, resolução
2. **Dados** — sintéticos (demo) ou reais via GeoTIFF/CSV
3. **Normalização** — RobustScaler por camada
4. **PSI Index** — combinação ponderada de K, U, Th, MAG, GRAV
5. **Zonas prioritárias** — top 5% + clustering DBSCAN
6. **Ranking de subalvos** — score integrado por alvo
7. **Relatório** — PDF com mapas e tabelas

### Pesos do PSI Index (OURO)

| Camada | Peso |
|---|---|
| K (Potássio) | 30% |
| MAG (Magnética) | 30% |
| GRAV (Gravidade) | 20% |
| U (Urânio) | 15% |
| Th (Tório) | 5% |

---

## Estrutura do Projeto

```
geoanalytics/
├── frontend/               # React + Mapbox
│   ├── src/
│   │   ├── pages/          # Home, Analysis, Results
│   │   ├── components/     # Map, Charts, Layout
│   │   └── services/       # API client
│   └── Dockerfile
├── backend/                # FastAPI
│   ├── app/
│   │   ├── api/            # Rotas: analysis, geo
│   │   ├── services/       # psi_index (pipeline)
│   │   └── schemas/        # Pydantic models
│   └── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## ⚠ Limitações

- O PSI Index é um **indicador relativo** de favorabilidade — não é teor, reserva ou laudo geológico
- Os dados **sintéticos** são apenas para demonstração metodológica
- Substitua os dados sintéticos por levantamentos geofísicos reais antes do uso em campo
- Valide as zonas prioritárias com mapeamento geológico e geoquímica

---

*Metodologia baseada em: PSI Analytics — Análise Integrada de Favorabilidade Exploratória Mineral*
