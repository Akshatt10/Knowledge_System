import React, { useEffect, useState, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { graphService } from '../services/api';
import { Loader2, ZoomIn, ZoomOut, Maximize2, Zap } from 'lucide-react';

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
    const [isRecomputing, setIsRecomputing] = useState(false);
    const [hasInitialCentered, setHasInitialCentered] = useState(false);
    const fgRef = useRef<any>();

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
            setHasInitialCentered(false); // Reset when data changes
        } catch (err: any) {
            setError(err.message || 'Failed to load graph');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchGraph();
    }, []);

    useEffect(() => {
        if (fgRef.current) {
            // Add custom forces to spread things out and make it feel more organic
            fgRef.current.d3Force('charge').strength(-400); // Even stronger repulsion
            fgRef.current.d3Force('link').distance(90);    // Even longer links
        }
    }, [graphData]);

    const handleEngineStop = () => {
        if (!hasInitialCentered && fgRef.current && graphData.nodes.length > 0) {
            fgRef.current.zoomToFit(800, 150);
            setHasInitialCentered(true);
        }
    };

    const handleRecompute = async () => {
        if (isRecomputing) return;
        setIsRecomputing(true);
        try {
            await graphService.recomputeGraph();
            await fetchGraph(); // Refresh after recomputing
        } catch (err: any) {
            console.error('Recomputation failed:', err);
        } finally {
            setIsRecomputing(false);
        }
    };

    const handleNodeClick = (node: any) => {
        // Clear previous highlights or toggle
        if (highlightNodes.has(node.id) && highlightNodes.size === 1) {
            setHighlightNodes(new Set());
            setHighlightLinks(new Set());
            return;
        }

        const newHighlightedNodes = new Set<string>();
        const newHighlightedLinks = new Set<any>();

        newHighlightedNodes.add(node.id);
        graphData.links.forEach((link: any) => {
            const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
            const targetId = typeof link.target === 'object' ? link.target.id : link.target;
            
            if (sourceId === node.id || targetId === node.id) {
                newHighlightedNodes.add(sourceId);
                newHighlightedNodes.add(targetId);
                newHighlightedLinks.add(link);
            }
        });

        setHighlightNodes(newHighlightedNodes);
        setHighlightLinks(newHighlightedLinks);

        // Center and zoom in
        if (fgRef.current) {
            fgRef.current.centerAt(node.x, node.y, 1000);
            fgRef.current.zoom(2.5, 1000);
        }
    };

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-red-400 bg-[#0B0F1A]">
                <p className="text-lg">Error: {error}</p>
            </div>
        );
    }

    return (
        <div className="h-screen w-full bg-[#0B0F1A] overflow-hidden relative">
            {/* Header */}
            <div className="absolute top-6 left-6 z-10 flex flex-col gap-4">
                <div className="bg-[#161B22]/90 backdrop-blur-md p-5 rounded-2xl border border-slate-700 shadow-2xl">
                    <h1 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
                        Knowledge Vault
                        <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/30">AI Powered</span>
                    </h1>
                    <p className="text-slate-400 text-sm max-w-xs leading-relaxed">
                        Visualize relationships across your concepts and documents.
                    </p>
                </div>
                
                <div className="flex gap-2 group relative">
                    <button 
                        onClick={handleRecompute}
                        disabled={isRecomputing}
                        title="Recompute AI Relationships"
                        className={`p-2.5 rounded-xl border transition-all shadow-lg flex items-center gap-2 ${
                            isRecomputing 
                                ? 'bg-amber-500/20 border-amber-500/50 text-amber-500 cursor-not-allowed' 
                                : 'bg-[#161B22]/90 hover:bg-slate-700 border-slate-700 text-white hover:scale-105 active:scale-95'
                        }`}
                    >
                        <Zap size={22} className={isRecomputing ? 'animate-pulse' : ''} />
                        {isRecomputing && <span className="text-xs font-bold animate-pulse">Analyzing...</span>}
                    </button>
                    
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
                nodeRelSize={10}
                nodeCanvasObject={(node: any, ctx, globalScale) => {
                    const label = node.label;
                    const fontSize = 16 / globalScale;
                    ctx.font = `${fontSize}px "Inter", sans-serif`;
                    const textWidth = ctx.measureText(label).width;

                    const isHighlighted = highlightNodes.size === 0 || highlightNodes.has(node.id);
                    const isFocus = highlightNodes.has(node.id);
                    
                    // Node Color & Size
                    const baseColor = node.type === 'folder' ? '#3B82F6' : (node.type === 'document' ? '#10B981' : '#F59E0B');
                    const color = isHighlighted ? baseColor : `${baseColor}33`;
                    const baseSize = node.type === 'folder' ? 12 : 9;
                    const size = isFocus ? baseSize * 1.3 : baseSize;
                    
                    // Draw outer glow
                    ctx.beginPath();
                    ctx.arc(node.x!, node.y!, size + 8, 0, 2 * Math.PI, false);
                    ctx.fillStyle = isFocus ? `${baseColor}55` : (isHighlighted ? `${baseColor}22` : 'transparent');
                    ctx.fill();

                    // Draw Node Circle
                    ctx.beginPath();
                    ctx.arc(node.x!, node.y!, size, 0, 2 * Math.PI, false);
                    ctx.fillStyle = color;
                    ctx.fill();
                    
                    if (isHighlighted) {
                        ctx.beginPath();
                        ctx.arc(node.x!, node.y!, size * 0.4, 0, 2 * Math.PI, false);
                        ctx.fillStyle = '#FFFFFFEE';
                        ctx.fill();
                    }

                    // Node Label
                    if (isFocus || (isHighlighted && (globalScale > 0.6 || node.type === 'folder'))) {
                        const labelOffset = size + 16;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        
                        ctx.fillStyle = 'rgba(11, 15, 26, 0.9)';
                        ctx.fillRect(node.x! - textWidth/2 - 8, node.y! + labelOffset - fontSize/2 - 4, textWidth + 16, fontSize + 8);

                        ctx.fillStyle = isFocus ? '#FFFFFF' : 'rgba(255, 255, 255, 0.95)';
                        ctx.fillText(label, node.x!, node.y! + labelOffset);
                        
                        if (isFocus) {
                            ctx.strokeStyle = baseColor;
                            ctx.lineWidth = 2 / globalScale;
                            ctx.strokeRect(node.x! - textWidth/2 - 8, node.y! + labelOffset - fontSize/2 - 4, textWidth + 16, fontSize + 8);
                        }
                    }
                }}
                linkColor={(link: any) => highlightLinks.size === 0 || highlightLinks.has(link) ? (link.label === 'related' ? 'rgba(240, 153, 123, 0.4)' : 'rgba(255, 255, 255, 0.15)') : 'rgba(255, 255, 255, 0.02)'}
                linkWidth={(link: any) => highlightLinks.has(link) ? 3 : 1.5}
                linkLineDash={(link: any) => link.label === 'related' ? [4, 4] : null}
                linkDirectionalParticles={(link: any) => highlightLinks.has(link) ? 5 : (highlightLinks.size === 0 ? 3 : 0)}
                linkDirectionalParticleSpeed={0.005}
                linkDirectionalParticleWidth={(link: any) => highlightLinks.has(link) ? 4 : 2.5}
                linkDirectionalParticleColor={(link: any) => link.label === 'related' ? 'rgba(240, 153, 123, 0.7)' : (highlightLinks.has(link) ? '#60A5FA' : 'rgba(59, 130, 246, 0.4)')}
                onNodeClick={handleNodeClick}
                onBackgroundClick={() => {
                    setHighlightNodes(new Set());
                    setHighlightLinks(new Set());
                }}
                onEngineStop={handleEngineStop}
                cooldownTicks={150}
                d3VelocityDecay={0.4}
                d3AlphaDecay={0.01}
                warmupTicks={60}
            />

            {loading && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0B0F1A]/80 backdrop-blur-sm">
                    <div className="relative">
                        <Loader2 className="animate-spin text-blue-500 w-16 h-16" />
                        <div className="absolute inset-0 animate-ping bg-blue-500/20 rounded-full scale-150"></div>
                    </div>
                    <p className="mt-8 text-white font-medium tracking-widest text-sm uppercase animate-pulse">
                        Building your Knowledge Vault...
                    </p>
                </div>
            )}
        </div>
    );
};

export default KnowledgeGraph;
