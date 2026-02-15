import { useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import "pdfjs-dist/build/pdf.worker.min.mjs";
import CharacterScene, { characters } from "./components/CharacterScene";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

function getWsUrl() {
  const base = import.meta.env.VITE_API_URL || "";
  if (base.startsWith("http")) {
    const u = new URL(base);
    const proto = u.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${u.host}/pulse/live`;
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/pulse/live`;
}

function App() {
  const [page, setPage] = useState("home");
  const [mode, setMode] = useState("record");
  const [status, setStatus] = useState("idle");
  const [transcript, setTranscript] = useState("");
  const [polishedTranscript, setPolishedTranscript] = useState("");
  const [parseStatus, setParseStatus] = useState("idle");
  const [liveLines, setLiveLines] = useState([]);
  const [livePartial, setLivePartial] = useState("");
  const [uploadStatus, setUploadStatus] = useState("idle");
  const [error, setError] = useState("");

  // Slide state
  const [slideFile, setSlideFile] = useState(null);
  const [slidePages, setSlidePages] = useState([]);
  const [slideProcessing, setSlideProcessing] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showSlidePlayer, setShowSlidePlayer] = useState(false);
  const [slideContext, setSlideContext] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Imported notes (downloaded .txt) for TTS in slide player
  const [importedNotesText, setImportedNotesText] = useState("");
  const [importedNotesFileName, setImportedNotesFileName] = useState("");
  const [lightningStatus, setLightningStatus] = useState("idle"); // idle | loading | playing
  const [lightningPaused, setLightningPaused] = useState(false);
  const [askInputVisible, setAskInputVisible] = useState(false);
  const [askQuestionText, setAskQuestionText] = useState("");
  const [askStatus, setAskStatus] = useState("idle"); // idle | recording | transcribing | loading | speaking
  const [askRecording, setAskRecording] = useState(false);
  const [selectedVoiceId, setSelectedVoiceId] = useState("sophia");
  const [sessionFinished, setSessionFinished] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showResultOverlay, setShowResultOverlay] = useState(false);

  const selectedCharacter = characters.find(c => c.voiceId === selectedVoiceId);

  const askRecorderRef = useRef(null);
  const askChunksRef = useRef([]);
  const askStreamRef = useRef(null);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const wsRef = useRef(null);
  const streamRef = useRef(null);
  const processorRef = useRef(null);
  const audioContextRef = useRef(null);
  const liveTranscriptRef = useRef({ lines: [], partial: "" });
  const fileInputRef = useRef(null);
  const slideInputRef = useRef(null);
  const importedTxtInputRef = useRef(null);
  const lightningAudioRef = useRef(null);
  const responseAudioRef = useRef(null);

  // ── PDF processing ───────────────────────────────────────────────
  const analyzeSlides = async (images) => {
    if (isAnalyzing || slideContext) return;
    setIsAnalyzing(true);
    try {
      const res = await fetch(`${API_BASE}/ask/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images }),
      });

      if (res.status === 429) {
        throw new Error("Rate limit reached. Please wait a minute and try again.");
      }

      if (!res.ok) throw new Error("Failed to analyze slides");
      const data = await res.json();
      setSlideContext(data);
    } catch (err) {
      console.error(err);
      setError("Slide analysis failed: " + err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const processPdf = useCallback(async (file) => {
    setSlideProcessing(true);
    setError("");
    setSlideContext(null); // Reset context on new file
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const pages = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        // Use lower scale for analysis to save tokens/bandwidth, or keep high for display?
        // Let's use 1.0 for display to ensure good quality, but maybe downscale for analysis if needed.
        // For now, consistent usage.
        const scale = 1.5;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport }).promise;
        pages.push(canvas.toDataURL("image/jpeg", 0.8));
      }

      setSlidePages(pages);
      setSlideFile(file);
      // Automatically start analysis after processing? Or wait for first question?
      // Let's wait for first question to save API calls, or trigger it now?
      // The prompt says "run analyze slides if we haven't already" when clicking ask.
      // So we'll do it lazily in submitAsk.
    } catch (err) {
      setError("Failed to process PDF: " + (err.message || "Unknown error"));
      setSlideFile(null);
      setSlidePages([]);
    } finally {
      setSlideProcessing(false);
    }
  }, []);

  const handleSlideUpload = useCallback(
    (eOrFile) => {
      const file =
        eOrFile.target?.files?.[0] ??
        (eOrFile instanceof File ? eOrFile : null);
      if (!file) return;
      if (file.type !== "application/pdf") {
        setError("Please upload a PDF file");
        return;
      }
      processPdf(file);
      if (eOrFile.target) eOrFile.target.value = "";
    },
    [processPdf]
  );

  // ── Audio recording ──────────────────────────────────────────────
  const startRecording = async () => {
    setError("");
    setTranscript("");
    setLiveLines([]);
    setLivePartial("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;

      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        const ctx = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 16000,
        });
        audioContextRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const input = e.inputBuffer.getChannelData(0);
          const int16 = new Int16Array(input.length);
          for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]));
            int16[i] = s < 0 ? s * 32768 : s * 32767;
          }
          ws.send(int16.buffer);
        };

        source.connect(processor);
        processor.connect(ctx.destination);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.is_final && msg.transcript) {
            setLiveLines((prev) => {
              const next = [...prev, msg.transcript];
              liveTranscriptRef.current = { lines: next, partial: "" };
              return next;
            });
            setLivePartial("");
          } else if (msg.transcript) {
            setLivePartial(msg.transcript);
            liveTranscriptRef.current = {
              ...liveTranscriptRef.current,
              partial: msg.transcript,
            };
          }
        } catch (_) { }
      };

      ws.onerror = () => setError("Live transcription connection failed");
      setStatus("recording");
    } catch (err) {
      setError(err.message || "Failed to access microphone");
    }
  };

  const stopAndTranscribe = async () => {
    const recorder = mediaRecorderRef.current;
    const ws = wsRef.current;
    const stream = streamRef.current;
    const processor = processorRef.current;
    const ctx = audioContextRef.current;

    if (processor && ctx) {
      processor.disconnect();
      processor.onaudioprocess = null;
    }
    if (stream) stream.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    processorRef.current = null;

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "end" }));
      ws.close();
    }
    wsRef.current = null;

    if (recorder && recorder.state === "inactive") {
      setStatus("idle");
      const { lines, partial } = liveTranscriptRef.current;
      setTranscript(lines.join(" ") + (partial ? " " + partial : ""));
      setPolishedTranscript("");
      setParseStatus("idle");
      return;
    }
    if (!recorder || recorder.state === "inactive") {
      setStatus("idle");
      return;
    }
    const chunks = await new Promise((resolve) => {
      const r = recorder;
      r.onstop = () => resolve([...chunksRef.current]);
      r.stop();
    });
    mediaRecorderRef.current = null;
    setStatus("processing");

    const blob = new Blob(chunks, { type: "audio/webm" });
    const formData = new FormData();
    formData.append("audio", blob, "recording.webm");

    try {
      const res = await fetch(`${API_BASE}/pulse/transcribe`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || res.statusText);
      }
      const data = await res.json();
      const { lines, partial } = liveTranscriptRef.current;
      const fallback = lines.join(" ") + (partial ? " " + partial : "");
      setTranscript(data.transcription || fallback);
      setPolishedTranscript("");
      setParseStatus("idle");
    } catch (err) {
      setError(err.message || "Transcription failed");
      const { lines, partial } = liveTranscriptRef.current;
      setTranscript(lines.join(" ") + (partial ? " " + partial : ""));
    } finally {
      setStatus("idle");
    }
  };

  // ── Parse ────────────────────────────────────────────────────────
  const handleParse = async () => {
    const raw =
      transcript ||
      liveTranscriptRef.current.lines.join(" ") +
      (liveTranscriptRef.current.partial
        ? " " + liveTranscriptRef.current.partial
        : "");
    if (!raw.trim()) return;
    setError("");
    setParseStatus("parsing");
    try {
      const res = await fetch(`${API_BASE}/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: raw }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || res.statusText);
      }
      const data = await res.json();
      setPolishedTranscript(data.formatted || "");
      setParseStatus("done");
      setShowResultOverlay(true);
    } catch (err) {
      setError(err.message || "Parsing failed");
      setParseStatus("idle");
    }
  };

  // ── File upload (audio) ──────────────────────────────────────────
  const handleFileUpload = async (eOrFile) => {
    const file =
      eOrFile.target?.files?.[0] ?? (eOrFile instanceof File ? eOrFile : null);
    if (!file) return;
    setError("");
    setTranscript("");
    setPolishedTranscript("");
    setParseStatus("idle");
    setUploadStatus("processing");

    const formData = new FormData();
    formData.append("audio", file, file.name);

    try {
      const res = await fetch(`${API_BASE}/pulse/transcribe`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || res.statusText);
      }
      const data = await res.json();
      setTranscript(data.transcription || "");
      setPolishedTranscript("");
      setParseStatus("idle");
    } catch (err) {
      setError(err.message || "Transcription failed");
    } finally {
      setUploadStatus("idle");
      if (eOrFile.target) eOrFile.target.value = "";
    }
  };

  const handleVoiceSelect = useCallback((voiceId) => {
    console.log("App: Voice selected:", voiceId);
    setSelectedVoiceId(voiceId);
  }, []);

  // ── Import downloaded text (slide player) ─────────────────────────
  const handleImportedTxt = useCallback((e) => {
    const file = e?.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImportedNotesText(String(reader.result ?? ""));
      setImportedNotesFileName(file.name);
    };
    reader.readAsText(file);
    if (e?.target) e.target.value = "";
  }, []);

  // ── Lightning TTS (play imported notes as speech) ──────────────────
  const pcmToWavBlob = (pcmArrayBuffer, sampleRate = 24000) => {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const dataSize = pcmArrayBuffer.byteLength;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const writeStr = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, (numChannels * bitsPerSample) / 8, true);
    view.setUint16(34, bitsPerSample, true);
    writeStr(36, "data");
    view.setUint32(40, dataSize, true);
    new Uint8Array(buffer).set(new Uint8Array(pcmArrayBuffer), 44);
    return new Blob([buffer], { type: "audio/wav" });
  };

  const playAudioSegment = (text) => {
    return new Promise(async (resolve, reject) => {
      try {
        const res = await fetch(`${API_BASE}/lightning/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ latex_summary: text, anchors_enabled: false, voice_id: selectedVoiceId }),
        });
        if (!res.ok) throw new Error("TTS failed");
        const pcmBuffer = await res.arrayBuffer();
        const wavBlob = pcmToWavBlob(pcmBuffer, 24000);
        const url = URL.createObjectURL(wavBlob);
        const audio = new Audio(url);
        lightningAudioRef.current = audio;

        audio.onended = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.onerror = (e) => {
          URL.revokeObjectURL(url);
          reject(e);
        };
        await audio.play();
        setLightningStatus("playing");
        setLightningPaused(false);
      } catch (err) {
        reject(err);
      }
    });
  };

  const startLightningTts = useCallback(async () => {
    const text = (importedNotesText || "").trim();
    if (!text) return;
    setError("");
    setLightningStatus("loading");
    console.log("startLightningTts: starting lesson playback", {
      hasText: !!text,
      pages: slidePages.length,
      hasContext: !!slideContext
    });

    // Check if we need lazy analysis for lesson playback
    let currentContext = slideContext;
    if (slidePages.length > 0 && !currentContext) {
      try {
        console.log("startLightningTts: triggering lazy slide analysis before alignment...");
        const res = await fetch(`${API_BASE}/ask/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ images: slidePages }),
        });
        if (!res.ok) throw new Error("Failed to analyze slides for alignment");
        currentContext = await res.json();
        setSlideContext(currentContext);
      } catch (e) {
        console.error("startLightningTts: lazy analysis failed", e);
      }
    }

    // ALIGNMENT LOGIC
    if (currentContext && slidePages.length > 0) {
      try {
        console.log("startLightningTts: requesting alignment...");
        const alignRes = await fetch(`${API_BASE}/ask/align`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ script: text, context: currentContext }),
        });
        if (!alignRes.ok) throw new Error("Alignment failed");
        const alignData = await alignRes.json();
        const segments = alignData.segments;

        console.log("startLightningTts: aligned segments received", segments);

        for (const segment of segments) {
          // Switch slide
          const slideNum = segment.slide_number;
          const targetIndex = slideNum - 1;
          console.log(`startLightningTts: playing segment for slide ${slideNum} (index ${targetIndex})`);

          if (targetIndex >= 0 && targetIndex < slidePages.length) {
            console.log(`startLightningTts: switching to slide index ${targetIndex}`);
            setCurrentSlide(targetIndex);
          } else {
            console.warn(`startLightningTts: Invalid slide index ${targetIndex} for ${slidePages.length} pages`);
          }

          // Play audio
          await playAudioSegment(segment.text);

          // Check if stopped/paused in between? 
          // For simplicity, we assume continuous playback for now.
          // Refactoring to support pause in loop is complex without an abort controller or state check.
        }
        setSessionFinished(true);
        setLightningStatus("idle");
        return;
      } catch (e) {
        console.warn("Alignment failed, falling back to simple playback", e);
        // Fallthrough to simple playback
      }
    }

    // FALLBACK / SIMPLE PLAYBACK
    try {
      console.log("startLightningTts: playing full audio (no alignment/fallback)");
      await playAudioSegment(text);
      setSessionFinished(true);
      setLightningStatus("idle");
    } catch (err) {
      console.error("startLightningTts: simple playback failed", err);
      setError(err?.message || "Lightning TTS failed");
      setLightningStatus("idle");
    }
  }, [importedNotesText, slideContext, slidePages]);

  const pauseLightningTts = useCallback(() => {
    const audio = lightningAudioRef.current;
    if (audio && !audio.paused) {
      audio.pause();
      setLightningPaused(true);
    }
  }, []);

  const resumeLightningTts = useCallback(() => {
    const audio = lightningAudioRef.current;
    if (audio && audio.paused) {
      audio.play();
      setLightningPaused(false);
    }
  }, []);

  const startAskRecording = useCallback(async () => {
    setError("");
    console.log("[Ask flow] startAskRecording: requesting microphone…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      askStreamRef.current = stream;
      askChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      askRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) askChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      setAskRecording(true);
      setAskStatus("recording");
      console.log("[Ask flow] startAskRecording: recorder started, state =", recorder.state);
    } catch (err) {
      console.error("[Ask flow] startAskRecording failed:", err);
      setError(err?.message || "Microphone access failed");
    }
  }, []);

  const openAskInput = useCallback(() => {
    console.log("[Ask flow] Ask clicked: opening form, pausing lesson, auto-starting recording");
    const audio = lightningAudioRef.current;
    if (audio && !audio.paused) {
      audio.pause();
      setLightningPaused(true);
    }
    setAskInputVisible(true);
    setAskQuestionText("");
    setAskStatus("idle");
    setAskRecording(false);
    startAskRecording();
  }, [startAskRecording]);

  const submitAsk = useCallback(async (questionOverride) => {
    const question = (questionOverride != null ? questionOverride : askQuestionText).trim();
    // #region agent log
    fetch('http://127.0.0.1:7245/ingest/3e59e22c-7a6c-4ac8-9b5c-daff4baedb49', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'App.jsx:submitAsk', message: 'submitAsk entry', data: { hasOverride: questionOverride != null, overridePreview: questionOverride != null ? String(questionOverride).slice(0, 80) : null, resolvedLen: question.length, resolvedPreview: question.slice(0, 80), isEmpty: !question }, timestamp: Date.now(), hypothesisId: 'H3' }) }).catch(() => { });
    // #endregion
    console.log("[Ask flow] submitAsk called", { hasOverride: questionOverride != null, questionLength: question.length, questionPreview: question.slice(0, 80) });
    if (!question) {
      console.warn("[Ask flow] submitAsk: question empty, returning");
      return;
    }
    setError("");
    setAskStatus("loading");

    // Check if we have slides to analyze
    let currentContext = slideContext;
    if (slidePages.length > 0 && !currentContext) {
      if (isAnalyzing) {
        // Already analyzing, wait? For simplicity, block or show message.
        // Ideally we wait.
        console.log("Waiting for slide analysis...");
      } else {
        console.log("Triggering lazy slide analysis...");
        // Can't easily await analyzeSlides inside useCallback without making it self-contained or dependency.
        // We'll reimplement the fetch here to ensure we have the data *now*.
        // Or better, define analyzeSlides outside or use a ref?
        // Let's just do the fetch here for simplicity.
        try {
          // Reuse the logic
          const res = await fetch(`${API_BASE}/ask/analyze`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ images: slidePages }),
          });
          if (!res.ok) throw new Error("Failed to analyze slides on demand");
          currentContext = await res.json();
          setSlideContext(currentContext);
        } catch (e) {
          console.error("Lazy analysis failed", e);
          setError("Failed to analyze slides for context.");
          setAskStatus("idle");
          return;
        }
      }
    }

    try {
      let answer = "";
      let suggestedSlide = null;

      if (currentContext) {
        console.log("[Ask flow] POST /ask/slides with context…");
        const res = await fetch(`${API_BASE}/ask/slides`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: question,
            context: currentContext,
            current_slide: currentSlide,
            history: [] // We could pass history if we maintained it
          }),
        });
        if (!res.ok) throw new Error("Slide chat failed");
        const data = await res.json();
        answer = data.answer;
        suggestedSlide = data.suggested_slide;
      } else {
        // Fallback to original /ask if no slides
        console.log("[Ask flow] POST /ask with question…");
        const res = await fetch(`${API_BASE}/ask`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            context: importedNotesText || undefined,
          }),
        });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText || res.statusText);
        }
        const data = await res.json();
        answer = data?.answer || "";
      }

      console.log("[Ask flow] Response:", { answerLength: answer.length, suggestedSlide });

      if (!answer) {
        console.warn("[Ask flow] returned empty answer");
        setAskStatus("idle");
        return;
      }

      // Slide Switching Logic
      const originalSlide = currentSlide;
      if (suggestedSlide !== null && suggestedSlide !== undefined) {
        // Gemini assumes 1-based usually in text, but if we return int from service it matches array index?
        // Service returns exact int. slide_service.py: "suggested_slide": 5
        // Prompt says "Return JSON: ... suggested_slide: 5".
        // And "CURRENT SLIDE: {current_slide + 1}".
        // If Gemini returns 5 (meaning slide 5), that is index 4. 
        // Let's assume Gemini follows the "Slide X" numbering which is 1-based.
        // Wait, the prompt says "Always return one slide number".
        // If I say "Slide 3", I expect 3?
        // Let's assume 1-based from LLM -> 0-based index.
        const targetIndex = suggestedSlide - 1;
        if (targetIndex >= 0 && targetIndex < slidePages.length && targetIndex !== currentSlide) {
          console.log(`Switching to slide ${targetIndex + 1} for answer...`);
          setCurrentSlide(targetIndex);
          // show slide player if not already?
          if (!showSlidePlayer && slidePages.length > 0) {
            setShowSlidePlayer(true);
          }
        }
      }

      console.log("[Ask flow] POST /lightning/stream for TTS…");
      const ttsRes = await fetch(`${API_BASE}/lightning/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latex_summary: answer, anchors_enabled: false, voice_id: selectedVoiceId }),
      });
      if (!ttsRes.ok) throw new Error("TTS failed");
      const pcmBuffer = await ttsRes.arrayBuffer();
      const wavBlob = pcmToWavBlob(pcmBuffer, 24000);
      const url = URL.createObjectURL(wavBlob);
      const responseAudio = new Audio(url);
      responseAudioRef.current = responseAudio;

      responseAudio.onended = () => {
        URL.revokeObjectURL(url);
        setAskStatus("idle");
        setAskInputVisible(false);
        setAskQuestionText("");

        // Revert slide
        if (suggestedSlide !== null && suggestedSlide !== undefined) {
          console.log(`Reverting to original slide ${originalSlide + 1}...`);
          setCurrentSlide(originalSlide);
        }

        const lessonAudio = lightningAudioRef.current;
        if (lessonAudio && lessonAudio.paused && !sessionFinished) {
          lessonAudio.play();
          setLightningPaused(false);
        }
      };

      responseAudio.onerror = () => {
        URL.revokeObjectURL(url);
        setAskStatus("idle");
        setError("Answer playback failed");
        // Revert slide on error too
        if (suggestedSlide !== null && suggestedSlide !== undefined) {
          setCurrentSlide(originalSlide);
        }
      };

      await responseAudio.play();
      setAskStatus("speaking");
      console.log("[Ask flow] Answer audio playing; will resume lesson when done.");

    } catch (err) {
      console.error("[Ask flow] submitAsk failed:", err);
      setError(err?.message || "Ask failed");
      setAskStatus("idle");
    }
  }, [askQuestionText, importedNotesText, slideContext, slidePages, isAnalyzing, currentSlide]);

  const stopAskRecording = useCallback(() => {
    const recorder = askRecorderRef.current;
    // #region agent log
    fetch('http://127.0.0.1:7245/ingest/3e59e22c-7a6c-4ac8-9b5c-daff4baedb49', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'App.jsx:stopAskRecording:entry', message: 'stopAskRecording entry', data: { hasRecorder: !!recorder, recorderState: recorder?.state ?? null, chunksLengthNow: askChunksRef.current?.length ?? 0 }, timestamp: Date.now(), hypothesisId: 'H1,H5' }) }).catch(() => { });
    // #endregion
    console.log("[Ask flow] Send question clicked", { hasRecorder: !!recorder, recorderState: recorder?.state });
    if (!recorder || recorder.state === "inactive") {
      console.warn("[Ask flow] stopAskRecording: no active recorder, returning early");
      setAskRecording(false);
      setAskStatus("idle");
      return;
    }
    setAskRecording(false);
    setAskStatus("transcribing");
    askRecorderRef.current = null;

    const doUploadAfterStop = async () => {
      const chunks = askChunksRef.current;
      const blobSize = chunks.length ? new Blob(chunks, { type: "audio/webm" }).size : 0;
      console.log("[Ask flow] onstop: chunks =", chunks.length, "blob size =", blobSize, "bytes");
      // #region agent log
      fetch('http://127.0.0.1:7245/ingest/3e59e22c-7a6c-4ac8-9b5c-daff4baedb49', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'App.jsx:stopAskRecording:afterStop', message: 'chunks after stop', data: { chunksLength: chunks.length, blobSize: chunks.length ? new Blob(chunks, { type: 'audio/webm' }).size : 0 }, timestamp: Date.now(), hypothesisId: 'H1,H4' }) }).catch(() => { });
      // #endregion
      if (!chunks.length) {
        console.error("[Ask flow] No chunks recorded — cannot send to Pulse");
        setError("No audio recorded");
        setAskStatus("idle");
        return;
      }
      const blob = new Blob(chunks, { type: "audio/webm" });
      try {
        const formData = new FormData();
        formData.append("audio", blob, "question.webm");
        console.log("[Ask flow] POST /pulse/transcribe with blob size", blob.size);
        const res = await fetch(`${API_BASE}/pulse/transcribe`, {
          method: "POST",
          body: formData,
        });
        let data = null;
        if (res.ok) data = await res.json();
        const transcription = data ? (data.transcription || "").trim() : "";
        console.log("[Ask flow] Pulse transcribe response:", { status: res.status, ok: res.ok, transcriptionLength: transcription.length, transcriptionPreview: transcription.slice(0, 80) });
        // #region agent log
        fetch('http://127.0.0.1:7245/ingest/3e59e22c-7a6c-4ac8-9b5c-daff4baedb49', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'App.jsx:stopAskRecording:afterPulse', message: 'after Pulse transcribe', data: { resOk: res.ok, status: res.status, transcriptionLen: transcription.length, transcriptionPreview: transcription.slice(0, 80), dataKeys: data ? Object.keys(data) : [] }, timestamp: Date.now(), hypothesisId: 'H2,H4' }) }).catch(() => { });
        // #endregion
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || res.statusText);
        }
        if (!transcription) {
          console.warn("[Ask flow] Pulse returned empty transcription — not calling submitAsk");
          setError("Could not transcribe your question");
          setAskStatus("idle");
          return;
        }
        console.log("[Ask flow] Calling submitAsk with transcription:", transcription.slice(0, 80));
        setAskQuestionText(transcription);
        await submitAsk(transcription);
      } catch (err) {
        console.error("[Ask flow] stopAskRecording failed:", err);
        setError(err?.message || "Transcription failed");
        setAskStatus("idle");
      }
    };

    recorder.onstop = () => {
      askStreamRef.current?.getTracks().forEach((t) => t.stop());
      doUploadAfterStop();
    };
    if (typeof recorder.requestData === "function") recorder.requestData();
    recorder.stop();
  }, [submitAsk]);

  // ── Download ─────────────────────────────────────────────────────
  const downloadPolished = () => {
    if (!polishedTranscript) return;
    const blob = new Blob([polishedTranscript], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lecture.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasRawTranscript = !!(
    transcript ||
    liveTranscriptRef.current?.lines?.length ||
    liveTranscriptRef.current?.partial
  );

  // ── Navigation ───────────────────────────────────────────────────
  const goHome = () => {
    setPage("home");
    setMode("record");
    setStatus("idle");
    setTranscript("");
    setPolishedTranscript("");
    setParseStatus("idle");
    setLiveLines([]);
    setLivePartial("");
    setError("");
    setUploadStatus("idle");
    setSlideContext(null);
    setCurrentSlide(0);
    setShowSlidePlayer(false);
    setSlideFile(null);
    setSlidePages([]);
    setImportedNotesText("");
    setImportedNotesFileName("");
    setSessionFinished(false);
    setShowExitConfirm(false);
    setShowResultOverlay(false);
    if (lightningAudioRef.current) {
      lightningAudioRef.current.pause();
      lightningAudioRef.current = null;
    }
    if (responseAudioRef.current) {
      responseAudioRef.current.pause();
      responseAudioRef.current = null;
    }
  };

  const goToSlidePlayer = () => {
    setShowSlidePlayer(true);
    setCurrentSlide(0);
  };

  const handleExitRequest = () => {
    setShowExitConfirm(true);
  };

  const confirmExit = () => {
    goHome();
  };

  const cancelExit = () => {
    setShowExitConfirm(false);
  };

  const goToPrevSlide = () => {
    if (currentSlide > 0) setCurrentSlide(currentSlide - 1);
  };

  const goToNextSlide = () => {
    if (currentSlide < slidePages.length - 1)
      setCurrentSlide(currentSlide + 1);
  };

  // ── Home / Landing Page ──────────────────────────────────────────
  if (page === "home") {
    return (
      <div className="home">
        {/* Header — brand only */}
        <header className="home-header">
          <div className="home-header-brand">
            <img src="/logo.png" alt="" className="home-logo-img" />
            <span className="home-brand">POCKETPROF</span>
          </div>
        </header>

        {/* Middle section — centered content (text + image + partners) */}
        <div className="home-middle">
          <section className="home-hero">
            <div className="home-hero-content">
              <h1 className="home-hero-title">The AI Learning Partner</h1>
              <p className="home-hero-sub">
                Turn messy recordings and slide decks into clean, structured notes. Ask questions, get answers with full context of your course.
              </p>
              <p className="home-hero-detail">
                Upload an MP3 or record live. Our AI extracts key concepts, organizes your content, and lets you study smarter—not harder.
              </p>
              <button className="home-enter-btn" onClick={() => setPage("tool")}>
                Get Started →
              </button>
              <p className="home-cta-small">Students and educators use PocketProf to turn lecture chaos into clarity.</p>
            </div>
            <div className="home-hero-right">
              <CharacterScene onVoiceSelect={handleVoiceSelect} />
            </div>
          </section>

          {/* Sponsor row — infinite scroll ticker */}
          <section className="home-partners">
            <div className="home-sponsor-wrap">
              <div className="home-sponsor-track" aria-hidden="true">
                {[...Array(3)].map((_, group) => (
                  <div key={group} className="home-sponsor-row">
                    <span className="ticker-item">SMALLEST.AI</span>
                    <span className="ticker-dot" />
                    <span className="ticker-item">LIGHTNING</span>
                    <span className="ticker-dot" />
                    <span className="ticker-item">PULSE</span>
                    <span className="ticker-dot" />
                    <span className="ticker-item">GOOGLE GEMINI</span>
                    <span className="ticker-dot" />
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <footer className="home-footer">
          <span className="home-footer-brand">POCKETPROF &copy; 2026</span>
          <nav className="home-footer-links">
            <span>PRIVACY</span>
            <span>TEAM</span>
            <span>CONNECT</span>
          </nav>
        </footer>
      </div>
    );
  }

  // ── Slide Player View ────────────────────────────────────────────
  if (showSlidePlayer) {
    return (
      <div className="lab">
        <div className="slide-player-layout">
          {/* Slide viewer */}
          <div className="slide-player">
            <div className="slide-player-header">
              <div className="header-left">
                <h2>Lecture Slides</h2>
                <span className="slide-counter">
                  Slide {currentSlide + 1} of {slidePages.length}
                </span>
                {selectedCharacter && (
                  <div className="current-voice-indicator">
                    <img
                      src={`/character-${selectedCharacter.id}-pfp.png`}
                      alt={selectedCharacter.name}
                      className="mini-pfp"
                    />
                    <span className="mini-name">{selectedCharacter.name}</span>
                  </div>
                )}
              </div>
              <button type="button" className="btn-back" onClick={handleExitRequest}>
                ← Home
              </button>
            </div>

            <div className="slide-display">
              <img
                src={slidePages[currentSlide]}
                alt={`Slide ${currentSlide + 1}`}
                className="slide-image"
              />
            </div>

            <div className="slide-nav">
              <button
                className="btn btn-slide-nav"
                onClick={goToPrevSlide}
                disabled={currentSlide === 0}
              >
                ← Previous
              </button>

              <div className="slide-dots">
                {slidePages.map((_, idx) => (
                  <button
                    key={idx}
                    className={`slide-dot ${idx === currentSlide ? "active" : ""}`}
                    onClick={() => setCurrentSlide(idx)}
                    aria-label={`Go to slide ${idx + 1}`}
                  />
                ))}
              </div>

              <button
                className="btn btn-slide-nav"
                onClick={goToNextSlide}
                disabled={currentSlide === slidePages.length - 1}
              >
                Next →
              </button>
            </div>
          </div>

          {/* Transcript alongside */}
          <aside className="slide-transcript-panel">
            <h3>Lecture Notes</h3>
            <div className="slide-transcript-content">
              {polishedTranscript ? (
                <pre className="transcript">{polishedTranscript}</pre>
              ) : transcript ? (
                <pre className="transcript">{transcript}</pre>
              ) : (
                <p className="placeholder">No transcript available</p>
              )}
            </div>
            {polishedTranscript && (
              <button onClick={downloadPolished} className="btn btn-download" style={{ marginTop: "1rem" }}>
                Download .txt
              </button>
            )}

            <div className="slide-panel-import-tts">
              <input
                ref={importedTxtInputRef}
                type="file"
                accept=".txt,text/plain"
                onChange={handleImportedTxt}
                className="file-input"
                aria-hidden="true"
              />
              {!sessionFinished && (
                <button
                  type="button"
                  className="btn btn-import-notes"
                  onClick={() => importedTxtInputRef.current?.click()}
                >
                  Import downloaded text
                </button>
              )}
              {importedNotesText && (
                <>
                  <p className="imported-notes-label">
                    {importedNotesFileName ? `Ready: ${importedNotesFileName}` : "Ready"}
                  </p>
                  {!sessionFinished && (
                    <button
                      type="button"
                      className="btn btn-start-tts"
                      onClick={startLightningTts}
                      disabled={lightningStatus === "loading" || lightningStatus === "playing"}
                    >
                      {lightningStatus === "loading"
                        ? "Loading…"
                        : lightningStatus === "playing"
                          ? "Playing…"
                          : "Start"}
                    </button>
                  )}
                  {lightningStatus === "playing" && (
                    <button
                      type="button"
                      className="btn btn-pause-tts"
                      onClick={lightningPaused ? resumeLightningTts : pauseLightningTts}
                    >
                      {lightningPaused ? "Resume" : "Pause"}
                    </button>
                  )}
                  {sessionFinished && !askInputVisible && (
                    <div className="finished-actions">
                      <p className="finished-msg">Lesson complete. You can ask questions or exit.</p>
                      <button
                        type="button"
                        className="btn btn-ask-large"
                        onClick={openAskInput}
                      >
                        Ask a Question
                      </button>
                      <button
                        type="button"
                        className="btn btn-exit-session"
                        onClick={handleExitRequest}
                      >
                        Exit Session
                      </button>
                    </div>
                  )}
                  {lightningStatus === "playing" && !askInputVisible && !sessionFinished && (
                    <button
                      type="button"
                      className="btn btn-ask-tts"
                      onClick={openAskInput}
                    >
                      Ask
                    </button>
                  )}
                  {askInputVisible && (
                    <div className="slide-panel-ask-form">
                      <p className="ask-form-prompt">
                        {askStatus === "recording"
                          ? "Listening… When done, click Send question."
                          : askStatus === "transcribing"
                            ? "Transcribing…"
                            : askStatus === "loading"
                              ? "Getting answer…"
                              : askStatus === "speaking"
                                ? "Speaking…"
                                : "Listening…"}
                      </p>
                      {askQuestionText && (askStatus === "loading" || askStatus === "speaking") && (
                        <p className="ask-question-preview">"{askQuestionText}"</p>
                      )}
                      <div className="ask-form-actions">
                        <button
                          type="button"
                          className="btn btn-stop-ask"
                          onClick={stopAskRecording}
                          disabled={!askRecording || askStatus === "transcribing" || askStatus === "loading" || askStatus === "speaking"}
                        >
                          Send question
                        </button>
                        <button
                          type="button"
                          className="btn btn-cancel-ask"
                          onClick={() => {
                            if (askRecording && askRecorderRef.current) {
                              askRecorderRef.current.stop();
                              askStreamRef.current?.getTracks().forEach((t) => t.stop());
                              setAskRecording(false);
                            }
                            setAskInputVisible(false);
                            setAskQuestionText("");
                            setAskStatus("idle");
                            const lessonAudio = lightningAudioRef.current;
                            if (lessonAudio && lessonAudio.paused) {
                              lessonAudio.play();
                              setLightningPaused(false);
                            }
                          }}
                          disabled={askStatus === "loading" || askStatus === "speaking"}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </aside>
        </div>
        {showExitConfirm && (
          <div className="exit-modal-overlay">
            <div className="exit-modal">
              <h2>Confirm Exit</h2>
              <p>Are you sure you want to exit? This will delete all context and uploaded data for this session.</p>
              <div className="exit-modal-actions">
                <button className="btn btn-confirm-exit" onClick={confirmExit}>Yes, Exit</button>
                <button className="btn btn-cancel-exit" onClick={cancelExit}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Main View (Lab) ──────────────────────────────────────────────
  return (
    <div className="lab">
      <div className="app-body">
        <main className="main lab-cards no-scroll">
          <div className="lab-page-header">
            <h1 className="lab-heading">Set Up PocketProf</h1>
            <button type="button" className="btn-back" onClick={goHome}>
              ← Home
            </button>
          </div>
          <p className="subtitle">Import your lecture information</p>

          <div className="lab-sections-horizontal">
            {/* Section 1: Import audio or live record audio */}
            <div className="lab-section">
              <h2 className="lab-section-title">Section 1 — Audio</h2>

              <section className="lab-card horizontal-split">
                <div className="lab-card-header">
                  <h3 className="lab-card-title">Upload MP3</h3>
                  <p className="lab-card-desc">Transcribe instantly.</p>
                </div>
                <div
                  className={`lab-card-body upload-zone ${uploadStatus === "processing" ? "processing" : ""}`}
                  onClick={() =>
                    uploadStatus !== "processing" && fileInputRef.current?.click()
                  }
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files?.[0];
                    if (file && file.type.startsWith("audio/") && uploadStatus !== "processing") handleFileUpload(file);
                  }}
                >
                  <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileUpload} className="file-input" />
                  <div className="upload-zone-icon" aria-hidden="true" />
                  <span className="upload-zone-text">
                    {uploadStatus === "processing" ? "Transcribing…" : "Drop MP3 here or click"}
                  </span>
                </div>
              </section>

              <section className="lab-card">
                <div className="lab-card-header">
                  <h3 className="lab-card-title">Record Live</h3>
                  <p className="lab-card-desc">Get a transcript when done.</p>
                </div>
                <div className="lab-card-body lab-card-actions">
                  <div className="controls">
                    <button onClick={startRecording} disabled={status === "recording"} className="btn btn-record">Record</button>
                    <button onClick={stopAndTranscribe} disabled={status !== "recording"} className="btn btn-finish">Finish</button>
                  </div>
                </div>
              </section>

              {hasRawTranscript && (
                <section className="lab-card lab-card-results">
                  <div className="lab-card-header">
                    <h3 className="lab-card-title">Results</h3>
                  </div>
                  <div className="lab-card-body">
                    <div className="result">
                      {parseStatus === "idle" && <button onClick={handleParse} className="btn btn-parse">Parse</button>}
                      {parseStatus === "parsing" && <p className="status">Parsing…</p>}
                      {parseStatus === "done" && (
                        <>
                          <pre className="transcript">{polishedTranscript}</pre>
                          <button onClick={downloadPolished} className="btn btn-download">Download .txt</button>
                        </>
                      )}
                    </div>
                  </div>
                </section>
              )}
            </div>

            {/* Section 2: Add PDF slides */}
            <div className="lab-section">
              <h2 className="lab-section-title">Section 2 — Slides</h2>

              <section className="lab-card horizontal-split">
                <div className="lab-card-header">
                  <h3 className="lab-card-title">PDF Slides</h3>
                  <p className="lab-card-desc">Upload to view with transcript.</p>
                </div>
                <div
                  className={`lab-card-body upload-zone slide-upload-zone ${slideProcessing ? "processing" : ""}`}
                  onClick={() => !slideProcessing && slideInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files?.[0];
                    if (file && file.type === "application/pdf" && !slideProcessing) handleSlideUpload(file);
                  }}
                >
                  <input ref={slideInputRef} type="file" accept="application/pdf" onChange={handleSlideUpload} className="file-input" />
                  <div className="upload-zone-icon" aria-hidden="true" />
                  <span className="upload-zone-text">
                    {slideProcessing ? "Processing PDF…" : slideFile ? `✓ ${slideFile.name}` : "Drop PDF here or click"}
                  </span>
                </div>
              </section>

              {slidePages.length > 0 && (
                <section className="lab-card lab-card-results">
                  <div className="lab-card-header">
                    <h3 className="lab-card-title">Slides ready</h3>
                  </div>
                  <div className="lab-card-body">
                    <button onClick={goToSlidePlayer} className="btn btn-slides">View Slides ({slidePages.length})</button>
                  </div>
                </section>
              )}
            </div>
          </div>
          {error && <p className="error">{error}</p>}
        </main>
        {status === "recording" && (
          <aside className="live-panel">
            <h3>Live transcript</h3>
            <div className="live-content">
              {liveLines.map((line, i) => <p key={i}>{line}</p>)}
              {livePartial && <p className="partial">{livePartial}</p>}
            </div>
          </aside>
        )}
        {showExitConfirm && (
          <div className="exit-modal-overlay">
            <div className="exit-modal">
              <h2>Confirm Exit</h2>
              <p>Are you sure you want to exit? This will delete all context and uploaded data for this session.</p>
              <div className="exit-modal-actions">
                <button className="btn btn-confirm-exit" onClick={confirmExit}>Yes, Exit</button>
                <button className="btn btn-cancel-exit" onClick={cancelExit}>Cancel</button>
              </div>
            </div>
          </div>
        )}
        {showResultOverlay && parseStatus === "done" && polishedTranscript && (
          <div
            className="result-overlay"
            onClick={() => setShowResultOverlay(false)}
            role="dialog"
            aria-label="Parse result"
          >
            <div className="result-overlay-card" onClick={e => e.stopPropagation()}>
              <h3 className="result-overlay-title">Results</h3>
              <div className="result-overlay-scroll">
                <pre className="result-overlay-transcript">{polishedTranscript}</pre>
              </div>
              <div className="result-overlay-actions">
                <button onClick={downloadPolished} className="btn btn-download">Download .txt</button>
                <button onClick={() => setShowResultOverlay(false)} className="btn result-overlay-close">Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

