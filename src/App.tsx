import { useEffect, useMemo, useRef, useState } from 'react'
import { analyzeAudio } from './lib/beat'
import { canExportLocally, exportVideo } from './lib/exporter'
import { filesToMedia } from './lib/media'
import { t } from './i18n'
import type { BeatAnalysis, EditStyle, ExportResult, Language, MediaItem, OutputQuality } from './types'

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

const Logo = () => (
  <div className="brand" aria-label="Ritmexa">
    <span className="brand-mark" aria-hidden="true">
      <i /><i /><i /><b />
    </span>
    <span className="brand-copy"><strong>Ritmexa</strong><small>Your moments, on beat</small></span>
  </div>
)

const StepIcon = ({ value }: { value: string }) => <span className="step-icon">{value}</span>

function App() {
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('ritmexa-language') as Language) || 'en')
  const copy = t(language)
  const [media, setMedia] = useState<MediaItem[]>([])
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [audioUrl, setAudioUrl] = useState('')
  const [analysis, setAnalysis] = useState<BeatAnalysis | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [style, setStyle] = useState<EditStyle>('punch')
  const [quality, setQuality] = useState<OutputQuality>('720')
  const [seconds, setSeconds] = useState(15)
  const [previewing, setPreviewing] = useState(false)
  const [previewIndex, setPreviewIndex] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<ExportResult | null>(null)
  const [error, setError] = useState('')
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null)
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
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  useEffect(() => () => {
    media.forEach((item) => URL.revokeObjectURL(item.url))
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    if (result) URL.revokeObjectURL(result.url)
  }, [])

  const effectiveDuration = useMemo(() => analysis ? Math.min(seconds, analysis.duration) : seconds, [analysis, seconds])

  const addMedia = async (files: FileList | null) => {
    if (!files) return
    setError('')
    const added = await filesToMedia(Array.from(files))
    setMedia((current) => [...current, ...added].slice(0, 30))
    setResult(null)
  }

  const chooseAudio = (file?: File) => {
    if (!file) return
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioFile(file)
    setAudioUrl(URL.createObjectURL(file))
    setAnalysis(null)
    setResult(null)
    setError('')
  }

  const runAnalysis = async () => {
    if (!audioFile) return setError(copy.missingAudio)
    setIsAnalyzing(true)
    setError('')
    try {
      const next = await analyzeAudio(audioFile)
      setAnalysis(next)
      setSeconds((value) => Math.min(value, Math.max(5, Math.floor(next.duration))))
    } catch {
      setError(copy.exportError)
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

  const updatePreview = () => {
    const audio = audioRef.current
    if (!audio || !analysis || audio.paused) return
    const time = audio.currentTime
    let beatIndex = 0
    for (let i = 0; i < analysis.beats.length; i += 1) {
      if (analysis.beats[i] <= time) beatIndex = i
      else break
    }
    setPreviewIndex(beatIndex % Math.max(1, media.length))
    if (time >= effectiveDuration || audio.ended) {
      audio.pause()
      audio.currentTime = 0
      setPreviewing(false)
      setPreviewIndex(0)
      return
    }
    requestAnimationFrame(updatePreview)
  }

  const togglePreview = async () => {
    const audio = audioRef.current
    if (!audio || !analysis || media.length < 2) return
    if (previewing) {
      audio.pause()
      setPreviewing(false)
      return
    }
    if (audio.currentTime >= effectiveDuration) audio.currentTime = 0
    setPreviewing(true)
    await audio.play()
    requestAnimationFrame(updatePreview)
  }

  const runExport = async () => {
    if (media.length < 2) return setError(copy.missingMedia)
    if (!audioFile) return setError(copy.missingAudio)
    if (!analysis) return setError(copy.analyzeFirst)
    if (!canExportLocally()) return setError(copy.unsupported)

    setExporting(true)
    setProgress(0)
    setError('')
    if (result) URL.revokeObjectURL(result.url)
    setResult(null)
    try {
      const next = await exportVideo({ media, audioFile, analysis, seconds, style, quality, onProgress: setProgress })
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
    setAudioFile(null)
    setAudioUrl('')
    setAnalysis(null)
    setResult(null)
    setProgress(0)
    setPreviewIndex(0)
    setError('')
  }

  const install = async () => {
    if (!installEvent) return
    await installEvent.prompt()
    await installEvent.userChoice
    setInstallEvent(null)
  }

  const selected = media[previewIndex]

  return (
    <div className="app-shell">
      <header className="topbar">
        <Logo />
        <div className="top-actions">
          <div className="language-switch" aria-label="Language">
            <button className={language === 'el' ? 'active' : ''} onClick={() => setLanguage('el')}>EL</button>
            <button className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>EN</button>
          </div>
          {installEvent && <button className="icon-button install-button" onClick={install}>{copy.install}</button>}
        </div>
      </header>

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
              <div className="demo-copy"><small>BEAT SYNC</small><strong>Make every<br />moment hit.</strong><p>Photos + Clips + Music</p></div>
              <div className="demo-card"><div className="demo-sun" /><span>GOOD MOMENTS<br /><b>BETTER BEATS</b></span><i>▶</i></div>
            </div>
          </div>
        </section>

        <section className="trust-strip">
          <span>LOCAL PROCESSING</span><b>•</b><span>PWA</span><b>•</b><span>NO ACCOUNT</span><b>•</b><span>NO WATERMARK</span>
        </section>

        <section className="studio" id="studio">
          <div className="section-heading"><span className="eyebrow">RITMEXA STUDIO</span><h2>Edit to the <em>rhythm.</em></h2><p>{copy.localOnly}</p></div>

          <div className="step-tabs">
            <span className={media.length ? 'done' : 'active'}><StepIcon value="1" />{copy.media}</span>
            <span className={analysis ? 'done' : audioFile ? 'active' : ''}><StepIcon value="2" />{copy.audio}</span>
            <span className={analysis ? 'active' : ''}><StepIcon value="3" />{copy.style}</span>
            <span><StepIcon value="4" />{copy.export}</span>
          </div>

          <div className="studio-grid">
            <div className="controls-column">
              <article className="panel">
                <div className="panel-heading"><div><span className="panel-number">01</span><h3>{copy.addMedia}</h3></div><p>{copy.mediaHelp}</p></div>
                <label className="dropzone">
                  <input type="file" accept="image/*,video/*" multiple onChange={(event) => void addMedia(event.target.files)} />
                  <span className="drop-plus">+</span><strong>{copy.addMedia}</strong><small>JPG • PNG • WebP • MP4 • MOV • WebM</small>
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

              <article className="panel">
                <div className="panel-heading"><div><span className="panel-number">02</span><h3>{copy.chooseAudio}</h3></div><p>{copy.audioHelp}</p></div>
                <label className="audio-picker">
                  <input type="file" accept="audio/*" onChange={(event) => chooseAudio(event.target.files?.[0])} />
                  <span className="wave-mini"><i /><i /><i /><i /><i /></span>
                  <div><strong>{audioFile?.name || copy.chooseAudio}</strong><small>{audioFile ? `${(audioFile.size / 1024 / 1024).toFixed(1)} MB` : 'MP3 • WAV • M4A • AAC'}</small></div><span>＋</span>
                </label>
                {audioUrl && <audio ref={audioRef} className="audio-native" src={audioUrl} controls preload="metadata" />}
                <button className="secondary-button full" onClick={() => void runAnalysis()} disabled={!audioFile || isAnalyzing}>{isAnalyzing ? copy.analyzing : copy.analyze}<span>⌁</span></button>
                {analysis && (
                  <div className="analysis-card">
                    <div><strong>{analysis.beats.length}</strong><span>{copy.beatsDetected}</span></div>
                    <div><strong>{analysis.bpm}</strong><span>{copy.bpm}</span></div>
                    <div><strong>{Math.round(analysis.confidence * 100)}%</strong><span>{copy.confidence}</span></div>
                  </div>
                )}
              </article>

              <article className="panel">
                <div className="panel-heading"><div><span className="panel-number">03</span><h3>{copy.styleTitle}</h3></div></div>
                <div className="style-cards">
                  {(['punch', 'flow', 'clean'] as EditStyle[]).map((option) => (
                    <button className={style === option ? 'style-card active' : 'style-card'} onClick={() => setStyle(option)} key={option}>
                      <span className={`style-preview ${option}`}><i /><i /><i /></span>
                      <strong>{copy[option]}</strong><small>{option === 'punch' ? copy.punchDesc : option === 'flow' ? copy.flowDesc : copy.cleanDesc}</small>
                    </button>
                  ))}
                </div>
                <div className="setting-row"><label>{copy.maxDuration}<select value={seconds} onChange={(event) => setSeconds(Number(event.target.value))}>{[15, 30, 45, 60].map((value) => <option key={value} value={value}>{value} {copy.seconds}</option>)}</select></label><label>{copy.quality}<select value={quality} onChange={(event) => setQuality(event.target.value as OutputQuality)}><option value="720">{copy.hd}</option><option value="1080">{copy.fullhd}</option></select></label></div>
              </article>
            </div>

            <aside className="preview-column">
              <div className="preview-sticky">
                <div className="preview-heading"><div><span className="eyebrow">{copy.preview}</span><strong>9:16</strong></div><span>{effectiveDuration.toFixed(0)}s</span></div>
                <div className={`preview-phone style-${style}`}>
                  <div className="preview-screen" key={`${previewIndex}-${style}`}>
                    {!selected ? <div className="preview-placeholder"><span className="brand-mark small"><i /><i /><i /><b /></span><strong>Ritmexa</strong><small>{copy.tagline}</small></div> : selected.kind === 'image' ? <img src={selected.url} alt="Preview" /> : <video src={selected.url} autoPlay={previewing} muted loop playsInline />}
                    {selected && <div className="preview-vignette" />}
                  </div>
                </div>
                <button className="preview-button" onClick={() => void togglePreview()} disabled={!analysis || media.length < 2}>{previewing ? 'Ⅱ' : '▶'} {previewing ? copy.pausePreview : copy.playPreview}</button>
                <div className="timeline-mini">{media.slice(0, 10).map((item, index) => <span key={item.id} className={index === previewIndex ? 'active' : ''}>{item.kind === 'image' ? <img src={item.url} alt="" /> : <video src={item.url} muted />}</span>)}</div>

                <div className="export-card">
                  <span className="panel-number">04</span><h3>{copy.ready}</h3><p>{copy.readyText}</p>
                  {exporting && <div className="progress-wrap"><div className="progress-line"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div><span>{Math.round(progress * 100)}%</span></div>}
                  <button className="primary-button full" onClick={() => void runExport()} disabled={exporting}>{exporting ? copy.exporting : copy.exportNow}<span>{exporting ? '…' : '→'}</span></button>
                  {result && <a className="download-button" href={result.url} download={result.filename}>{copy.download}<span>↓</span></a>}
                  {result && <button className="text-button" onClick={reset}>{copy.newEdit}</button>}
                  <small className="browser-note">{copy.browserNote}</small>
                </div>
                {error && <div className="error-box" role="alert">{error}</div>}
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
