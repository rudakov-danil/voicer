import apiClient from './client'

export const recorderApi = {
  getAudioUrl: async (recordingId: string) => {
    const response = await apiClient.get<{ url: string }>(
      `/api/v1/recorder/recordings/${recordingId}/audio`
    )
    return response.data.url
  },

  uploadAudio: async (
    file: File,
    params: {
      seller_id: string
      store_id: string
      session_date: string
    },
    onProgress?: (percent: number) => void
  ) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('seller_id', params.seller_id)
    formData.append('store_id', params.store_id)
    formData.append('session_date', params.session_date)

    const response = await apiClient.post('/api/v1/recorder/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000, // 5 min for large files
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          onProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total))
        }
      },
    })
    return response.data
  },
}
