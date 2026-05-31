from sqlalchemy.orm import Session

from app.models import ProjectionType, SavedProjection


def save_or_update_projection(
    db: Session,
    *,
    title: str,
    projection_type: ProjectionType,
    notes: str | None,
    assumptions_snapshot: dict,
    generated_rows: list,
) -> SavedProjection:
    clean_title = title.strip()
    projection = (
        db.query(SavedProjection)
        .filter(
            SavedProjection.projection_type == projection_type,
            SavedProjection.title == clean_title,
        )
        .first()
    )
    if projection:
        projection.notes = notes
        projection.assumptions_snapshot = assumptions_snapshot
        projection.generated_rows = generated_rows
    else:
        projection = SavedProjection(
            title=clean_title,
            projection_type=projection_type,
            notes=notes,
            assumptions_snapshot=assumptions_snapshot,
            generated_rows=generated_rows,
        )
        db.add(projection)
    db.commit()
    db.refresh(projection)
    return projection
