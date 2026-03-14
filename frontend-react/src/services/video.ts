import api from './api';

export const videoService = {
    getVideoToken: (roomName: string, participantName?: string) => {
        return api.post('/video/token', { room_name: roomName, participant_name: participantName });
    }
};
