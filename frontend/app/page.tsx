'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import dynamic from 'next/dynamic'
import {
  Upload, Plus, Trash2, AlignLeft, AlignCenter, AlignRight,
  Bold, Italic, Underline, ImageIcon, QrCode, Download,
  ZoomIn, ZoomOut, Code2, Play, RefreshCw,
} from 'lucide-react'

// ── Google Fonts ──────────────────────────────────────────────────────────────

const FONT_IMPORTS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Montserrat:wght@300;400;600&family=Great+Vibes&display=swap');
`

// ── Types ─────────────────────────────────────────────────────────────────────

export type FrameShape = 'none' | 'circle' | 'oval' | 'heart' | 'arch' | 'diamond' | 'hexagon'

export interface Zone {
  id: string
  label: string
  type?: 'text' | 'image' | 'qr'
  text: string
  xPct: number
  yPct: number
  fontSize: number
  color: string
  fontFamily: string
  bold: boolean
  italic: boolean
  align: 'left' | 'center' | 'right'
  opacity: number
  underline?: boolean
  imageSrc?: string
  frameShape?: FrameShape
  frameColor?: string
  widthPct?: number
  heightPct?: number
  imageOffsetX?: number
  imageOffsetY?: number
  imageScale?: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CARD_W = 800
const CARD_H = 1100

const FONT_FAMILIES = [
  'Playfair Display',
  'Cormorant Garamond',
  'Montserrat',
  'Great Vibes',
]

const FRAME_SHAPES: FrameShape[] = ['none', 'circle', 'oval', 'heart', 'arch', 'diamond', 'hexagon']

const COLOR_SWATCHES = [
  '#ffffff', '#FFF8DC', '#D4AF37', '#FBBF24', '#F97316',
  '#EF4444', '#EC4899', '#A855F7', '#3B82F6', '#14B8A6',
  '#22C55E', '#2C2C2C', '#000000',
]

const DEFAULT_ZONES: Zone[] = [
  { id: 'hosts',    label: 'Hosts',      text: '{{hosts}}',      xPct: 50, yPct: 25, fontSize: 26, color: '#000000', fontFamily: 'Cormorant Garamond', bold: false, italic: false, align: 'center', opacity: 1,    widthPct: 80 },
  { id: 'greeting', label: 'Greeting',   text: 'You are invited',xPct: 50, yPct: 48, fontSize: 18, color: '#000000', fontFamily: 'Montserrat',         bold: false, italic: false, align: 'center', opacity: 1,    widthPct: 80 },
  { id: 'guest',    label: 'Guest Name', text: '{{guest_name}}', xPct: 50, yPct: 55, fontSize: 42, color: '#D4AF37', fontFamily: 'Great Vibes',        bold: false, italic: false, align: 'center', opacity: 1,    widthPct: 80 },
  { id: 'date',     label: 'Date',       text: '{{event_date}}', xPct: 50, yPct: 66, fontSize: 18, color: '#000000', fontFamily: 'Montserrat',         bold: false, italic: false, align: 'center', opacity: 1,    widthPct: 80 },
  { id: 'venue',    label: 'Venue',      text: '{{venue}}',      xPct: 50, yPct: 72, fontSize: 16, color: '#000000', fontFamily: 'Montserrat',         bold: false, italic: false, align: 'center', opacity: 1,    widthPct: 80 },
  { id: 'qr',       label: 'QR Code',   text: '', type: 'qr',   xPct: 8,  yPct: 90, fontSize: 16, color: '#000000', fontFamily: 'Montserrat',         bold: false, italic: false, align: 'left',   opacity: 1,    widthPct: 12 },
]

const DEFAULT_FIELDS: Record<string, string> = {
  guest_name:         'Amina Hassan',
  hosts:              'Your Hosts',
  event_date:         'Saturday, 14 June 2025',
  venue:              'Serena Hotel',
  __checkin_token__:  'EVT1-GUEST42-ABC123',
}

// ── Dynamic canvas (SSR-safe) ─────────────────────────────────────────────────

const KonvaCanvas = dynamic(() => import('./KonvaCanvas'), { ssr: false })

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 8)
}

function newTextZone(): Zone {
  return {
    id: uid(), label: 'New Text', type: 'text',
    text: 'New text', xPct: 50, yPct: 50,
    fontSize: 24, color: '#000000', fontFamily: 'Montserrat',
    bold: false, italic: false, align: 'center', opacity: 1, widthPct: 80,
  }
}

function newImageZone(): Zone {
  return {
    id: uid(), label: 'Image', type: 'image',
    text: '', xPct: 50, yPct: 50,
    fontSize: 16, color: '#000000', fontFamily: 'Montserrat',
    bold: false, italic: false, align: 'center', opacity: 1,
    widthPct: 30, heightPct: 30, frameShape: 'circle', frameColor: '#D4AF37',
  }
}

// Substitute {{token}} placeholders for canvas preview
function substitute(text: string, fields: Record<string, string>): string {
  return Object.entries(fields).reduce(
    (t, [k, v]) => t.replaceAll(`{{${k}}}`, v),
    text,
  )
}

// Build display zones: replace tokens with field values for preview
function previewZones(zones: Zone[], fields: Record<string, string>): Zone[] {
  return zones.map(z =>
    (!z.type || z.type === 'text')
      ? { ...z, text: substitute(z.text, fields) }
      : z
  )
}

// Zones → Go-compatible JSON (xPct/yPct as camelCase matching the Go struct)
function zonesToGoJSON(zones: Zone[]): string {
  return JSON.stringify(zones.map(z => {
    const out: Record<string, unknown> = {
      id: z.id, type: z.type ?? 'text',
      text: z.text,
      xPct: z.xPct, yPct: z.yPct,
      widthPct: z.widthPct ?? 80,
    }
    if (z.heightPct !== undefined) out.heightPct = z.heightPct
    if (!z.type || z.type === 'text') {
      out.fontFamily = z.fontFamily
      out.fontSize   = z.fontSize
      out.color      = z.color
      out.bold       = z.bold
      out.italic     = z.italic
      out.align      = z.align
      out.opacity    = z.opacity
      if (z.underline) out.underline = z.underline
    }
    if (z.type === 'image') {
      out.frameShape = z.frameShape ?? 'circle'
      out.frameColor = z.frameColor ?? '#D4AF37'
      out.opacity    = z.opacity
      if (z.imageOffsetX) out.imageOffsetX = z.imageOffsetX
      if (z.imageOffsetY) out.imageOffsetY = z.imageOffsetY
      if (z.imageScale && z.imageScale !== 1) out.imageScale = z.imageScale
    }
    return out
  }), null, 2)
}

// ── Main component ────────────────────────────────────────────────────────────

export default function EditorPage() {
  const [zones, setZones] = useState<Zone[]>(DEFAULT_ZONES)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [uploadedBg, setUploadedBg] = useState<string | null>(null)
  const [bgFile, setBgFile] = useState<File | null>(null)
  const [bgNatural, setBgNatural] = useState<{ w: number; h: number } | null>(null)
  const [fields, setFields] = useState<Record<string, string>>(DEFAULT_FIELDS)
  const [newFieldKey, setNewFieldKey] = useState('')
  const [scale, setScale] = useState(0.42)
  const [renderUrl, setRenderUrl] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [showJson, setShowJson] = useState(false)
  const [renderServerUrl, setRenderServerUrl] = useState('http://localhost:8080')

  const bgInputRef = useRef<HTMLInputElement>(null)
  const imgInputRef = useRef<HTMLInputElement>(null)
  const pendingImageZoneId = useRef<string | null>(null)

  const cardW = bgNatural ? Math.round((bgNatural.w / bgNatural.h) * CARD_H) : CARD_W
  const cardH = CARD_H

  // Inject Google Fonts
  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = FONT_IMPORTS
    document.head.appendChild(style)
    return () => { document.head.removeChild(style) }
  }, [])

  const selected = zones.find(z => z.id === selectedId) ?? null

  const updateZone = useCallback((id: string, patch: Partial<Zone>) => {
    setZones(zs => zs.map(z => z.id === id ? { ...z, ...patch } : z))
  }, [])

  const handleBgUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBgFile(file)
    const url = URL.createObjectURL(file)
    setUploadedBg(url)
    const img = new window.Image()
    img.onload = () => setBgNatural({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = url
  }, [])

  const handleImageZoneUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const zoneId = pendingImageZoneId.current
    if (!file || !zoneId) return
    const reader = new FileReader()
    reader.onload = () => {
      updateZone(zoneId, { imageSrc: reader.result as string })
    }
    reader.readAsDataURL(file)
  }, [updateZone])

  const handleZoneDrag = useCallback((id: string, xPct: number, yPct: number) => {
    updateZone(id, { xPct, yPct })
  }, [updateZone])

  const handleZoneResize = useCallback((id: string, patch: Partial<Zone>) => {
    updateZone(id, patch)
  }, [updateZone])

  const deleteZone = useCallback((id: string) => {
    setZones(zs => zs.filter(z => z.id !== id))
    setSelectedId(s => s === id ? null : s)
  }, [])

  // Extract tokens from zone texts for the fields panel
  const detectedTokens = useCallback((): string[] => {
    const tokens = new Set<string>()
    zones.forEach(z => {
      const matches = z.text.match(/\{\{([^}]+)\}\}/g)
      matches?.forEach(m => tokens.add(m.slice(2, -2)))
    })
    return [...tokens]
  }, [zones])

  // Add newly detected tokens to fields
  useEffect(() => {
    const tokens = detectedTokens()
    setFields(prev => {
      const next = { ...prev }
      let changed = false
      tokens.forEach(t => {
        if (!(t in next)) { next[t] = ''; changed = true }
      })
      return changed ? next : prev
    })
  }, [detectedTokens])

  const handleRender = useCallback(async () => {
    if (!bgFile) { setRenderError('Upload a background image first'); return }
    setRendering(true)
    setRenderError(null)
    setRenderUrl(null)
    try {
      const form = new FormData()
      form.append('background', bgFile)
      // Map zones: replace {{token}} with actual field values for the render
      const renderZones = zones.map(z => {
        const base: Record<string, unknown> = {
          id: z.id, type: z.type ?? 'text',
          text: z.text, xPct: z.xPct, yPct: z.yPct, widthPct: z.widthPct ?? 80,
        }
        if (z.heightPct !== undefined) base.heightPct = z.heightPct
        if (!z.type || z.type === 'text') {
          base.fontFamily = z.fontFamily; base.fontSize = z.fontSize
          base.color = z.color; base.bold = z.bold; base.italic = z.italic
          base.align = z.align; base.opacity = z.opacity
          if (z.underline) base.underline = z.underline
        }
        if (z.type === 'image') {
          base.imageSrc = z.imageSrc ?? ''
          base.frameShape = z.frameShape ?? 'circle'
          base.frameColor = z.frameColor ?? '#D4AF37'
          base.opacity = z.opacity
          if (z.imageOffsetX) base.imageOffsetX = z.imageOffsetX
          if (z.imageOffsetY) base.imageOffsetY = z.imageOffsetY
          if (z.imageScale && z.imageScale !== 1) base.imageScale = z.imageScale
        }
        return base
      })
      form.append('zones', JSON.stringify(renderZones))
      form.append('fields', JSON.stringify(fields))
      const res = await fetch(`${renderServerUrl}/render`, { method: 'POST', body: form })
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg || res.statusText)
      }
      const blob = await res.blob()
      setRenderUrl(URL.createObjectURL(blob))
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : String(err))
    } finally {
      setRendering(false)
    }
  }, [bgFile, zones, fields, renderServerUrl])

  const downloadRender = useCallback(() => {
    if (!renderUrl) return
    const a = document.createElement('a')
    a.href = renderUrl
    a.download = 'invitation.png'
    a.click()
  }, [renderUrl])

  const preview = previewZones(zones, fields)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        flexShrink: 0,
      }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
          go-invite-render
        </span>
        <span style={{ fontSize: 12, color: 'var(--muted)', marginRight: 'auto' }}>
          card editor
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ margin: 0, fontSize: 12, color: 'var(--muted)', textTransform: 'none', letterSpacing: 0 }}>
            Render server
          </label>
          <input
            className="input"
            style={{ width: 220, fontSize: 12 }}
            value={renderServerUrl}
            onChange={e => setRenderServerUrl(e.target.value)}
            placeholder="http://localhost:8080"
          />
        </div>

        <button className="btn btn-ghost" onClick={() => setShowJson(v => !v)}>
          <Code2 size={14} /> {showJson ? 'Hide JSON' : 'Export JSON'}
        </button>

        <button className="btn btn-primary" onClick={handleRender} disabled={rendering || !bgFile}>
          {rendering ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={14} />}
          Render
        </button>
      </div>

      {/* Three-column body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Left: zones + properties ── */}
        <div style={{
          width: 260, flexShrink: 0, borderRight: '1px solid var(--border)',
          overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 16,
        }}>

          {/* Zone list */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="section-title">Zones</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => {
                  const z = newTextZone(); setZones(zs => [...zs, z]); setSelectedId(z.id)
                }}>
                  <Plus size={12} /> Text
                </button>
                <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => {
                  const z = newImageZone(); setZones(zs => [...zs, z]); setSelectedId(z.id)
                }}>
                  <ImageIcon size={12} /> Image
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {zones.map(z => (
                <div
                  key={z.id}
                  className={`zone-item ${selectedId === z.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(z.id)}
                >
                  <span style={{ fontSize: 12, flex: 1, color: 'var(--text)' }}>
                    {z.type === 'image' ? <ImageIcon size={11} style={{ display: 'inline', marginRight: 4 }} /> : null}
                    {z.type === 'qr' ? <QrCode size={11} style={{ display: 'inline', marginRight: 4 }} /> : null}
                    {z.label}
                  </span>
                  <button
                    className="icon-btn"
                    style={{ padding: 2 }}
                    onClick={e => { e.stopPropagation(); deleteZone(z.id) }}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Selected zone properties */}
          {selected && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ height: 1, background: 'var(--border)' }} />
              <span className="section-title">{selected.label}</span>

              {/* Label */}
              <div>
                <label>Label</label>
                <input className="input" value={selected.label}
                  onChange={e => updateZone(selected.id, { label: e.target.value })} />
              </div>

              {/* Text (for text zones) */}
              {(!selected.type || selected.type === 'text') && (
                <>
                  <div>
                    <label>Text / Token</label>
                    <input className="input" value={selected.text}
                      onChange={e => updateZone(selected.id, { text: e.target.value })} />
                  </div>

                  <div>
                    <label>Font</label>
                    <select className="input" value={selected.fontFamily}
                      onChange={e => updateZone(selected.id, { fontFamily: e.target.value })}>
                      {FONT_FAMILIES.map(f => <option key={f}>{f}</option>)}
                    </select>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label>Size</label>
                      <input className="input" type="number" min={8} max={120} value={selected.fontSize}
                        onChange={e => updateZone(selected.id, { fontSize: +e.target.value })} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label>Opacity</label>
                      <input className="input" type="number" min={0} max={1} step={0.05} value={selected.opacity}
                        onChange={e => updateZone(selected.id, { opacity: +e.target.value })} />
                    </div>
                  </div>

                  <div>
                    <label>Style</label>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className={`icon-btn ${selected.bold ? 'active' : ''}`}
                        onClick={() => updateZone(selected.id, { bold: !selected.bold })}>
                        <Bold size={13} />
                      </button>
                      <button className={`icon-btn ${selected.italic ? 'active' : ''}`}
                        onClick={() => updateZone(selected.id, { italic: !selected.italic })}>
                        <Italic size={13} />
                      </button>
                      <button className={`icon-btn ${selected.underline ? 'active' : ''}`}
                        onClick={() => updateZone(selected.id, { underline: !selected.underline })}>
                        <Underline size={13} />
                      </button>
                      <div style={{ width: 1, background: 'var(--border)', margin: '0 2px' }} />
                      <button className={`icon-btn ${selected.align === 'left' ? 'active' : ''}`}
                        onClick={() => updateZone(selected.id, { align: 'left' })}>
                        <AlignLeft size={13} />
                      </button>
                      <button className={`icon-btn ${selected.align === 'center' ? 'active' : ''}`}
                        onClick={() => updateZone(selected.id, { align: 'center' })}>
                        <AlignCenter size={13} />
                      </button>
                      <button className={`icon-btn ${selected.align === 'right' ? 'active' : ''}`}
                        onClick={() => updateZone(selected.id, { align: 'right' })}>
                        <AlignRight size={13} />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label>Color</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                      {COLOR_SWATCHES.map(c => (
                        <div key={c} className={`color-swatch ${selected.color === c ? 'selected' : ''}`}
                          style={{ background: c }}
                          onClick={() => updateZone(selected.id, { color: c })}
                        />
                      ))}
                    </div>
                    <input className="input" value={selected.color}
                      onChange={e => updateZone(selected.id, { color: e.target.value })} />
                  </div>

                  <div>
                    <label>Width %</label>
                    <input className="input" type="number" min={10} max={100}
                      value={selected.widthPct ?? 80}
                      onChange={e => updateZone(selected.id, { widthPct: +e.target.value })} />
                  </div>
                </>
              )}

              {/* Image zone properties */}
              {selected.type === 'image' && (
                <>
                  <div>
                    <label>Image</label>
                    <input type="file" accept="image/*" ref={imgInputRef} style={{ display: 'none' }}
                      onChange={handleImageZoneUpload} />
                    <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }}
                      onClick={() => {
                        pendingImageZoneId.current = selected.id
                        imgInputRef.current?.click()
                      }}>
                      <Upload size={13} /> Upload image
                    </button>
                  </div>

                  <div>
                    <label>Frame Shape</label>
                    <select className="input" value={selected.frameShape ?? 'circle'}
                      onChange={e => updateZone(selected.id, { frameShape: e.target.value as FrameShape })}>
                      {FRAME_SHAPES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>

                  <div>
                    <label>Frame Color</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                      {COLOR_SWATCHES.map(c => (
                        <div key={c} className={`color-swatch ${(selected.frameColor ?? '#D4AF37') === c ? 'selected' : ''}`}
                          style={{ background: c }}
                          onClick={() => updateZone(selected.id, { frameColor: c })}
                        />
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label>Width %</label>
                      <input className="input" type="number" min={5} max={100}
                        value={selected.widthPct ?? 30}
                        onChange={e => updateZone(selected.id, { widthPct: +e.target.value })} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label>Height %</label>
                      <input className="input" type="number" min={5} max={100}
                        value={selected.heightPct ?? 30}
                        onChange={e => updateZone(selected.id, { heightPct: +e.target.value })} />
                    </div>
                  </div>

                  <div>
                    <label>Opacity</label>
                    <input className="input" type="number" min={0} max={1} step={0.05}
                      value={selected.opacity}
                      onChange={e => updateZone(selected.id, { opacity: +e.target.value })} />
                  </div>
                </>
              )}

              {/* QR zone */}
              {selected.type === 'qr' && (
                <div>
                  <label>Size %</label>
                  <input className="input" type="number" min={5} max={40}
                    value={selected.widthPct ?? 12}
                    onChange={e => updateZone(selected.id, { widthPct: +e.target.value })} />
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                    Renders the value of <code>__checkin_token__</code> from fields.
                  </p>
                </div>
              )}

              {/* Position */}
              <div>
                <label>Position (% of card)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label>X</label>
                    <input className="input" type="number" min={0} max={100} step={0.5}
                      value={Math.round(selected.xPct * 10) / 10}
                      onChange={e => updateZone(selected.id, { xPct: +e.target.value })} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>Y</label>
                    <input className="input" type="number" min={0} max={100} step={0.5}
                      value={Math.round(selected.yPct * 10) / 10}
                      onChange={e => updateZone(selected.id, { yPct: +e.target.value })} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Center: canvas ── */}
        <div style={{
          flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column',
          alignItems: 'center', padding: 16, gap: 12,
          background: '#080a10',
        }}>
          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button className="icon-btn" onClick={() => setScale(s => Math.max(0.2, +(s - 0.05).toFixed(2)))}>
              <ZoomOut size={14} />
            </button>
            <span style={{ fontSize: 12, color: 'var(--muted)', minWidth: 40, textAlign: 'center' }}>
              {Math.round(scale * 100)}%
            </span>
            <button className="icon-btn" onClick={() => setScale(s => Math.min(1, +(s + 0.05).toFixed(2)))}>
              <ZoomIn size={14} />
            </button>

            <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />

            <input
              type="file"
              accept="image/png,image/jpeg"
              ref={bgInputRef}
              style={{ display: 'none' }}
              onChange={handleBgUpload}
            />
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }}
              onClick={() => bgInputRef.current?.click()}>
              <Upload size={13} />
              {uploadedBg ? 'Change background' : 'Upload background'}
            </button>
          </div>

          {/* Canvas */}
          <div style={{
            position: 'relative',
            width: cardW * scale,
            height: cardH * scale,
            flexShrink: 0,
            borderRadius: 4,
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            background: uploadedBg ? 'transparent' : 'linear-gradient(145deg,#3d2b1f,#6b4c2a,#d4af37)',
          }}>
            {uploadedBg && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={uploadedBg}
                alt=""
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            )}
            <div style={{ position: 'absolute', inset: 0 }}>
              <KonvaCanvas
                width={cardW}
                height={cardH}
                scale={scale}
                zones={preview}
                selectedZoneId={selectedId}
                onSelectZone={setSelectedId}
                onZoneDrag={handleZoneDrag}
                onZoneResize={handleZoneResize}
              />
            </div>
          </div>

          <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
            Click to select · drag to move · handles to resize · double-click image to pan
          </p>
        </div>

        {/* ── Right: fields + render output ── */}
        <div style={{
          width: 280, flexShrink: 0, borderLeft: '1px solid var(--border)',
          overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 16,
        }}>

          {/* Field values */}
          <div>
            <span className="section-title">Token Values</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(fields).map(([key, value]) => (
                <div key={key}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={{ margin: 0 }}>{key}</label>
                    <button className="icon-btn" style={{ padding: 2 }}
                      onClick={() => setFields(f => { const n = { ...f }; delete n[key]; return n })}>
                      <Trash2 size={10} />
                    </button>
                  </div>
                  <input className="input" value={value}
                    onChange={e => setFields(f => ({ ...f, [key]: e.target.value }))} />
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input className="input" placeholder="new_token" value={newFieldKey}
                onChange={e => setNewFieldKey(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newFieldKey.trim()) {
                    setFields(f => ({ ...f, [newFieldKey.trim()]: '' }))
                    setNewFieldKey('')
                  }
                }} />
              <button className="btn btn-ghost" style={{ flexShrink: 0 }}
                onClick={() => {
                  if (newFieldKey.trim()) {
                    setFields(f => ({ ...f, [newFieldKey.trim()]: '' }))
                    setNewFieldKey('')
                  }
                }}>
                <Plus size={13} />
              </button>
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--border)' }} />

          {/* Render output */}
          <div>
            <span className="section-title">Rendered PNG</span>

            {renderError && (
              <div style={{ background: '#ef444415', border: '1px solid #ef444440', borderRadius: 6, padding: '8px 10px', fontSize: 12, color: '#ef4444', marginBottom: 8 }}>
                {renderError}
              </div>
            )}

            {renderUrl ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={renderUrl} alt="Rendered card" style={{ width: '100%', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }} />
                <button className="btn btn-ghost" onClick={downloadRender} style={{ width: '100%', justifyContent: 'center' }}>
                  <Download size={14} /> Download PNG
                </button>
              </div>
            ) : (
              <div style={{
                aspectRatio: `${cardW}/${cardH}`, background: 'var(--bg)', border: '1px dashed var(--border)',
                borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 16 }}>
                  {rendering ? 'Rendering…' : 'Click Render to generate PNG from the server'}
                </span>
              </div>
            )}
          </div>

          {/* Export JSON */}
          {showJson && (
            <div>
              <div style={{ height: 1, background: 'var(--border)', marginBottom: 12 }} />
              <span className="section-title">Zone JSON (for Go)</span>
              <pre style={{
                background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6,
                padding: 10, fontSize: 11, color: '#a5f3fc', overflowX: 'auto',
                maxHeight: 400, overflowY: 'auto',
              }}>
                {zonesToGoJSON(zones)}
              </pre>
              <button className="btn btn-ghost" style={{ marginTop: 8, width: '100%', justifyContent: 'center' }}
                onClick={() => navigator.clipboard.writeText(zonesToGoJSON(zones))}>
                Copy
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
