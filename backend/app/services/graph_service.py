import uuid
import logging
import numpy as np
from sqlalchemy.orm import Session
from app.models.database import Folder, Document, GraphNode, GraphEdge
from app.models.schemas import GraphNodeInfo, GraphEdgeInfo, GraphDataResponse
from app.services.vectorstore import vector_store

logger = logging.getLogger(__name__)

class GraphService:
    @staticmethod
    def get_full_graph(db: Session, user_id: str) -> GraphDataResponse:
        """
        Builds a structural graph showing Folders and Documents for a user,
        plus auto-discovered semantic relationships between documents.
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
        doc_ids = [doc.id for doc in documents]
        
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

        # 4. Fetch Semantic Relationships from DB
        semantic_edges = db.query(GraphEdge).filter(
            GraphEdge.source_node_id.in_(doc_ids),
            GraphEdge.relationship == "related"
        ).all()
        
        for edge in semantic_edges:
            edges.append(GraphEdgeInfo(
                id=edge.id,
                source=f"doc_{edge.source_node_id}",
                target=f"doc_{edge.target_node_id}",
                label="related",
                weight=edge.weight
            ))
        
        return GraphDataResponse(nodes=nodes, edges=edges)

    @staticmethod
    def compute_semantic_discovery(db: Session, user_id: str):
        """
        Discovers relationships between documents by comparing their semantic centroids.
        Centroid = Average of all chunk embeddings for a document.
        """
        logger.info("Starting semantic discovery for user %s", user_id)
        documents = db.query(Document).filter(Document.user_id == user_id).all()
        if len(documents) < 2:
            return 0

        centroids = {}
        index = vector_store._get_index()

        for doc in documents:
            try:
                # Fetch all vectors for this document using list + fetch
                # instead of ANN query with zero vector (which returns unreliable results)
                all_ids = []
                for id_batch in index.list(prefix=f"{doc.id}_"):
                    all_ids.extend(id_batch)

                if not all_ids:
                    # Fallback: try without prefix if IDs don't follow prefix convention
                    query_response = index.query(
                        vector=[0.0] * 384,
                        filter={"document_id": {"$eq": doc.id}},
                        top_k=100,
                        include_values=True
                    )
                    vectors = [match['values'] for match in query_response.get('matches', [])]
                else:
                    # Fetch actual vectors by ID — accurate, not approximate
                    fetch_response = index.fetch(ids=all_ids)
                    vectors = [v['values'] for v in fetch_response.get('vectors', {}).values()]

                if vectors:
                    centroids[doc.id] = np.mean(vectors, axis=0)
                    logger.debug("Computed centroid for %s from %d chunks", doc.filename, len(vectors))
            except Exception as e:
                logger.error("Failed to compute centroid for document %s: %s", doc.id, e)

        # Pairwise similarity
        doc_ids = list(centroids.keys())
        edges_created = 0
        threshold = 0.65

        # Clear old related edges for this user
        db.query(GraphEdge).filter(
            GraphEdge.source_node_id.in_(doc_ids),
            GraphEdge.relationship == "related"
        ).delete(synchronize_session=False)

        for i in range(len(doc_ids)):
            for j in range(i + 1, len(doc_ids)):
                id1, id2 = doc_ids[i], doc_ids[j]
                v1, v2 = centroids[id1], centroids[id2]
                
                # Cosine similarity
                sim = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2))
                
                if sim >= threshold:
                    # Create bidirectional relationship or single directed? 
                    # Roadsmap says doc1 ↔ doc2. We store as single edge for economy.
                    new_edge = GraphEdge(
                        id=str(uuid.uuid4()),
                        source_node_id=id1,
                        target_node_id=id2,
                        relationship="related",
                        weight=float(sim)
                    )
                    db.add(new_edge)
                    edges_created += 1

        db.commit()
        logger.info("Semantic discovery complete. Created %d related edges.", edges_created)
        return edges_created

graph_service = GraphService()
