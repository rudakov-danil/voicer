import apiClient from './client'

export const recorderApi = {
  getRecordings: async (params?: { limit?: number; offset?: number; status?: string }) => {
    const response = await apiClient.get('/api/v1/recorder/recordings', { params })
    return response.data as { items: any[]; total: number }
  },

  getAudioUrl: async (recordingId: string) => {
    const response = await apiClient.get<{ url: string }>(
      `/api/v1/recorder/recordings/${recordingId}/audio`
    )
    return response.data.url
  },

  // Streams the audio file through the API gateway and returns a blob URL the
  // <audio> element can use. The presigned MinIO URL targets an internal Docker
  // hostname (`minio:9000`) the browser cannot reach, so we proxy through the
  // recorder-service.
  getAudioBlobUrl: async (recordingId: string) => {
    const response = await apiClient.get<Blob>(
      `/api/v1/recorder/recordings/${recordingId}/audio/stream`,
      { responseType: 'blob' }
    )
    return URL.createObjectURL(response.data)
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

  // ─── Телефония ─────────────────────────────────────────────────────────────

  uploadCall: async (
    file: File,
    params: {
      seller_id: string
      store_id: string
      direction: 'inbound' | 'outbound'
      client_phone?: string
      operator_phone?: string
      session_date?: string
      channel_mode?: 'auto' | 'stereo' | 'mono'
    },
    onProgress?: (percent: number) => void
  ) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('seller_id', params.seller_id)
    formData.append('store_id', params.store_id)
    formData.append('direction', params.direction)
    if (params.client_phone) formData.append('client_phone', params.client_phone)
    if (params.operator_phone) formData.append('operator_phone', params.operator_phone)
    if (params.session_date) formData.append('session_date', params.session_date)
    formData.append('channel_mode', params.channel_mode || 'auto')

    const response = await apiClient.post('/api/v1/recorder/telephony/calls', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000,
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          onProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total))
        }
      },
    })
    return response.data
  },

  getTelephonySettings: async () => {
    const response = await apiClient.get('/api/v1/recorder/telephony/settings')
    return response.data as {
      is_enabled: boolean
      webhook_token: string
      webhook_url_path: string
      default_store_id: string | null
      default_seller_id: string | null
      operator_channel: number
      operator_mapping: Record<string, string> | null
      scorable_categories: string[] | null
    }
  },

  updateTelephonySettings: async (data: {
    is_enabled?: boolean
    default_store_id?: string
    default_seller_id?: string
    operator_channel?: number
    operator_mapping?: Record<string, string>
    scorable_categories?: string[]
    regenerate_token?: boolean
  }) => {
    const response = await apiClient.put('/api/v1/recorder/telephony/settings', data)
    return response.data
  },
}
