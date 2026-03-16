from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.services.auth import get_db, get_current_user
from app.models.database import User
from app.models.schemas import GraphDataResponse
from app.services.graph_service import graph_service

router = APIRouter()

@router.get("/", response_model=GraphDataResponse)
def get_graph_data(
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """
    Returns nodes and edges for the knowledge graph.
    Matches the Obsidian-style force-directed graph data structure.
    """
    try:
        data = graph_service.get_full_graph(db, current_user.id)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/recompute")
def recompute_graph(
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """
    Triggers the semantic discovery process to find relationships between documents.
    """
    try:
        edges_created = graph_service.compute_semantic_discovery(db, current_user.id)
        return {"message": "Success", "edges_created": edges_created}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
