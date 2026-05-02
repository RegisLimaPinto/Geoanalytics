#!/bin/bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -d 'username=regislimapinto@gmail.com&password=admin@geo2024' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

echo "Token: ${TOKEN:0:25}..."

curl -s -X POST http://localhost:8000/api/analysis/run \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{"commodity":"OURO","bbox":{"lonMin":-48.5,"latMin":-15.5,"lonMax":-47.5,"latMax":-14.5},"resolution":0.05,"radiusKm":20,"targets":[{"id":"t1","name":"T1","lat":-15.0,"lon":-48.0}]}' \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
if d.get('status') == 'completed':
    print('==> ANALISE OK! job_id:', d.get('job_id','?'))
elif 'detail' in d:
    print('==> ERRO:', d['detail'])
else:
    print('==> RESPOSTA:', d)
"
