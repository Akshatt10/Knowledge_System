import React, { useEffect, useState, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { graphService } from '../services/api';
import { Loader2, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface GraphNode {
    id: string;
    label: string;
    type: 'folder' | 'document' | 'concept';
    folder_id?: string;
    document_id?: string;
    chunk_count?: number;
}

interface GraphEdge {
    id: string;
    source: string;
    target: string;
    label: string;
}

interface GraphData {
    nodes: GraphNode[];
    links: GraphEdge[];
}

const KnowledgeGraph: React.FC = () => {
    const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [highlightNodes, setHighlightNodes] = useState<Set<string>>(new Set());
    const [highlightLinks, setHighlightLinks] = useState<Set<any>>(new Set());
    const fgRef = useRef<any>();

    useEffect(() => {
        const fetchGraph = async () => {
            try {
                const response = await graphService.getGraphData();
                const data = {
                    nodes: response.data.nodes,
                    links: response.data.edges.map((e: any) => ({
                        ...e,
                        source: e.source,
                        target: e.target
                    }))
                };
                setGraphData(data);
            } catch (err: any) {
                setError(err.message || 'Failed to load graph');
            } finally {
                setLoading(false);
            }
        };

        fetchGraph();
    }, []);

    const handleNodeClick = (node: any) => {
        // Clear previous highlights or toggle
        if (highlightNodes.has(node.id) && highlightNodes.size === 1) {
            setHighlightNodes(new Set());
            setHighlightLinks(new Set());
            return;
        }

        const neighbors = new Set<string>();
        const links = new Set<any>();
        
        neighbors.add(node.id);
        graphData.links.forEach((link: any) => {
            const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
            const targetId = typeof link.target === 'object' ? link.target.id : link.target;
            
            if (sourceId === node.id) {
                neighbors.add(targetId);
                links.add(link);
            } else if (targetId === node.id) {
                neighbors.add(sourceId);
                links.add(link);
            }
        });

        setHighlightNodes(neighbors);
        setHighlightLinks(links);

        // Center on node
        fgRef.current.centerAt(node.x, node.y, 800);
        fgRef.current.zoom(1.8, 800);
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center absolute inset-0 text-slate-400 z-50 bg-[#0B0F1A]">
                <Loader2 className="w-12 h-12 animate-spin mb-4 text-blue-500" />
                <p className="text-xl font-medium tracking-wide">Building your Knowledge Vault...</p>
                <p className="text-sm text-slate-500 mt-2">Mapping relationships and indexing concepts</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-red-400 bg-[#0B0F1A]">
                <p className="text-lg">Error: {error}</p>
            </div>
        );
    }

    return (
        <div className="relative w-full h-[calc(100vh-100px)] bg-[#0B0F1A] rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
            {/* Header / Controls */}
            <div className="absolute top-6 left-6 z-10 flex flex-col gap-4">
                <div className="bg-[#161B22]/90 backdrop-blur-md p-5 rounded-xl border border-slate-700 shadow-2xl">
                    <h2 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                        Knowledge Graph
                    </h2>
                    <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">
                        {graphData.nodes.length} Nodes • {graphData.links.length} Relations
                    </p>
                </div>
                
                <div className="flex gap-2">
                    <button 
                        onClick={() => fgRef.current.zoom(fgRef.current.zoom() * 1.5, 400)}
                        title="Zoom In"
                        className="p-2.5 bg-[#161B22]/90 hover:bg-slate-700 rounded-xl border border-slate-700 text-white transition-all hover:scale-105 active:scale-95 shadow-lg"
                    >
                        <ZoomIn size={22} />
                    </button>
                    <button 
                        onClick={() => fgRef.current.zoom(fgRef.current.zoom() / 1.5, 400)}
                        title="Zoom Out"
                        className="p-2.5 bg-[#161B22]/90 hover:bg-slate-700 rounded-xl border border-slate-700 text-white transition-all hover:scale-105 active:scale-95 shadow-lg"
                    >
                        <ZoomOut size={22} />
                    </button>
                    <button 
                        onClick={() => fgRef.current.zoomToFit(800, 100)}
                        title="Fit View"
                        className="p-2.5 bg-[#161B22]/90 hover:bg-slate-700 rounded-xl border border-slate-700 text-white transition-all hover:scale-105 active:scale-95 shadow-lg"
                    >
                        <Maximize2 size={22} />
                    </button>
                </div>
            </div>

            {/* Legend */}
            <div className="absolute bottom-6 right-6 z-10 bg-[#161B22]/90 backdrop-blur-md p-4 rounded-xl border border-slate-700 flex flex-col gap-3 text-xs shadow-2xl">
                <div className="text-[0.6rem] uppercase tracking-tighter text-slate-500 font-bold mb-1">Entity Types</div>
                <div className="flex items-center gap-3">
                    <div className="w-3.5 h-3.5 rounded-full bg-[#3B82F6] shadow-[0_0_10px_rgba(59,130,246,0.6)]"></div>
                    <span className="text-slate-300 font-medium">Folder</span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="w-3.5 h-3.5 rounded-full bg-[#10B981] shadow-[0_0_10px_rgba(16,185,129,0.6)]"></div>
                    <span className="text-slate-300 font-medium">Document</span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="w-3.5 h-3.5 rounded-full bg-[#F59E0B] shadow-[0_0_10px_rgba(245,158,11,0.6)]"></div>
                    <span className="text-slate-300 font-medium">Concept</span>
                </div>
            </div>

            <ForceGraph2D
                ref={fgRef}
                graphData={graphData}
                nodeLabel="label"
                nodeRelSize={8}
                nodeCanvasObject={(node: any, ctx, globalScale) => {
                    const label = node.label;
                    const fontSize = 14 / globalScale;
                    ctx.font = `${fontSize}px "Inter", sans-serif`;
                    const textWidth = ctx.measureText(label).width;

                    const isHighlighted = highlightNodes.size === 0 || highlightNodes.has(node.id);
                    const isFocus = highlightNodes.has(node.id);
                    
                    // Node Color & Size
                    const baseColor = node.type === 'folder' ? '#3B82F6' : (node.type === 'document' ? '#10B981' : '#F59E0B');
                    const color = isHighlighted ? baseColor : `${baseColor}33`;
                    const baseSize = node.type === 'folder' ? 8 : 6;
                    const size = isFocus ? baseSize * 1.2 : baseSize;
                    
                    // Draw outer glow
                    ctx.beginPath();
                    ctx.arc(node.x!, node.y!, size + 6, 0, 2 * Math.PI, false);
                    ctx.fillStyle = isFocus ? `${baseColor}44` : (isHighlighted ? `${baseColor}11` : 'transparent');
                    ctx.fill();

                    // Draw Node Circle
                    ctx.beginPath();
                    ctx.arc(node.x!, node.y!, size, 0, 2 * Math.PI, false);
                    ctx.fillStyle = color;
                    ctx.fill();
                    
                    if (isHighlighted) {
                        ctx.beginPath();
                        ctx.arc(node.x!, node.y!, size * 0.4, 0, 2 * Math.PI, false);
                        ctx.fillStyle = '#FFFFFFDD';
                        ctx.fill();
                    }

                    // Node Label
                    if (isFocus || (isHighlighted && (globalScale > 0.8 || node.type === 'folder'))) {
                        const labelOffset = size + 12;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        
                        ctx.fillStyle = 'rgba(11, 15, 26, 0.85)';
                        ctx.fillRect(node.x! - textWidth/2 - 6, node.y! + labelOffset - fontSize/2 - 2, textWidth + 12, fontSize + 4);

                        ctx.fillStyle = isFocus ? '#FFFFFF' : 'rgba(255, 255, 255, 0.9)';
                        ctx.fillText(label, node.x!, node.y! + labelOffset);
                        
                        if (isFocus) {
                            ctx.strokeStyle = baseColor;
                            ctx.lineWidth = 1;
                            ctx.strokeRect(node.x! - textWidth/2 - 6, node.y! + labelOffset - fontSize/2 - 2, textWidth + 12, fontSize + 4);
                        }
                    }
                }}
                linkColor={(link: any) => highlightLinks.size === 0 || highlightLinks.has(link) ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.02)'}
                linkWidth={(link: any) => highlightLinks.has(link) ? 2.5 : 1}
                linkDirectionalParticles={(link: any) => highlightLinks.has(link) ? 5 : (highlightLinks.size === 0 ? 3 : 0)}
                linkDirectionalParticleSpeed={0.006}
                linkDirectionalParticleWidth={(link: any) => highlightLinks.has(link) ? 3.5 : 2}
                linkDirectionalParticleColor={(link: any) => highlightLinks.has(link) ? '#60A5FA' : 'rgba(59, 130, 246, 0.4)'}
                onNodeClick={handleNodeClick}
                onBackgroundClick={() => {
                    setHighlightNodes(new Set());
                    setHighlightLinks(new Set());
                }}
                cooldownTicks={100}
                d3VelocityDecay={0.2}
                d3AlphaDecay={0.02}
                warmupTicks={40}
            />
        </div>
    );
};

export default KnowledgeGraph;
