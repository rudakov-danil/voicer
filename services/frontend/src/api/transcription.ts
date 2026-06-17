import apiClient from './client'

export interface TranscriptSegmentInput {
  speaker_role: 'seller' | 'customer'
  text: string
  start_ms?: number
  end_ms?: number
}

export interface UploadTranscriptParams {
  store_id: string
  seller_id: string
  session_date?: string
  segments?: TranscriptSegmentInput[]
  raw_text?: string
  // Метаданные звонка — для тестирования телефонийного пайплайна без аудио
  call_direction?: 'inbound' | 'outbound'
  client_phone?: string
  operator_phone?: string
}

export interface UploadTranscriptResponse {
  recording_id: string
  transcript_id: string
  segments_count: number
  duration_seconds: number
}

export const transcriptionApi = {
  uploadTranscript: async (params: UploadTranscriptParams): Promise<UploadTranscriptResponse> => {
    const response = await apiClient.post<UploadTranscriptResponse>(
      '/api/v1/transcription/upload-transcript',
      params,
      { timeout: 60000 },
    )
    return response.data
  },
}
