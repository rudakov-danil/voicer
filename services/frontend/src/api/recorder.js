import apiClient from './client';
export const recorderApi = {
    getRecordings: async (params) => {
        const response = await apiClient.get('/api/v1/recorder/recordings', { params });
        return response.data;
    },
    getAudioUrl: async (recordingId) => {
        const response = await apiClient.get(`/api/v1/recorder/recordings/${recordingId}/audio`);
        return response.data.url;
    },
    // Streams the audio file through the API gateway and returns a blob URL the
    // <audio> element can use. The presigned MinIO URL targets an internal Docker
    // hostname (`minio:9000`) the browser cannot reach, so we proxy through the
    // recorder-service.
    getAudioBlobUrl: async (recordingId) => {
        const response = await apiClient.get(`/api/v1/recorder/recordings/${recordingId}/audio/stream`, { responseType: 'blob' });
        return URL.createObjectURL(response.data);
    },
    uploadAudio: async (file, params, onProgress) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('seller_id', params.seller_id);
        formData.append('store_id', params.store_id);
        formData.append('session_date', params.session_date);
        const response = await apiClient.post('/api/v1/recorder/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 300000, // 5 min for large files
            onUploadProgress: (progressEvent) => {
                if (onProgress && progressEvent.total) {
                    onProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total));
                }
            },
        });
        return response.data;
    },
};
