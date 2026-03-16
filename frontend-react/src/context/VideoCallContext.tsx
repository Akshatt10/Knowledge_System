import React, { createContext, useContext, useState, useCallback } from 'react';
import VideoRoom from '../components/Video/VideoRoom';

interface VideoCallContextType {
    activeCallRoom: string | null;
    showVideo: boolean;
    startCall: (roomName: string) => void;
    endCall: () => void;
}

const VideoCallContext = createContext<VideoCallContextType>({
    activeCallRoom: null,
    showVideo: false,
    startCall: () => {},
    endCall: () => {},
});

export const useVideoCall = () => useContext(VideoCallContext);

export const VideoCallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [activeCallRoom, setActiveCallRoom] = useState<string | null>(null);
    const [showVideo, setShowVideo] = useState(false);

    const startCall = useCallback((roomName: string) => {
        setActiveCallRoom(roomName);
        setShowVideo(true);
    }, []);

    const endCall = useCallback(() => {
        setShowVideo(false);
        setActiveCallRoom(null);
    }, []);

    return (
        <VideoCallContext.Provider value={{ activeCallRoom, showVideo, startCall, endCall }}>
            {children}

            {/* Global Video Overlay — lives outside Routes, survives navigation */}
            {showVideo && activeCallRoom && (
                <VideoRoom
                    roomName={activeCallRoom}
                    onClose={endCall}
                />
            )}
        </VideoCallContext.Provider>
    );
};
