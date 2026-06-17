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
    // ─── Телефония ─────────────────────────────────────────────────────────────
    uploadCall: async (file, params, onProgress) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('seller_id', params.seller_id);
        formData.append('store_id', params.store_id);
        formData.append('direction', params.direction);
        if (params.client_phone)
            formData.append('client_phone', params.client_phone);
        if (params.operator_phone)
            formData.append('operator_phone', params.operator_phone);
        if (params.session_date)
            formData.append('session_date', params.session_date);
        formData.append('channel_mode', params.channel_mode || 'auto');
        const response = await apiClient.post('/api/v1/recorder/telephony/calls', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 300000,
            onUploadProgress: (progressEvent) => {
                if (onProgress && progressEvent.total) {
                    onProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total));
                }
            },
        });
        return response.data;
    },
    getTelephonySettings: async () => {
        const response = await apiClient.get('/api/v1/recorder/telephony/settings');
        return response.data;
    },
    updateTelephonySettings: async (data) => {
        const response = await apiClient.put('/api/v1/recorder/telephony/settings', data);
        return response.data;
    },
};
