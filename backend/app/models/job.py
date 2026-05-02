import json
from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.orm import declarative_base

from app.models.user import Base


class AnalysisJob(Base):
    __tablename__ = "analysis_jobs"

    id = Column(String(36), primary_key=True)  # UUID
    user_id = Column(Integer, nullable=False, index=True)
    result_json = Column(Text, nullable=False)  # JSON-serialized AnalysisResult
    created_at = Column(DateTime, default=datetime.utcnow)

    def get_result(self) -> dict:
        return json.loads(self.result_json)
