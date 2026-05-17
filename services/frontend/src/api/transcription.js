import apiClient from './client';
export const transcriptionApi = {
    uploadTranscript: async (params) => {
        const response = await apiClient.post('/api/v1/transcription/upload-transcript', params, { timeout: 60000 });
        return response.data;
    },
};
