import uuid
from sqlalchemy.orm import Session
from app.models.database import Folder, Document, GraphNode, GraphEdge
from app.models.schemas import GraphNodeInfo, GraphEdgeInfo, GraphDataResponse

class GraphService:
    @staticmethod
    def get_full_graph(db: Session, user_id: str) -> GraphDataResponse:
        """
        Builds a structural graph showing Folders and Documents for a user.
        In the future, this will also include concept nodes extracted from text.
        """
        nodes = []
        edges = []

        # 1. Fetch Folders
        folders = db.query(Folder).filter(Folder.user_id == user_id).all()
        for folder in folders:
            nodes.append(GraphNodeInfo(
                id=f"folder_{folder.id}",
                label=folder.name,
                type="folder",
                folder_id=folder.id
            ))

        # 2. Fetch Documents
        documents = db.query(Document).filter(Document.user_id == user_id).all()
        for doc in documents:
            node_id = f"doc_{doc.id}"
            nodes.append(GraphNodeInfo(
                id=node_id,
                label=doc.filename,
                type="document",
                document_id=doc.id,
                folder_id=doc.folder_id,
                chunk_count=int(doc.chunk_count) if doc.chunk_count else 0
            ))

            # 3. Create structural edges (Folder -> Document)
            if doc.folder_id:
                edges.append(GraphEdgeInfo(
                    id=str(uuid.uuid4()),
                    source=f"folder_{doc.folder_id}",
                    target=node_id,
                    label="contains"
                ))

        # 4. (Extension) Semantic relationships from GraphEdge table
        # This will be populated by an LLM-based entity extractor in a follow-up task.
        
        return GraphDataResponse(nodes=nodes, edges=edges)

graph_service = GraphService()
