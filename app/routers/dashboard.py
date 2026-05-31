from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import SavedProjection
from app.schemas import DashboardRequest
from app.services.calculations import dashboard_summary

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.post("/{projection_id}/summary")
def get_dashboard_summary(projection_id: int, payload: DashboardRequest | None = None, db: Session = Depends(get_db)):
    projection = db.get(SavedProjection, projection_id)
    if not projection:
        raise HTTPException(status_code=404, detail="Projection not found")
    return dashboard_summary(projection)


@router.get("/{projection_id}/charts")
def get_chart_ready_data(projection_id: int, db: Session = Depends(get_db)):
    projection = db.get(SavedProjection, projection_id)
    if not projection:
        raise HTTPException(status_code=404, detail="Projection not found")
    return dashboard_summary(projection)["datasets"]
