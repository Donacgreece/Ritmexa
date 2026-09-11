import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { prepareAudioSource } from './lib/audio'
import { analyzeAudio, selectEditBeats, strengthAtBeat } from './lib/beat'
import { canExportLocally, exportVideo } from './lib/exporter'
import { filesToMedia } from './lib/media'
import { t } from './i18n'
import type { AudioSourceKind, BeatAnalysis, ColorLook, CropMode, CutMode, EditRecipe, EditStyle, ExportResult, Language, MediaItem, MediaOrder, OutputQuality, TransitionStyle } from './types'

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

const AUDIO_ACCEPT = 'audio/*,.mp3,.m4a,.wav,.aac,.aif,.aiff,.caf,.flac,.ogg,.opus'
const VIDEO_AUDIO_ACCEPT = 'video/*,.mp4,.mov,.m4v,.webm'
const MEDIA_ACCEPT = 'image/*,video/*,.heic,.heif,.mov,.m4v'
const STYLE_OPTIONS: EditStyle[] = ['punch', 'flow', 'clean', 'flash', 'drift', 'film', 'zoom', 'glitch', 'shake', 'whip', 'pulse', 'bounce', 'spin', 'blur', 'chroma', 'dream']
const TRANSITIONS: TransitionStyle[] = ['auto', 'cut', 'crossfade', 'flash', 'whip', 'blur', 'glitch']
const LOOKS: ColorLook[] = ['natural', 'vivid', 'warm', 'cool', 'mono', 'contrast']
const RECIPES: EditRecipe[] = ['viral', 'smooth', 'cinematic', 'hyper', 'minimal']
const PRESETS = [10, 15, 30, 45, 60]

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const formatTime = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds))
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}

const Logo = () => (
  <div className="brand" aria-label="Ritmexa">
    <span className="brand-mark" aria-hidden="true"><i /><i /><i /><b /></span>
    <span className="brand-copy"><strong>Ritmexa</strong><small>Your moments, on beat</small></span>
  </div>
)

const StepIcon = ({ value }: { value: string }) => <span className="step-icon">{value}</span>

