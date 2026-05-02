import sys
sys.path.insert(0, '/app')
from app.auth import create_access_token, decode_token
tok = create_access_token({'sub': 1})
print('TOKEN_PREFIX:', tok[:40])
d = decode_token(tok)
print('DECODED:', d)
print('AUTH_OK:', d is not None and d.get('sub') == 1)
