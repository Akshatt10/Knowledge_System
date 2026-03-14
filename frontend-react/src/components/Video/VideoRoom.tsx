import React, { useEffect, useState } from 'react';
import {
    ControlBar,
    GridLayout,
    LiveKitRoom,
    ParticipantTile,
    RoomAudioRenderer,
    useTracks,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track } from 'livekit-client';
import { X, Maximize2, Minimize2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { videoService } from '../../services/video';

interface VideoRoomProps {
    roomName: string;
    onClose: () => void;
}

const VideoRoom: React.FC<VideoRoomProps> = ({ roomName, onClose }) => {
    const [token, setToken] = useState<string>('');
    const [isMaximized, setIsMaximized] = useState(false);
    const serverUrl = import.meta.env.VITE_LIVEKIT_URL || 'wss://your-livekit-url.livekit.cloud';

    useEffect(() => {
        const fetchToken = async () => {
            try {
                const response = await videoService.getVideoToken(roomName);
                if (response.data.token === 'DEVELOPMENT_TOKEN') {
                    console.warn("Using development fallback token. Please configure LIVEKIT_API_KEY.");
                    setToken('DEVELOPMENT_TOKEN');
                    return;
                }
                setToken(response.data.token);
            } catch (error) {
                console.error('Failed to fetch video token:', error);
            }
        };

        fetchToken();
    }, [roomName]);

    if (!token && token !== 'DEVELOPMENT_TOKEN') {
        return (
            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="fixed bottom-24 right-6 w-80 h-48 glass-panel flex flex-col items-center justify-center z-[100] border border-white/10 shadow-2xl"
            >
                <div className="relative w-12 h-12 mb-4">
                    <div className="absolute inset-0 border-4 border-accentGlow/20 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-t-accentGlow rounded-full animate-spin"></div>
                </div>
                <span className="text-sm font-outfit font-bold text-white tracking-wide">Syncing Interface...</span>
                <span className="text-[10px] text-textSec mt-1 uppercase tracking-widest font-bold">WebRTC Handshake</span>
            </motion.div>
        );
    }

    return (
        <AnimatePresence>
            <motion.div 
                layout
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ 
                    opacity: 1, 
                    scale: 1, 
                    y: 0,
                    width: isMaximized ? 'calc(100% - 32px)' : 420,
                    height: isMaximized ? 'calc(100% - 32px)' : 320,
                    top: isMaximized ? 16 : 'auto',
                    left: isMaximized ? 16 : 'auto',
                    right: isMaximized ? 'auto' : 24,
                    bottom: isMaximized ? 'auto' : 96
                }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed z-[1000] rounded-3xl overflow-hidden shadow-[0_32px_64px_-12px_rgba(0,0,0,0.6)] border border-white/10 bg-black/60 backdrop-blur-3xl"
            >
                <LiveKitRoom
                    video={true}
                    audio={true}
                    token={token}
                    serverUrl={serverUrl}
                    data-lk-theme="default"
                    className="h-full flex flex-col relative"
                    onDisconnected={onClose}
                >
                    {/* Premium Header */}
                    <div className="absolute top-0 left-0 right-0 h-16 flex items-center justify-between px-6 bg-gradient-to-b from-black/80 via-black/40 to-transparent z-50 pointer-events-none">
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-danger animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]"></div>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Secure Connection</span>
                                <span className="text-xs font-bold text-white truncate max-w-[150px]">{roomName}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 pointer-events-auto">
                            <button 
                                onClick={() => setIsMaximized(!isMaximized)}
                                className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all border border-white/5"
                            >
                                {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={18} />}
                            </button>
                            <button 
                                onClick={onClose}
                                className="w-9 h-9 flex items-center justify-center rounded-xl bg-danger/10 hover:bg-danger/20 text-danger/70 hover:text-danger transition-all border border-danger/20"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-hidden p-2 mt-4">
                        <MyVideoConference />
                    </div>

                    {/* Integrated Control Bar */}
                    <div className="px-6 py-4 bg-transparent border-t border-white/5 flex justify-center items-center">
                        <ControlBar 
                            variation="minimal" 
                            className="bg-black/40 rounded-2xl border border-white/10 px-2 py-1 shadow-2xl backdrop-blur-md" 
                        />
                    </div>
                    
                    <RoomAudioRenderer />
                </LiveKitRoom>
            </motion.div>
        </AnimatePresence>
    );
};

function MyVideoConference() {
    const tracks = useTracks(
        [
            { source: Track.Source.Camera, withPlaceholder: true },
            { source: Track.Source.ScreenShare, withPlaceholder: false },
        ],
        { onlySubscribed: false },
    );

    return (
        <div className="h-full w-full relative">
            <GridLayout 
                tracks={tracks} 
                className="h-full w-full gap-4"
                style={{ 
                    height: '100%',
                    display: 'grid',
                    gridTemplateColumns: tracks.length > 2 ? 'repeat(auto-fit, minmax(200px, 1fr))' : tracks.length === 2 ? 'repeat(2, 1fr)' : '1fr'
                }}
            >
                <ParticipantTile 
                    className="lk-participant-tile rounded-2xl overflow-hidden border border-white/5 bg-black/20 backdrop-blur-md shadow-2xl transition-all duration-500 hover:scale-[1.02] hover:border-white/20"
                />
            </GridLayout>
            
            {/* Custom UI Overrides Moved Outside GridLayout */}
            <style>{`
                .lk-control-bar {
                    background: rgba(0, 0, 0, 0.4) !important;
                    border: 1px solid rgba(255, 255, 255, 0.1) !important;
                    border-radius: 1.5rem !important;
                    backdrop-filter: blur(20px) !important;
                    padding: 0.5rem 1rem !important;
                    width: fit-content !important;
                    margin: 0 auto !important;
                }
                .lk-button {
                    background: transparent !important;
                    border-radius: 1rem !important;
                    transition: all 0.3s ease !important;
                    color: rgba(255, 255, 255, 0.7) !important;
                }
                .lk-button:hover {
                    background: rgba(255, 255, 255, 0.05) !important;
                    color: white !important;
                }
                .lk-button-active {
                    background: #a855f720 !important;
                    color: #d8b4fe !important;
                    border: 1px solid #a855f740 !important;
                }
                .lk-focus-layout {
                    background: transparent !important;
                }
                .lk-participant-name {
                    font-size: 0.75rem !important;
                    font-weight: 700 !important;
                    background: rgba(0, 0, 0, 0.5) !important;
                    padding: 0.25rem 0.75rem !important;
                    border-radius: 0.75rem !important;
                    backdrop-filter: blur(4px) !important;
                    bottom: 12px !important;
                    left: 12px !important;
                    color: rgba(255, 255, 255, 0.9) !important;
                    border: 1px solid rgba(255, 255, 255, 0.1) !important;
                }
            `}</style>
        </div>
    );
}

export default VideoRoom;