function App() {
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('ritmexa-language') as Language) || 'en')
  const copy = t(language)
  const [media, setMedia] = useState<MediaItem[]>([])
  const [audioSourceFile, setAudioSourceFile] = useState<File | null>(null)
  const [audioSourceKind, setAudioSourceKind] = useState<AudioSourceKind>('audio')
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [audioUrl, setAudioUrl] = useState('')
  const [analysis, setAnalysis] = useState<BeatAnalysis | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [analysisLabel, setAnalysisLabel] = useState('')
  const [sensitivity, setSensitivity] = useState(58)
  const [style, setStyle] = useState<EditStyle>('punch')
  const [fxPool, setFxPool] = useState<EditStyle[]>(['punch'])
  const [transition, setTransition] = useState<TransitionStyle>('auto')
  const [colorLook, setColorLook] = useState<ColorLook>('natural')
  const [quality, setQuality] = useState<OutputQuality>('720')
  const [seconds, setSeconds] = useState(15)
  const [startAt, setStartAt] = useState(0)
  const [cutMode, setCutMode] = useState<CutMode>('smart')
  const [customInterval, setCustomInterval] = useState(0.75)
  const [mediaOrder, setMediaOrder] = useState<MediaOrder>('sequence')
  const [cropMode, setCropMode] = useState<CropMode>('cover')
  const [videoSpeed, setVideoSpeed] = useState(1)
  const [beatAccents, setBeatAccents] = useState(true)
  const [intensity, setIntensity] = useState(72)
  const [presetStatus, setPresetStatus] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [previewIndex, setPreviewIndex] = useState(0)
  const [previewStrength, setPreviewStrength] = useState(0.5)
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<ExportResult | null>(null)
  const [error, setError] = useState('')
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null)
  const [standalone, setStandalone] = useState(false)
  const [installPlatform, setInstallPlatform] = useState<'android' | 'ios' | 'other'>('other')
  const [installPromptOpen, setInstallPromptOpen] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    localStorage.setItem('ritmexa-language', language)
    document.documentElement.lang = language
  }, [language])

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as InstallEvent)
    }

    const standaloneMode = window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
    setStandalone(standaloneMode)

    const userAgent = navigator.userAgent
    const ios = /iPad|iPhone|iPod/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    const android = /Android/i.test(userAgent)
    setInstallPlatform(ios ? 'ios' : android ? 'android' : 'other')

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  useEffect(() => {
    if (standalone || installPlatform === 'other') return
    if (sessionStorage.getItem('ritmexa-install-dismissed') === '1') return
    if (installPlatform === 'android' && !installEvent) return

    const timer = window.setTimeout(() => setInstallPromptOpen(true), 1200)
    return () => window.clearTimeout(timer)
  }, [standalone, installPlatform, installEvent])

  useEffect(() => () => {
    media.forEach((item) => URL.revokeObjectURL(item.url))
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    if (result) URL.revokeObjectURL(result.url)
  }, [])

  const availableDuration = useMemo(() => {
    if (!analysis) return 180
    return Math.max(3, Math.min(180, analysis.duration - startAt))
  }, [analysis, startAt])

  const effectiveDuration = useMemo(() => Math.min(Math.max(3, seconds), availableDuration), [seconds, availableDuration])

  const editBeats = useMemo(() => analysis ? selectEditBeats(analysis, cutMode, startAt, effectiveDuration, customInterval) : [], [analysis, cutMode, startAt, effectiveDuration, customInterval])

  const previewStyle = fxPool[previewIndex % Math.max(1, fxPool.length)] ?? style
  const previewMedia = useMemo(() => {
    if (mediaOrder === 'sequence' || media.length <= 2) return media
    const copy = [...media]
    let seed = media.length * 97 + 31
    for (let i = copy.length - 1; i > 0; i -= 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0
      const j = seed % (i + 1)
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
    }
    return copy
  }, [media, mediaOrder])

  useEffect(() => {
    if (!analysis) return
    const safeStart = clamp(startAt, 0, Math.max(0, analysis.duration - 3))
    if (safeStart !== startAt) setStartAt(safeStart)
    if (seconds > Math.max(3, analysis.duration - safeStart)) setSeconds(Math.max(3, Math.floor(analysis.duration - safeStart)))
  }, [analysis, seconds, startAt])

  const addMedia = async (files: File[] | FileList | null) => {
    if (!files) return
    setError('')
    const list = Array.from(files)
    const added = await filesToMedia(list)
    setMedia((current) => [...current, ...added].slice(0, 50))
    if (result) URL.revokeObjectURL(result.url)
    setResult(null)
  }

  const chooseAudioSource = (file: File | null | undefined, kind: AudioSourceKind) => {
    if (!file) return

    if (audioUrl) URL.revokeObjectURL(audioUrl)
    audioRef.current?.pause()

    setAudioSourceFile(file)
    setAudioSourceKind(kind)
    setAudioFile(kind === 'audio' ? file : null)
    setAudioUrl(kind === 'audio' ? URL.createObjectURL(file) : '')
    setAnalysis(null)
    setAnalysisProgress(0)
    setAnalysisLabel('')
    setStartAt(0)
    setPreviewing(false)

    if (result) URL.revokeObjectURL(result.url)
    setResult(null)
    setError('')
  }

  const onAudioDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const file = event.dataTransfer.files?.[0]
    if (!file) return
    const kind: AudioSourceKind = file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(file.name) ? 'video' : 'audio'
    chooseAudioSource(file, kind)
  }

  const onMediaDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    void addMedia(event.dataTransfer.files)
  }

  const runAnalysis = async () => {
    if (!audioSourceFile) {
      setError(copy.missingAudio)
      return
    }

    setIsAnalyzing(true)
    setAnalysisProgress(0)
    setAnalysisLabel('')
    setError('')
    setPreviewing(false)

    try {
      const prepared = await prepareAudioSource(audioSourceFile, (value, label) => {
        const sourceWeight = audioSourceKind === 'video' ? 0.58 : 0.08
        setAnalysisProgress(Math.min(0.98, value * sourceWeight))
        setAnalysisLabel(label || '')
      })

      if (audioUrl) URL.revokeObjectURL(audioUrl)
      const preparedUrl = URL.createObjectURL(prepared)
      setAudioFile(prepared)
      setAudioUrl(preparedUrl)

      const next = await analyzeAudio(prepared, sensitivity / 100)
      setAnalysisProgress(1)
      setAnalysisLabel(copy.analysisReady)
      setAnalysis(next)
      setStartAt(0)
      setSeconds((value) => Math.min(value, Math.max(3, Math.floor(Math.min(180, next.duration)))))
    } catch (analysisError) {
      console.error(analysisError)
      setError(copy.audioDecodeError)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const moveMedia = (index: number, direction: -1 | 1) => {
    setMedia((items) => {
      const target = index + direction
      if (target < 0 || target >= items.length) return items
      const next = [...items]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const removeMedia = (id: string) => {
    setMedia((items) => {
      const target = items.find((item) => item.id === id)
      if (target) URL.revokeObjectURL(target.url)
      return items.filter((item) => item.id !== id)
    })
  }

  const toggleEffect = (option: EditStyle) => {
    setFxPool((current) => {
      if (current.includes(option)) {
        if (current.length === 1) return current
        const next = current.filter((item) => item !== option)
        setStyle(next[0])
        return next
      }
      const next = [...current, option].slice(-6)
      setStyle(next[0])
      return next
    })
  }

  const applyRecipe = (recipe: EditRecipe) => {
    const settings: Record<EditRecipe, { fx: EditStyle[]; transition: TransitionStyle; look: ColorLook; cut: CutMode; intensity: number; order: MediaOrder; speed: number }> = {
      viral: { fx: ['punch', 'flash', 'zoom', 'glitch', 'whip'], transition: 'auto', look: 'vivid', cut: 'smart', intensity: 86, order: 'shuffle', speed: 1.15 },
      smooth: { fx: ['flow', 'drift', 'dream'], transition: 'crossfade', look: 'natural', cut: 'strong', intensity: 58, order: 'sequence', speed: 1 },
      cinematic: { fx: ['film', 'drift', 'zoom', 'dream'], transition: 'blur', look: 'warm', cut: 'strong', intensity: 62, order: 'sequence', speed: 0.9 },
      hyper: { fx: ['shake', 'whip', 'flash', 'glitch', 'pulse'], transition: 'glitch', look: 'contrast', cut: 'every', intensity: 100, order: 'shuffle', speed: 1.25 },
      minimal: { fx: ['clean', 'zoom'], transition: 'crossfade', look: 'natural', cut: 'strong', intensity: 34, order: 'sequence', speed: 1 }
    }
    const next = settings[recipe]
    setFxPool(next.fx)
    setStyle(next.fx[0])
    setTransition(next.transition)
    setColorLook(next.look)
    setCutMode(next.cut)
    setIntensity(next.intensity)
    setMediaOrder(next.order)
    setVideoSpeed(next.speed)
    setPresetStatus(copy.recipeApplied)
  }

  const remix = () => {
    const shuffled = [...STYLE_OPTIONS].sort(() => Math.random() - 0.5)
    const count = 3 + Math.floor(Math.random() * 3)
    const nextFx = shuffled.slice(0, count)
    const transitionChoices: TransitionStyle[] = ['auto', 'flash', 'whip', 'blur', 'glitch', 'crossfade']
    const lookChoices: ColorLook[] = ['natural', 'vivid', 'warm', 'cool', 'contrast']
    const cutChoices: CutMode[] = ['smart', 'strong', 'every']
    setFxPool(nextFx)
    setStyle(nextFx[0])
    setTransition(transitionChoices[Math.floor(Math.random() * transitionChoices.length)])
    setColorLook(lookChoices[Math.floor(Math.random() * lookChoices.length)])
    setCutMode(cutChoices[Math.floor(Math.random() * cutChoices.length)])
    setIntensity(58 + Math.floor(Math.random() * 39))
    setMediaOrder(Math.random() > 0.45 ? 'shuffle' : 'sequence')
    setPresetStatus(copy.remixed)
  }

  const savePreset = () => {
    localStorage.setItem('ritmexa-custom-preset', JSON.stringify({
      fxPool, transition, colorLook, cutMode, customInterval, mediaOrder, cropMode, videoSpeed, beatAccents, intensity, quality
    }))
    setPresetStatus(copy.presetSaved)
  }

  const loadPreset = () => {
    try {
      const raw = localStorage.getItem('ritmexa-custom-preset')
      if (!raw) return setPresetStatus(copy.noPreset)
      const saved = JSON.parse(raw) as Partial<{
        fxPool: EditStyle[]; transition: TransitionStyle; colorLook: ColorLook; cutMode: CutMode; customInterval: number; mediaOrder: MediaOrder; cropMode: CropMode; videoSpeed: number; beatAccents: boolean; intensity: number; quality: OutputQuality
      }>
      if (saved.fxPool?.length) { const validFx = saved.fxPool.filter((item) => STYLE_OPTIONS.includes(item)).slice(0, 6); if (validFx.length) { setFxPool(validFx); setStyle(validFx[0]) } }
      if (saved.transition && TRANSITIONS.includes(saved.transition)) setTransition(saved.transition)
      if (saved.colorLook && LOOKS.includes(saved.colorLook)) setColorLook(saved.colorLook)
      if (saved.cutMode) setCutMode(saved.cutMode)
      if (typeof saved.customInterval === 'number') setCustomInterval(clamp(saved.customInterval, 0.2, 4))
      if (saved.mediaOrder) setMediaOrder(saved.mediaOrder)
      if (saved.cropMode) setCropMode(saved.cropMode)
      if (typeof saved.videoSpeed === 'number') setVideoSpeed(saved.videoSpeed)
      if (typeof saved.beatAccents === 'boolean') setBeatAccents(saved.beatAccents)
      if (typeof saved.intensity === 'number') setIntensity(saved.intensity)
      if (saved.quality) setQuality(saved.quality)
      setPresetStatus(copy.presetLoaded)
    } catch {
      setPresetStatus(copy.noPreset)
    }
  }

  const updatePreview = () => {
    const audio = audioRef.current
    if (!audio || !analysis || audio.paused) return
    const time = audio.currentTime
    let beatIndex = 0
    for (let i = 0; i < editBeats.length; i += 1) {
      if (editBeats[i] <= time) beatIndex = i
      else break
    }
    setPreviewIndex(beatIndex % Math.max(1, previewMedia.length))
    setPreviewStrength(strengthAtBeat(analysis, editBeats[beatIndex] ?? time))

    if (time >= startAt + effectiveDuration || audio.ended) {
      audio.pause()
      audio.currentTime = startAt
      setPreviewing(false)
      setPreviewIndex(0)
      return
    }
    requestAnimationFrame(updatePreview)
  }

  const togglePreview = async () => {
    const audio = audioRef.current
    if (!audio || !analysis || media.length < 2) {
      setError(!analysis ? copy.analyzeFirst : copy.missingMedia)
      return
    }
    setError('')
    if (previewing) {
      audio.pause()
      setPreviewing(false)
      return
    }
    if (audio.currentTime < startAt || audio.currentTime >= startAt + effectiveDuration) audio.currentTime = startAt
    setPreviewing(true)
    try {
      await audio.play()
      requestAnimationFrame(updatePreview)
    } catch {
      setPreviewing(false)
    }
  }

  const runExport = async () => {
    if (media.length < 2) return setError(copy.missingMedia)
    if (!audioFile) return setError(copy.missingAudio)
    if (!analysis) return setError(copy.analyzeFirst)
    if (!canExportLocally()) return setError(copy.unsupported)

    setExporting(true)
    setPreviewing(false)
    audioRef.current?.pause()
    setProgress(0)
    setError('')
    if (result) URL.revokeObjectURL(result.url)
    setResult(null)

    try {
      const next = await exportVideo({
        media,
        audioFile,
        analysis,
        seconds: effectiveDuration,
        startAt,
        style,
        fxPool,
        transition,
        colorLook,
        quality,
        cutMode,
        customInterval,
        mediaOrder,
        cropMode,
        videoSpeed,
        beatAccents,
        intensity: intensity / 100,
        onProgress: setProgress
      })
      setResult(next)
      setProgress(1)
    } catch (err) {
      console.error(err)
      setError(copy.exportError)
    } finally {
      setExporting(false)
    }
  }

  const reset = () => {
    media.forEach((item) => URL.revokeObjectURL(item.url))
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    if (result) URL.revokeObjectURL(result.url)
    setMedia([])
    setAudioSourceFile(null)
    setAudioSourceKind('audio')
    setAudioFile(null)
    setAudioUrl('')
    setAnalysis(null)
    setAnalysisProgress(0)
    setAnalysisLabel('')
    setResult(null)
    setProgress(0)
    setPreviewIndex(0)
    setStartAt(0)
    setSeconds(15)
    setError('')
  }

  const dismissInstallPrompt = () => {
    setInstallPromptOpen(false)
    sessionStorage.setItem('ritmexa-install-dismissed', '1')
  }

  const install = async () => {
    if (installPlatform === 'ios') {
      setInstallPromptOpen(true)
      return
    }
    if (!installEvent) return
    await installEvent.prompt()
    const choice = await installEvent.userChoice
    if (choice.outcome === 'accepted') dismissInstallPrompt()
    setInstallEvent(null)
  }

  const selected = previewMedia[previewIndex % Math.max(1, previewMedia.length)]
  const maxStart = analysis ? Math.max(0, Math.floor(analysis.duration - 3)) : 0

  return (
    <div className={`app-shell ${standalone ? 'pwa-mode' : ''}`}>
      <header className="topbar">
        <Logo />
        <div className="top-actions">
          <div className="language-switch" aria-label="Language">
            <button className={language === 'el' ? 'active' : ''} onClick={() => setLanguage('el')}>EL</button>
            <button className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>EN</button>
          </div>
          {!standalone && (installEvent || installPlatform === 'ios') && <button className="icon-button install-button" onClick={() => void install()}>{copy.install}</button>}
        </div>
      </header>

      {installPromptOpen && !standalone && installPlatform !== 'other' && (
        <div className="install-overlay" role="dialog" aria-modal="true" aria-label={copy.installTitle}>
          <div className={`install-sheet ${installPlatform === 'ios' ? 'ios-install-sheet' : 'android-install-sheet'}`}>
            <button className="install-close" onClick={dismissInstallPrompt} aria-label={copy.close}>×</button>
            <div className="install-app-icon"><img src="./brand-mark-v030.png" alt="" /></div>
            <div className="install-copy">
              <span className="eyebrow">RITMEXA APP</span>
              <h2>{installPlatform === 'ios' ? copy.iosInstallTitle : copy.installTitle}</h2>
              <p>{installPlatform === 'ios' ? copy.iosInstallText : copy.androidInstallText}</p>
            </div>

            {installPlatform === 'ios' ? (
              <div className="ios-install-steps">
                <div><span>1</span><p>{copy.iosStep1}</p></div>
                <div><span>2</span><p>{copy.iosStep2}</p></div>
                <div><span>3</span><p>{copy.iosStep3}</p></div>
                <button className="secondary-button full" onClick={dismissInstallPrompt}>{copy.gotIt}</button>
              </div>
            ) : (
              <div className="android-install-actions">
                <button className="primary-button full" onClick={() => void install()}>{copy.installNow}<span>↓</span></button>
                <button className="text-button" onClick={dismissInstallPrompt}>{copy.maybeLater}</button>
              </div>
            )}
          </div>
        </div>
      )}

      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">{copy.heroKicker}</span>
            <h1>{copy.heroTitleA}<br /><em>{copy.heroTitleB}</em></h1>
            <p>{copy.heroText}</p>
            <div className="hero-actions">
              <a className="primary-button" href="#studio">{copy.start}<span>→</span></a>
              <span className="privacy-pill"><span>●</span>{copy.privacyBadge}</span>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="pulse pulse-one" />
            <div className="pulse pulse-two" />
            <div className="phone-demo">
              <div className="phone-notch" />
              <div className="demo-logo"><Logo /></div>
              <div className="demo-copy"><small>RHYTHM ENGINE 2.0</small><strong>Cut smarter.<br />Move better.</strong><p>Photos + Clips + Music</p></div>
              <div className="demo-card"><div className="demo-sun" /><span>FEEL THE BEAT<br /><b>SHAPE THE EDIT</b></span><i>▶</i></div>
            </div>
          </div>
        </section>

        <section className="trust-strip">
          <span>LOCAL PROCESSING</span><b>•</b><span>PWA</span><b>•</b><span>SMART BPM</span><b>•</b><span>NO WATERMARK</span>
        </section>

        <section className="studio" id="studio">
          <div className="section-heading"><span className="eyebrow">RITMEXA CREATOR STUDIO 0.3</span><h2>Edit to the <em>rhythm.</em></h2><p>{copy.localOnly}</p></div>

          <div className="mobile-studio-title"><span className="eyebrow">RITMEXA STUDIO</span><h1>{copy.mobileTitle}</h1><p>{copy.mobileSubtitle}</p></div>

          <div className="step-tabs">
            <span className={media.length ? 'done' : 'active'}><StepIcon value="1" />{copy.media}</span>
            <span className={analysis ? 'done' : audioSourceFile ? 'active' : ''}><StepIcon value="2" />{copy.audio}</span>
            <span className={analysis ? 'active' : ''}><StepIcon value="3" />{copy.motion}</span>
            <span><StepIcon value="4" />{copy.export}</span>
          </div>

          <div className="studio-grid">
            <div className="controls-column">
              <article className="panel media-panel">
                <div className="panel-heading"><div><span className="panel-number">01</span><h3>{copy.addMedia}</h3></div><p>{copy.mediaHelp}</p></div>
                <label className="dropzone" onDragOver={(event) => event.preventDefault()} onDrop={onMediaDrop}>
                  <input className="native-file-input" type="file" accept={MEDIA_ACCEPT} multiple onClick={(event) => { event.currentTarget.value = '' }} onChange={(event) => void addMedia(event.target.files)} />
                  <span className="drop-plus">+</span><strong>{copy.addMedia}</strong><small>JPG • PNG • HEIC • WebP • MP4 • MOV • WebM</small>
                </label>
                {media.length === 0 ? <div className="empty-state">{copy.emptyMedia}</div> : (
                  <div className="media-grid">
                    {media.map((item, index) => (
                      <div className="media-tile" key={item.id}>
                        {item.kind === 'image' ? <img src={item.url} alt="" /> : <video src={item.url} muted playsInline />}
                        <span className="media-order">{index + 1}</span>
                        <div className="media-actions">
                          <button disabled={index === 0} onClick={() => moveMedia(index, -1)} aria-label={copy.moveUp}>↑</button>
                          <button disabled={index === media.length - 1} onClick={() => moveMedia(index, 1)} aria-label={copy.moveDown}>↓</button>
                          <button onClick={() => removeMedia(item.id)} aria-label={copy.remove}>×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>

              <article className="panel audio-panel">
                <div className="panel-heading"><div><span className="panel-number">02</span><h3>{copy.soundtrack}</h3></div><p>{copy.audioHelp}</p></div>

                <div className="audio-source-grid" onDragOver={(event) => event.preventDefault()} onDrop={onAudioDrop}>
                  <label className="audio-source-button">
                    <input className="native-file-input" type="file" accept={AUDIO_ACCEPT} onClick={(event) => { event.currentTarget.value = '' }} onChange={(event) => chooseAudioSource(event.target.files?.[0], 'audio')} />
                    <span className="source-icon">♫</span>
                    <span><strong>{copy.chooseAudio}</strong><small>MP3 • M4A • WAV • AAC • FLAC</small></span>
                    <b>＋</b>
                  </label>

                  <label className="audio-source-button video-source">
                    <input className="native-file-input" type="file" accept={VIDEO_AUDIO_ACCEPT} onClick={(event) => { event.currentTarget.value = '' }} onChange={(event) => chooseAudioSource(event.target.files?.[0], 'video')} />
                    <span className="source-icon">▶</span>
                    <span><strong>{copy.chooseVideoSound}</strong><small>MP4 • MOV • M4V • WebM</small></span>
                    <b>＋</b>
                  </label>
                </div>

                <p className="ios-note">{copy.iosAudioNote}</p>
                <p className="video-sound-note">{copy.videoSoundHint}</p>

                {audioSourceFile && (
                  <div className="selected-audio-source">
                    <span className="source-kind">{audioSourceKind === 'video' ? 'VIDEO' : 'AUDIO'}</span>
                    <div><small>{copy.selectedSource}</small><strong>{audioSourceFile.name}</strong></div>
                    <span>{(audioSourceFile.size / 1024 / 1024).toFixed(1)} MB</span>
                  </div>
                )}

                {audioUrl && <audio ref={audioRef} className="audio-native" src={audioUrl} controls preload="metadata" playsInline />}

                <div className="range-block">
                  <div className="range-title"><span>{copy.sensitivity}</span><strong>{sensitivity}%</strong></div>
                  <input type="range" min="30" max="90" value={sensitivity} onChange={(event) => setSensitivity(Number(event.target.value))} />
                  <small>{copy.sensitivityHelp}</small>
                </div>

                <button className="secondary-button full" onClick={() => void runAnalysis()} disabled={!audioSourceFile || isAnalyzing}>
                  {isAnalyzing ? `${analysisLabel || copy.analyzing} ${Math.round(analysisProgress * 100)}%` : analysis ? copy.reanalyze : copy.analyze}
                  <span>⌁</span>
                </button>

                {isAnalyzing && <div className="analysis-progress"><i style={{ width: `${Math.round(analysisProgress * 100)}%` }} /></div>}

                {analysis && (
                  <>
                    <div className="waveform" aria-label="Audio waveform">
                      {analysis.waveform.map((value, index) => <i key={index} style={{ height: `${Math.max(8, value * 100)}%` }} />)}
                    </div>
                    <div className="analysis-card six">
                      <div><strong>{analysis.bpm}</strong><span>{copy.bpm}</span></div>
                      <div><strong>{analysis.beats.length}</strong><span>{copy.beatsDetected}</span></div>
                      <div><strong>{analysis.strongBeats.length}</strong><span>{copy.strongBeats}</span></div>
                      <div><strong>{Math.round(analysis.confidence * 100)}%</strong><span>{copy.confidence}</span></div>
                      <div><strong>{Math.round(analysis.stability * 100)}%</strong><span>{copy.stability}</span></div>
                      <div><strong>{Math.round(analysis.energy * 100)}%</strong><span>{copy.energy}</span></div>
                    </div>
                  </>
                )}
              </article>

              <article className="panel creator-panel">
                <div className="panel-heading"><div><span className="panel-number">03</span><h3>{copy.creatorStudio}</h3></div><p>{copy.creatorStudioHelp}</p></div>

                <div className="recipe-row">
                  {RECIPES.map((recipe) => <button key={recipe} onClick={() => applyRecipe(recipe)}><strong>{copy[recipe]}</strong><small>{copy[`${recipe}Desc` as keyof typeof copy]}</small></button>)}
                </div>

                <div className="creator-actions">
                  <button className="remix-button" onClick={remix}><span>↻</span><strong>{copy.remix}</strong><small>{copy.remixHelp}</small></button>
                  <button onClick={savePreset}><strong>{copy.savePreset}</strong><small>{copy.savePresetHelp}</small></button>
                  <button onClick={loadPreset}><strong>{copy.loadPreset}</strong><small>{copy.loadPresetHelp}</small></button>
                </div>
                {presetStatus && <div className="preset-status">{presetStatus}</div>}

                <div className="subsection-heading"><div><strong>{copy.motionMix}</strong><small>{copy.motionMixHelp}</small></div><span>{fxPool.length}/6</span></div>
                <div className="style-cards advanced">
                  {STYLE_OPTIONS.map((option) => (
                    <button className={fxPool.includes(option) ? 'style-card active' : 'style-card'} onClick={() => toggleEffect(option)} key={option}>
                      <span className={`style-preview ${option}`}><i /><i /><i /></span>
                      <strong>{copy[option]}</strong><small>{copy[`${option}Desc` as keyof typeof copy]}</small>
                      <span className="fx-check">{fxPool.includes(option) ? '✓' : '+'}</span>
                    </button>
                  ))}
                </div>

                <div className="range-block compact">
                  <div className="range-title"><span>{copy.intensity}</span><strong>{intensity}%</strong></div>
                  <input type="range" min="20" max="100" value={intensity} onChange={(event) => setIntensity(Number(event.target.value))} />
                </div>

                <div className="advanced-grid">
                  <div className="control-box">
                    <label>{copy.transition}</label>
                    <select value={transition} onChange={(event) => setTransition(event.target.value as TransitionStyle)}>{TRANSITIONS.map((item) => <option key={item} value={item}>{copy[item]}</option>)}</select>
                  </div>
                  <div className="control-box">
                    <label>{copy.colorLook}</label>
                    <select value={colorLook} onChange={(event) => setColorLook(event.target.value as ColorLook)}>{LOOKS.map((item) => <option key={item} value={item}>{copy[item]}</option>)}</select>
                  </div>
                  <div className="control-box">
                    <label>{copy.mediaOrder}</label>
                    <div className="segment-control two">
                      <button className={mediaOrder === 'sequence' ? 'active' : ''} onClick={() => setMediaOrder('sequence')}>{copy.sequence}</button>
                      <button className={mediaOrder === 'shuffle' ? 'active' : ''} onClick={() => setMediaOrder('shuffle')}>{copy.shuffle}</button>
                    </div>
                  </div>
                  <div className="control-box">
                    <label>{copy.cropMode}</label>
                    <div className="segment-control two">
                      <button className={cropMode === 'cover' ? 'active' : ''} onClick={() => setCropMode('cover')}>{copy.cover}</button>
                      <button className={cropMode === 'contain' ? 'active' : ''} onClick={() => setCropMode('contain')}>{copy.fit}</button>
                    </div>
                  </div>
                  <div className="control-box">
                    <label>{copy.videoSpeed}</label>
                    <select value={videoSpeed} onChange={(event) => setVideoSpeed(Number(event.target.value))}>
                      <option value={0.75}>0.75x</option><option value={0.9}>0.9x</option><option value={1}>1x</option><option value={1.15}>1.15x</option><option value={1.25}>1.25x</option><option value={1.5}>1.5x</option>
                    </select>
                  </div>
                  <div className="control-box toggle-box">
                    <label>{copy.beatAccents}</label>
                    <button className={beatAccents ? 'toggle active' : 'toggle'} onClick={() => setBeatAccents((value) => !value)}><i />{beatAccents ? copy.on : copy.off}</button>
                  </div>
                </div>

                <div className="subsection-heading"><div><strong>{copy.customEdit}</strong><small>{copy.customEditHelp}</small></div></div>
                <div className="control-grid">
                  <div className="control-box">
                    <label>{copy.cutPace}</label>
                    <div className="segment-control four">
                      {(['smart', 'every', 'strong', 'custom'] as CutMode[]).map((mode) => <button key={mode} className={cutMode === mode ? 'active' : ''} onClick={() => setCutMode(mode)}>{copy[mode]}</button>)}
                    </div>
                  </div>
                  <div className="control-box">
                    <label>{copy.quality}</label>
                    <div className="segment-control two">
                      <button className={quality === '720' ? 'active' : ''} onClick={() => setQuality('720')}>{copy.hd}</button>
                      <button className={quality === '1080' ? 'active' : ''} onClick={() => setQuality('1080')}>{copy.fullhd}</button>
                    </div>
                  </div>
                </div>

                {cutMode === 'custom' && <div className="range-block custom-cut-range">
                  <div className="range-title"><span>{copy.customCut}</span><strong>{customInterval.toFixed(2)}s</strong></div>
                  <input type="range" min="0.2" max="4" step="0.05" value={customInterval} onChange={(event) => setCustomInterval(Number(event.target.value))} />
                  <small>{copy.customCutHelp}</small>
                </div>}

                <div className="timing-grid">
                  <label>{copy.startAt}<div className="number-field"><input type="number" min="0" max={maxStart} step="1" value={Math.round(startAt)} onChange={(event) => setStartAt(clamp(Number(event.target.value) || 0, 0, maxStart))} /><span>{copy.seconds}</span></div></label>
                  <label>{copy.customSeconds}<div className="number-field"><input type="number" min="3" max={Math.floor(availableDuration)} step="1" value={Math.round(effectiveDuration)} onChange={(event) => setSeconds(clamp(Number(event.target.value) || 3, 3, Math.max(3, Math.floor(availableDuration))))} /><span>{copy.seconds}</span></div></label>
                </div>
                <div className="preset-row">{PRESETS.map((value) => <button key={value} disabled={value > availableDuration} className={Math.round(effectiveDuration) === value ? 'active' : ''} onClick={() => setSeconds(Math.min(value, availableDuration))}>{value}s</button>)}</div>
                {analysis && <div className="timing-summary"><span>{formatTime(startAt)} → {formatTime(startAt + effectiveDuration)}</span><strong>{editBeats.length} {copy.cuts}</strong></div>}
              </article>

              <article className="panel export-workspace">
                <div className="panel-heading export-heading">
                  <div><span className="panel-number">04</span><h3>{copy.ready}</h3></div>
                  <p>{copy.readyText}</p>
                </div>
                {exporting && <div className="progress-wrap"><div className="progress-line"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div><span>{Math.round(progress * 100)}%</span></div>}
                <button className="primary-button full" onClick={() => void runExport()} disabled={exporting}>{exporting ? copy.exporting : copy.exportNow}<span>{exporting ? '…' : '→'}</span></button>
                {result && <a className="download-button" href={result.url} download={result.filename}>{copy.download}<span>↓</span></a>}
                {result && <button className="text-button" onClick={reset}>{copy.newEdit}</button>}
                <small className="browser-note">{copy.browserNote}</small>
                {error && <div className="error-box" role="alert">{error}</div>}
              </article>
            </div>

            <aside className="preview-column">
              <div className="preview-sticky">
                <div className="preview-heading"><div><span className="eyebrow">{copy.preview}</span><strong>9:16</strong></div><span>{Math.round(effectiveDuration)}s</span></div>
                <div className={`preview-phone style-${previewStyle} look-${colorLook} crop-${cropMode} transition-${transition} ${previewing ? 'is-playing' : ''}`} style={{ '--hit': previewStrength, '--intensity': intensity / 100 } as React.CSSProperties}>
                  <div className="preview-screen" key={`${previewIndex}-${previewStyle}-${colorLook}-${previewing ? 'play' : 'stop'}`}>
                    {!selected ? <div className="preview-placeholder"><span className="brand-mark small"><i /><i /><i /><b /></span><strong>Ritmexa</strong><small>{copy.tagline}</small></div> : selected.kind === 'image' ? <img src={selected.url} alt="Preview" /> : <video src={selected.url} autoPlay={previewing} muted loop playsInline />}
                    {selected && <div className="preview-vignette" />}
                    {selected && previewStyle === 'film' && <div className="preview-grain" />}
                    {selected && (previewStyle === 'flash' || transition === 'flash') && <div className="preview-flash" />}
                    {selected && (previewStyle === 'glitch' || previewStyle === 'chroma' || transition === 'glitch') && <div className="preview-glitch"><i /><i /><i /></div>}
                  </div>
                </div>
                <button className="preview-button" onClick={() => void togglePreview()} disabled={!analysis || media.length < 2}>{previewing ? 'Ⅱ' : '▶'} {previewing ? copy.pausePreview : copy.playPreview}</button>
                <small className="preview-hint">{copy.previewHint}</small>
                <div className="timeline-mini">{previewMedia.slice(0, 14).map((item, index) => <span key={item.id} className={index === previewIndex ? 'active' : ''}>{item.kind === 'image' ? <img src={item.url} alt="" /> : <video src={item.url} muted />}</span>)}</div>

              </div>
            </aside>
          </div>
        </section>

        <section className="privacy-section">
          <div className="privacy-icon">⌁</div><div><span className="eyebrow">{copy.privacy}</span><h2>{copy.privacyText}</h2><p>{copy.about}</p></div>
        </section>
      </main>

      <footer><Logo /><span>{copy.footer}</span><a href="./privacy.html">{copy.privacy}</a></footer>
    </div>
  )
}

export default App
