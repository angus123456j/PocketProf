import { useRef, useState } from 'react'
import './App.css'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

function getWsUrl() {
  const base = import.meta.env.VITE_API_URL || ''
  if (base.startsWith('http')) {
    const u = new URL(base)
    const proto = u.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${u.host}/pulse/live`
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/api/pulse/live`
}

function App() {
  const [mode, setMode] = useState('record')
  const [status, setStatus] = useState('idle')
  const [transcript, setTranscript] = useState('')
  const [polishedTranscript, setPolishedTranscript] = useState('')
  const [parseStatus, setParseStatus] = useState('idle')
  const [liveLines, setLiveLines] = useState([])
  const [livePartial, setLivePartial] = useState('')
  const [uploadStatus, setUploadStatus] = useState('idle')
  const [error, setError] = useState('')
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const wsRef = useRef(null)
  const streamRef = useRef(null)
  const processorRef = useRef(null)
  const audioContextRef = useRef(null)
  const liveTranscriptRef = useRef({ lines: [], partial: '' })
  const fileInputRef = useRef(null)

  const startRecording = async () => {
    setError('')
    setTranscript('')
    setLiveLines([])
    setLivePartial('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
      }
      recorder.start()
      mediaRecorderRef.current = recorder

      const ws = new WebSocket(getWsUrl())
      wsRef.current = ws

      ws.onopen = () => {
        const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 })
        audioContextRef.current = ctx
        const source = ctx.createMediaStreamSource(stream)
        const processor = ctx.createScriptProcessor(4096, 1, 1)
        processorRef.current = processor

        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return
          const input = e.inputBuffer.getChannelData(0)
          const int16 = new Int16Array(input.length)
          for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]))
            int16[i] = s < 0 ? s * 32768 : s * 32767
          }
          ws.send(int16.buffer)
        }

        source.connect(processor)
        processor.connect(ctx.destination)
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.is_final && msg.transcript) {
            setLiveLines((prev) => {
              const next = [...prev, msg.transcript]
              liveTranscriptRef.current = { lines: next, partial: '' }
              return next
            })
            setLivePartial('')
          } else if (msg.transcript) {
            setLivePartial(msg.transcript)
            liveTranscriptRef.current = { ...liveTranscriptRef.current, partial: msg.transcript }
          }
        } catch (_) {}
      }

      ws.onerror = () => setError('Live transcription connection failed')
      setStatus('recording')
    } catch (err) {
      setError(err.message || 'Failed to access microphone')
    }
  }

  const stopAndTranscribe = async () => {
    const recorder = mediaRecorderRef.current
    const ws = wsRef.current
    const stream = streamRef.current
    const processor = processorRef.current
    const ctx = audioContextRef.current

    if (processor && ctx) {
      processor.disconnect()
      processor.onaudioprocess = null
    }
    if (stream) stream.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    processorRef.current = null

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'end' }))
      ws.close()
    }
    wsRef.current = null

    if (recorder && recorder.state === 'inactive') {
      setStatus('idle')
      const { lines, partial } = liveTranscriptRef.current
      setTranscript(lines.join(' ') + (partial ? ' ' + partial : ''))
      setPolishedTranscript('')
      setParseStatus('idle')
      return
    }
    if (!recorder || recorder.state === 'inactive') {
      setStatus('idle')
      return
    }
    const chunks = await new Promise((resolve) => {
      const r = recorder
      r.onstop = () => resolve([...chunksRef.current])
      r.stop()
    })
    mediaRecorderRef.current = null
    setStatus('processing')

    const blob = new Blob(chunks, { type: 'audio/webm' })
    const formData = new FormData()
    formData.append('audio', blob, 'recording.webm')

    try {
      const res = await fetch(`${API_BASE}/pulse/transcribe`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || res.statusText)
      }
      const data = await res.json()
      const { lines, partial } = liveTranscriptRef.current
      const fallback = lines.join(' ') + (partial ? ' ' + partial : '')
      setTranscript(data.transcription || fallback)
      setPolishedTranscript('')
      setParseStatus('idle')
    } catch (err) {
      setError(err.message || 'Transcription failed')
      const { lines, partial } = liveTranscriptRef.current
      setTranscript(lines.join(' ') + (partial ? ' ' + partial : ''))
    } finally {
      setStatus('idle')
    }
  }

  const handleParse = async () => {
    const raw = transcript || liveTranscriptRef.current.lines.join(' ') + (liveTranscriptRef.current.partial ? ' ' + liveTranscriptRef.current.partial : '')
    if (!raw.trim()) return
    setError('')
    setParseStatus('parsing')
    try {
      const res = await fetch(`${API_BASE}/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: raw }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || res.statusText)
      }
      const data = await res.json()
      setPolishedTranscript(data.formatted || '')
      setParseStatus('done')
    } catch (err) {
      setError(err.message || 'Parsing failed')
      setParseStatus('idle')
    }
  }

  const handleFileUpload = async (eOrFile) => {
    const file = eOrFile.target?.files?.[0] ?? (eOrFile instanceof File ? eOrFile : null)
    if (!file) return
    setError('')
    setTranscript('')
    setPolishedTranscript('')
    setParseStatus('idle')
    setUploadStatus('processing')

    const formData = new FormData()
    formData.append('audio', file, file.name)

    try {
      const res = await fetch(`${API_BASE}/pulse/transcribe`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || res.statusText)
      }
      const data = await res.json()
      setTranscript(data.transcription || '')
      setPolishedTranscript('')
      setParseStatus('idle')
    } catch (err) {
      setError(err.message || 'Transcription failed')
    } finally {
      setUploadStatus('idle')
      if (eOrFile.target) eOrFile.target.value = ''
    }
  }

  const downloadPolished = () => {
    if (!polishedTranscript) return
    const blob = new Blob([polishedTranscript], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'lecture.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  const hasRawTranscript = !!(
    transcript ||
    (liveTranscriptRef.current?.lines?.length) ||
    liveTranscriptRef.current?.partial
  )

  const goHome = () => {
    setMode('record')
    setStatus('idle')
    setTranscript('')
    setPolishedTranscript('')
    setParseStatus('idle')
    setLiveLines([])
    setLivePartial('')
    setError('')
    setUploadStatus('idle')
  }

  return (
    <div className="app">
      <header className="header">
        <button type="button" className="btn-home" onClick={goHome} aria-label="Home">
          Home
        </button>
      </header>
      <div className="app-body">
      <main className="main">
        <h1>Voice to Text</h1>
        <p className="subtitle">Record and transcribe with Pulse</p>

        {mode === 'record' && (
          <div className="mode-tabs">
            <button
              type="button"
              className="tab active"
            >
              Record
            </button>
            <button
              type="button"
              className="tab"
              onClick={() => { setMode('upload'); setError(''); setTranscript(''); setPolishedTranscript(''); setParseStatus('idle'); setLiveLines([]); setLivePartial(''); }}
            >
              Upload MP3
            </button>
          </div>
        )}

        {mode === 'record' && (
          <>
            <div className="controls">
              <button
                onClick={startRecording}
                disabled={status === 'recording'}
                className="btn btn-record"
              >
                Record
              </button>
              <button
                onClick={stopAndTranscribe}
                disabled={status !== 'recording'}
                className="btn btn-finish"
              >
                Finish
              </button>
            </div>

            {status === 'processing' && <p className="status">Transcribing…</p>}
            {hasRawTranscript && (
              <div className="result">
                {parseStatus === 'idle' && (
                  <>
                    <p className="status">Transcript ready</p>
                    <button onClick={handleParse} className="btn btn-parse">
                      Parse
                    </button>
                  </>
                )}
                {parseStatus === 'parsing' && <p className="status">Parsing…</p>}
                {parseStatus === 'done' && (
                  <>
                    <pre className="transcript">{polishedTranscript}</pre>
                    <button onClick={downloadPolished} className="btn btn-download">
                      Download .txt
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {mode === 'upload' && (
          <>
            <div
              className={`upload-zone ${uploadStatus === 'processing' ? 'processing' : ''}`}
              onClick={() => uploadStatus !== 'processing' && fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
              onDrop={(e) => {
                e.preventDefault()
                const file = e.dataTransfer.files?.[0]
                if (file && file.type.startsWith('audio/') && uploadStatus !== 'processing') {
                  handleFileUpload(file)
                }
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/mpeg,audio/mp3,.mp3,audio/*"
                onChange={handleFileUpload}
                className="file-input"
              />
              <span className="upload-zone-text">
                {uploadStatus === 'processing' ? 'Transcribing…' : 'Drop MP3 here or click to select'}
              </span>
            </div>
            {hasRawTranscript && (
              <div className="result">
                {parseStatus === 'idle' && (
                  <>
                    <p className="status">Transcript ready</p>
                    <button onClick={handleParse} className="btn btn-parse">
                      Parse
                    </button>
                  </>
                )}
                {parseStatus === 'parsing' && <p className="status">Parsing…</p>}
                {parseStatus === 'done' && (
                  <>
                    <pre className="transcript">{polishedTranscript}</pre>
                    <button onClick={downloadPolished} className="btn btn-download">
                      Download .txt
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {error && <p className="error">{error}</p>}
      </main>

      {status === 'recording' && (
        <aside className="live-panel">
          <h3>Live transcript</h3>
          <div className="live-content">
            {liveLines.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
            {livePartial && <p className="partial">{livePartial}</p>}
            {!liveLines.length && !livePartial && (
              <p className="placeholder">Speak…</p>
            )}
          </div>
        </aside>
      )}
      </div>
    </div>
  )
}

export default App
