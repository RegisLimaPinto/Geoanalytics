#!/bin/bash
TOKEN=$(curl -s -X POST https://mineracaoanalytics.cloud/api/auth/login \
  -d 'username=regislimapinto@gmail.com&password=admin@geo2024' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

echo "TOKEN OK: ${TOKEN:0:25}..."

RESULT=$(curl -s -X POST https://mineracaoanalytics.cloud/api/analysis/run \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{"commodity":"OURO","bbox":{"lonMin":-48.5,"latMin":-15.5,"lonMax":-47.5,"latMax":-14.5},"resolution":0.05,"radiusKm":20,"targets":[{"name":"T1","lat":-15.0,"lon":-48.0}]}')

echo "RESULT: $RESULT" | head -c 300

echo "$RESULT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if d.get('status') == 'completed':
    print('==> ANALISE OK! job_id:', d.get('job_id','?')[:20])
else:
    print('==> ERRO:', d.get('detail', d))
"
