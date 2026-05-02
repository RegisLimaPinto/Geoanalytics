import os, sys
sys.path.insert(0, '/app')

print("SECRET_KEY:", os.getenv("SECRET_KEY","NOT SET")[:20], "...")

from jose import jwt, JWTError
from datetime import datetime, timedelta

SECRET_KEY = os.getenv("SECRET_KEY", "")
ALGORITHM = "HS256"

# Encode
payload = {"sub": 1, "exp": datetime.utcnow() + timedelta(hours=1)}
token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
print("TOKEN TYPE:", type(token))
print("TOKEN[:30]:", token[:30])

# Decode raw
try:
    decoded = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    print("DECODED OK:", decoded)
except JWTError as e:
    print("JWTERROR:", e)
except Exception as e:
    print("OTHER ERROR:", type(e).__name__, e)
