#!/bin/bash
set -e

echo "=== Teste direto porta 8000 (sem Caddy) ==="
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -d 'username=regislimapinto@gmail.com&password=admin@geo2024' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
echo "Token gerado: ${TOKEN:0:30}..."

RES=$(curl -s -X POST http://localhost:8000/api/analysis/run \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{"commodity":"OURO","bbox":{"lonMin":-48.5,"latMin":-15.5,"lonMax":-47.5,"latMax":-14.5},"resolution":0.05,"radiusKm":20,"targets":[{"name":"T1","lat":-15.0,"lon":-48.0}]}')
echo "Porta 8000: $RES" | head -c 200
echo ""

echo "=== Teste via HTTPS (com Caddy) ==="
TOKEN2=$(curl -s -X POST https://mineracaoanalytics.cloud/api/auth/login \
  -d 'username=regislimapinto@gmail.com&password=admin@geo2024' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
echo "Token gerado: ${TOKEN2:0:30}..."

RES2=$(curl -s -X POST https://mineracaoanalytics.cloud/api/analysis/run \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${TOKEN2}" \
  -d '{"commodity":"OURO","bbox":{"lonMin":-48.5,"latMin":-15.5,"lonMax":-47.5,"latMax":-14.5},"resolution":0.05,"radiusKm":20,"targets":[{"name":"T1","lat":-15.0,"lon":-48.0}]}')
echo "Via Caddy: $RES2" | head -c 200
echo ""
