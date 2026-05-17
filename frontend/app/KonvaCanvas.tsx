'use client'

import { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import { Stage, Layer, Text, Transformer, Group, Image as KImage, Shape, Rect } from 'react-konva'
import type Konva from 'konva'
import type { Zone, FrameShape } from './page'

// ── Frame clip-path generators ────────────────────────────────────────────────

function drawFramePath(
  ctx: Konva.Context | CanvasRenderingContext2D,
  shape: FrameShape,
  w: number,
  h: number,
) {
  const hw = w / 2
  const hh = h / 2

  switch (shape) {
    case 'circle': {
      const r = Math.min(hw, hh)
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2, false)
      ctx.closePath()
      return
    }
    case 'oval': {
      ctx.beginPath()
      ;(ctx as unknown as CanvasRenderingContext2D).ellipse(0, 0, hw * 0.9, hh, 0, 0, Math.PI * 2)
      ctx.closePath()
      return
    }
    case 'heart': {
      ctx.beginPath()
      ctx.moveTo(0, -hh * 0.45)
      ctx.bezierCurveTo(-hw * 1.05, -hh * 1.1, -hw * 1.25, hh * 0.25, 0, hh * 0.85)
      ctx.bezierCurveTo(hw * 1.25, hh * 0.25, hw * 1.05, -hh * 1.1, 0, -hh * 0.45)
      ctx.closePath()
      return
    }
    case 'arch': {
      const r = hw
      ctx.beginPath()
      ctx.moveTo(-hw, hh)
      ctx.lineTo(-hw, -hh + r)
      ctx.arc(0, -hh + r, r, Math.PI, 0, false)
      ctx.lineTo(hw, hh)
      ctx.closePath()
      return
    }
    case 'diamond': {
      ctx.beginPath()
      ctx.moveTo(0, -hh)
      ctx.lineTo(hw, 0)
      ctx.lineTo(0, hh)
      ctx.lineTo(-hw, 0)
      ctx.closePath()
      return
    }
    case 'hexagon': {
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 2
        const x = Math.cos(angle) * hw
        const y = Math.sin(angle) * hh
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      return
    }
    case 'none':
    default: {
      ctx.beginPath()
      ctx.rect(-hw, -hh, w, h)
      ctx.closePath()
      return
    }
  }
}

// ── Image zone ────────────────────────────────────────────────────────────────

function ImageZone({
  zone, cardW, cardH, isSelected, isPanMode, onDragEnd, onDragStart, registerRef, registerInnerRef,
}: {
  zone: Zone
  cardW: number
  cardH: number
  isSelected: boolean
  isPanMode: boolean
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void
  onDragStart: () => void
  registerRef: (node: Konva.Node | null) => void
  registerInnerRef: (node: Konva.Node | null) => void
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const w = ((zone.widthPct ?? 30) / 100) * cardW
  const h = ((zone.heightPct ?? 30) / 100) * cardH
  const x = (zone.xPct / 100) * cardW
  const y = (zone.yPct / 100) * cardH
  const shape = zone.frameShape ?? 'circle'
  const ringColor = zone.frameColor ?? '#D4AF37'

  useEffect(() => {
    if (!zone.imageSrc) { setImg(null); return }
    const i = new window.Image()
    i.crossOrigin = 'anonymous'
    i.src = zone.imageSrc
    i.onload = () => setImg(i)
  }, [zone.imageSrc])

  let drawW = w, drawH = h
  if (img) {
    const imgRatio = img.width / img.height
    const boxRatio = w / h
    const isNone = shape === 'none'
    const wider = imgRatio > boxRatio
    if (isNone ? !wider : wider) {
      drawH = h; drawW = h * imgRatio
    } else {
      drawW = w; drawH = w / imgRatio
    }
  }
  const imgScale = zone.imageScale ?? 1
  drawW = drawW * imgScale
  drawH = drawH * imgScale

  const maxOffX = Math.max(0, (drawW - w) / 2)
  const maxOffY = Math.max(0, (drawH - h) / 2)
  const offX = Math.max(-maxOffX, Math.min(maxOffX, zone.imageOffsetX ?? 0))
  const offY = Math.max(-maxOffY, Math.min(maxOffY, zone.imageOffsetY ?? 0))
  const drawX = -drawW / 2 + offX
  const drawY = -drawH / 2 + offY

  return (
    <Group
      id={zone.id}
      ref={node => registerRef(node)}
      x={x} y={y}
      draggable={isSelected && !isPanMode}
      opacity={zone.opacity}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <Shape
        sceneFunc={(ctx, shapeNode) => { drawFramePath(ctx, shape, w, h); ctx.fillStrokeShape(shapeNode) }}
        fill="transparent"
        listening={false}
      />

      <Rect
        id={zone.id + '-img'}
        ref={node => registerInnerRef(node)}
        x={offX} y={offY}
        offsetX={drawW / 2} offsetY={drawH / 2}
        width={drawW} height={drawH}
        fill="transparent"
        listening={false}
      />

      <Group clipFunc={(ctx) => drawFramePath(ctx, shape, w, h)}>
        {img
          ? <KImage image={img} x={drawX} y={drawY} width={drawW} height={drawH} />
          : (
            <Shape sceneFunc={(ctx, shapeNode) => {
              ctx.fillStyle = 'rgba(255,255,255,0.15)'
              ctx.fillRect(-w/2, -h/2, w, h)
              ctx.fillStyle = 'rgba(255,255,255,0.5)'
              ctx.font = '16px sans-serif'
              ctx.textAlign = 'center'
              ctx.textBaseline = 'middle'
              ctx.fillText('Image', 0, 0)
              ctx.fillStrokeShape(shapeNode)
            }} />
          )
        }
      </Group>

      {shape !== 'none' && (
        <Shape sceneFunc={(ctx, shapeNode) => {
          drawFramePath(ctx, shape, w + 14, h + 14)
          ctx.strokeStyle = ringColor
          ctx.lineWidth = 1
          ctx.globalAlpha = 0.7
          ctx.stroke()
          drawFramePath(ctx, shape, w + 6, h + 6)
          ctx.strokeStyle = ringColor
          ctx.lineWidth = 3
          ctx.globalAlpha = 1
          ctx.stroke()
          ctx.fillStrokeShape(shapeNode)
        }} />
      )}

      {isSelected && (
        <Shape sceneFunc={(ctx, shapeNode) => {
          drawFramePath(ctx, shape === 'none' ? 'none' : shape, w + 22, h + 22)
          ctx.strokeStyle = isPanMode ? '#F97316' : '#6366f1'
          ctx.lineWidth = 2
          ctx.setLineDash([6, 4])
          ctx.stroke()
          ctx.setLineDash([])
          ctx.fillStrokeShape(shapeNode)
        }} />
      )}

      {isSelected && isPanMode && (
        <Shape sceneFunc={(ctx, shapeNode) => {
          ctx.fillStyle = 'rgba(249,115,22,0.85)'
          ctx.fillRect(-60, -h/2 - 22, 120, 18)
          ctx.fillStyle = '#fff'
          ctx.font = 'bold 10px sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('drag=pan · handles=zoom · dbl-tap exit', 0, -h/2 - 13)
          ctx.fillStrokeShape(shapeNode)
        }} />
      )}
    </Group>
  )
}

// ── QR zone ───────────────────────────────────────────────────────────────────

function QRZone({
  zone, cardW, cardH, isSelected, onDragEnd, onDragStart, registerRef,
}: {
  zone: Zone
  cardW: number
  cardH: number
  isSelected: boolean
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void
  onDragStart: () => void
  registerRef: (node: Konva.Node | null) => void
}) {
  const size = ((zone.widthPct ?? 12) / 100) * cardW
  const x = (zone.xPct / 100) * cardW
  const y = (zone.yPct / 100) * cardH

  return (
    <Group
      id={zone.id}
      ref={node => registerRef(node)}
      x={x} y={y}
      draggable={isSelected}
      opacity={zone.opacity}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <Shape
        sceneFunc={(ctx, shapeNode) => {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, size, size)
          ctx.fillStyle = '#000000'
          const cellSize = size / 7
          const drawFinder = (ox: number, oy: number) => {
            ctx.fillRect(ox, oy, cellSize * 3, cellSize * 3)
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(ox + cellSize * 0.5, oy + cellSize * 0.5, cellSize * 2, cellSize * 2)
            ctx.fillStyle = '#000000'
            ctx.fillRect(ox + cellSize, oy + cellSize, cellSize, cellSize)
          }
          drawFinder(0, 0)
          drawFinder(size - cellSize * 3, 0)
          drawFinder(0, size - cellSize * 3)
          for (let r = 3; r < 6; r++) {
            for (let c = 3; c < 6; c++) {
              if ((r + c) % 2 === 0) ctx.fillRect(c * cellSize, r * cellSize, cellSize * 0.8, cellSize * 0.8)
            }
          }
          ctx.fillStrokeShape(shapeNode)
        }}
        width={size}
        height={size}
      />
      {isSelected && (
        <Shape sceneFunc={(ctx, shapeNode) => {
          ctx.strokeStyle = '#6366f1'
          ctx.lineWidth = 2
          ctx.setLineDash([6, 4])
          ctx.strokeRect(-3, -3, size + 6, size + 6)
          ctx.setLineDash([])
          ctx.fillStrokeShape(shapeNode)
        }} />
      )}
    </Group>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface KonvaCanvasProps {
  width: number
  height: number
  scale: number
  zones: Zone[]
  selectedZoneId: string | null
  hideSelectionOverlays?: boolean
  editingTextZoneId?: string | null
  onSelectZone: (id: string | null) => void
  onZoneDrag: (id: string, xPct: number, yPct: number) => void
  onZoneResize: (id: string, patch: { widthPct?: number; heightPct?: number; xPct?: number; yPct?: number; imageOffsetX?: number; imageOffsetY?: number; imageScale?: number }) => void
  onZoneDblClick?: (id: string) => void
  stageRef?: (stage: Konva.Stage | null) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function KonvaCanvas({
  width,
  height,
  scale,
  zones,
  selectedZoneId,
  hideSelectionOverlays = false,
  editingTextZoneId = null,
  onSelectZone,
  onZoneDrag,
  onZoneResize,
  onZoneDblClick,
  stageRef,
}: KonvaCanvasProps) {
  const transformerRef = useRef<Konva.Transformer>(null)
  const innerTransformerRef = useRef<Konva.Transformer>(null)
  const internalStageRef = useRef<Konva.Stage | null>(null)
  const nodeRefs = useRef<Record<string, Konva.Node | null>>({})
  const innerNodeRefs = useRef<Record<string, Konva.Node | null>>({})
  const [fontBust, setFontBust] = useState(0)
  const measuredHRef = useRef<Record<string, number>>({})
  const [measuredH, setMeasuredH] = useState<Record<string, number>>({})

  useEffect(() => {
    if (typeof document === 'undefined' || !('fonts' in document)) return
    let cancelled = false
    ;(async () => {
      await document.fonts.ready
      if (cancelled) return
      const families = [
        'Great Vibes', 'Cormorant Garamond', 'Playfair Display',
        'Montserrat', 'Dancing Script', 'Lato', 'Raleway', 'Open Sans',
      ]
      const specs = families.flatMap(f => [
        `400 16px "${f}"`,
        `700 16px "${f}"`,
        `italic 400 16px "${f}"`,
      ])
      const deadline = Date.now() + 4000
      while (!cancelled) {
        await Promise.allSettled(specs.map(s => document.fonts.load(s)))
        if (specs.every(s => document.fonts.check(s))) break
        if (Date.now() > deadline) break
        await new Promise(r => setTimeout(r, 150))
      }
      if (!cancelled) setFontBust(v => v + 1)
    })()
    return () => { cancelled = true }
  }, [])

  const fontFamilies = useMemo(
    () => [...new Set(
      zones
        .filter(z => !z.type || z.type === 'text')
        .map(z => z.fontFamily)
        .filter((f): f is string => !!f),
    )],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zones.map(z => z.fontFamily).join(',')],
  )
  useEffect(() => {
    if (typeof document === 'undefined' || !('fonts' in document)) return
    if (fontFamilies.length === 0) return
    let cancelled = false
    ;(async () => {
      await Promise.allSettled(
        fontFamilies.flatMap(f => [
          document.fonts.load(`400 16px "${f}"`),
          document.fonts.load(`700 16px "${f}"`),
          document.fonts.load(`italic 400 16px "${f}"`),
        ])
      )
      if (!cancelled) internalStageRef.current?.batchDraw()
    })()
    return () => { cancelled = true }
  }, [fontFamilies])

  const canvasSelectedZoneId = hideSelectionOverlays ? null : selectedZoneId
  const selectedZone = zones.find(z => z.id === canvasSelectedZoneId)
  const isQRSelected = selectedZone?.type === 'qr'
  const isImageSelected = selectedZone?.type === 'image'

  const [panModeZoneId, setPanModeZoneId] = useState<string | null>(null)
  const panModeRef = useRef<string | null>(null)
  const panDragRef = useRef<{
    zoneId: string; startPx: number; startPy: number
    startOffX: number; startOffY: number
  } | null>(null)

  useEffect(() => {
    const tr = transformerRef.current
    const itr = innerTransformerRef.current

    if (tr) {
      const outerNode = !panModeZoneId && canvasSelectedZoneId && !isQRSelected ? nodeRefs.current[canvasSelectedZoneId] : null
      tr.nodes(outerNode ? [outerNode] : [])
      tr.getLayer()?.batchDraw()
    }

    if (itr) {
      const innerNode = panModeZoneId ? innerNodeRefs.current[panModeZoneId] : null
      itr.nodes(innerNode ? [innerNode] : [])
      itr.getLayer()?.batchDraw()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasSelectedZoneId, panModeZoneId, zones, fontBust, isQRSelected])

  useEffect(() => {
    let changedH = false
    const nextH: Record<string, number> = { ...measuredHRef.current }
    zones.forEach(zone => {
      if (zone.type === 'text' || !zone.type) {
        const node = nodeRefs.current[zone.id] as Konva.Text | null
        if (!node) return
        const th = node.height()
        if (th > 0 && Math.abs((nextH[zone.id] ?? 0) - th) > 0.5) {
          nextH[zone.id] = th
          changedH = true
        }
      }
    })
    if (!isDraggingRef.current && changedH) {
      measuredHRef.current = nextH
      setMeasuredH({ ...nextH })
    }
    transformerRef.current?.getLayer()?.batchDraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones, fontBust, width, height])

  const handleTransformEnd = useCallback(() => {
    if (!selectedZoneId) return
    const node = nodeRefs.current[selectedZoneId]
    if (!node) return
    const zone = zones.find(z => z.id === selectedZoneId)
    if (!zone) return

    const sx = Math.abs(node.scaleX())
    const sy = Math.abs(node.scaleY())
    node.scaleX(1)
    node.scaleY(1)

    if (zone.type === 'image') {
      const newW = Math.max(20, (zone.widthPct ?? 30) * sx)
      const newH = Math.max(20, (zone.heightPct ?? 30) * sy)
      onZoneResize(selectedZoneId, {
        widthPct:  Math.round(newW * 10) / 10,
        heightPct: Math.round(newH * 10) / 10,
        xPct: Math.max(0, Math.min(100, Math.round((node.x() / width) * 1000) / 10)),
        yPct: Math.max(0, Math.min(100, Math.round((node.y() / height) * 1000) / 10)),
      })
    } else if (zone.type === 'qr') {
      const origSize = ((zone.widthPct ?? 12) / 100) * width
      const newSize = Math.max(30, origSize * sx)
      onZoneResize(selectedZoneId, {
        widthPct: Math.round((newSize / width) * 1000) / 10,
        xPct: Math.max(0, Math.min(100, Math.round((node.x() / width) * 1000) / 10)),
        yPct: Math.max(0, Math.min(100, Math.round((node.y() / height) * 1000) / 10)),
      })
    } else {
      const newBoxW = Math.max(40, (node as Konva.Text).width() * sx)
      const newBoxX = node.x()
      ;(node as Konva.Text).width(newBoxW)

      let anchorX: number
      if (zone.align === 'center') anchorX = newBoxX + newBoxW / 2
      else if (zone.align === 'right') anchorX = newBoxX + newBoxW
      else anchorX = newBoxX

      onZoneResize(selectedZoneId, {
        widthPct: Math.round((newBoxW / width) * 1000) / 10,
        xPct: Math.max(0, Math.min(100, Math.round((anchorX / width) * 1000) / 10)),
      })
    }
  }, [selectedZoneId, zones, width, height, onZoneResize])

  const handleInnerTransformEnd = useCallback(() => {
    if (!panModeRef.current) return
    const zoneId = panModeRef.current
    const innerNode = innerNodeRefs.current[zoneId]
    if (!innerNode) return
    const zone = zones.find(z => z.id === zoneId)
    if (!zone) return

    const sc = Math.abs(innerNode.scaleX())
    innerNode.scaleX(1)
    innerNode.scaleY(1)

    const newScale = Math.max(1, (zone.imageScale ?? 1) * sc)
    onZoneResize(zoneId, { imageScale: Math.round(newScale * 100) / 100 })
  }, [zones, onZoneResize])

  const handleDragEnd = useCallback(
    (zoneId: string, e: Konva.KonvaEventObject<DragEvent>) => {
      isDraggingRef.current = false
      const zone = zones.find(z => z.id === zoneId)
      if (!zone) return
      const node = nodeRefs.current[zoneId] ?? e.target
      let anchorX = node.x()
      let anchorY = node.y()
      if (zone.type !== 'image' && zone.type !== 'qr') {
        const nodeW = (node as Konva.Text).width()
        const safeFontSize = zone.fontSize > 0 ? zone.fontSize : 24
        const boxH = Math.max(safeFontSize * 1.4, 24)
        const halfH = (measuredH[zone.id] ?? boxH) / 2
        anchorY = anchorY + halfH
        anchorX =
          zone.align === 'center' ? anchorX + nodeW / 2
          : zone.align === 'right' ? anchorX + nodeW
          : anchorX
      }
      const xPct = Math.round((anchorX / width) * 1000) / 10
      const yPct = Math.round((anchorY / height) * 1000) / 10
      onZoneDrag(zone.id, xPct, yPct)
    },
    [onZoneDrag, width, height, zones, measuredH],
  )

  const handleZoneDragStart = useCallback((zoneId: string) => {
    isDraggingRef.current = true
    onSelectZone(zoneId)
    if (panModeRef.current && panModeRef.current !== zoneId) {
      panModeRef.current = null
      setPanModeZoneId(null)
    }
  }, [onSelectZone])

  const zoneHitRect = useCallback((zone: Zone): { x: number; y: number; w: number; h: number } => {
    const x = (zone.xPct / 100) * width
    const y = (zone.yPct / 100) * height
    if (zone.type === 'image') {
      const w = ((zone.widthPct ?? 30) / 100) * width
      const h = ((zone.heightPct ?? 30) / 100) * height
      return { x: x - w / 2, y: y - h / 2, w, h }
    }
    if (zone.type === 'qr') {
      const size = ((zone.widthPct ?? 12) / 100) * width
      return { x, y, w: size, h: size }
    }
    const boxW = Math.max(zone.widthPct ?? 80, 20) / 100 * width
    const safeFontSize = zone.fontSize > 0 ? zone.fontSize : 24
    const h = Math.max(measuredH[zone.id] ?? safeFontSize * 1.4, safeFontSize * 1.4, 24)
    const bx =
      zone.align === 'center' ? x - boxW / 2
      : zone.align === 'right' ? x - boxW
      : x
    return { x: bx, y: y - h / 2, w: boxW, h }
  }, [width, height, measuredH])

  const lastClickRef = useRef<{ zoneId: string; time: number } | null>(null)
  const pendingDragRef = useRef<{ zoneId: string; startX: number; startY: number } | null>(null)
  const isDraggingRef = useRef(false)

  const handleStagePointerDown = useCallback((e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    {
      let n: Konva.Node | null = e.target as Konva.Node
      while (n) {
        if ((n as unknown) === transformerRef.current || (n as unknown) === innerTransformerRef.current) return
        n = n.getParent?.() ?? null
      }
    }

    const stage = e.target.getStage()
    if (!stage) return
    const pointer = stage.getPointerPosition()
    if (!pointer) return
    const px = pointer.x / scale
    const py = pointer.y / scale

    for (let i = zones.length - 1; i >= 0; i--) {
      const zone = zones[i]
      const r = zoneHitRect(zone)
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
        onSelectZone(zone.id)

        const now = Date.now()
        const last = lastClickRef.current
        if (last && last.zoneId === zone.id && now - last.time < 350) {
          if (zone.type === 'image') {
            const next = panModeRef.current === zone.id ? null : zone.id
            panModeRef.current = next
            setPanModeZoneId(next)
          } else if (!zone.type || zone.type === 'text') {
            onZoneDblClick?.(zone.id)
          }
          lastClickRef.current = null
        } else {
          lastClickRef.current = { zoneId: zone.id, time: now }
        }

        if (panModeRef.current === zone.id && zone.type === 'image') {
          panDragRef.current = {
            zoneId: zone.id,
            startPx: px, startPy: py,
            startOffX: zone.imageOffsetX ?? 0,
            startOffY: zone.imageOffsetY ?? 0,
          }
          return
        }

        pendingDragRef.current = { zoneId: zone.id, startX: px, startY: py }
        return
      }
    }
    onSelectZone(null)
    panModeRef.current = null
    setPanModeZoneId(null)
    pendingDragRef.current = null
    lastClickRef.current = null
  }, [zones, zoneHitRect, scale, onSelectZone, onZoneDblClick])

  const handleStagePointerMove = useCallback((e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const pan = panDragRef.current
    if (pan) {
      const stage = e.target.getStage()
      if (!stage) return
      const pointer = stage.getPointerPosition()
      if (!pointer) return
      const px = pointer.x / scale
      const py = pointer.y / scale
      const zone = zones.find(z => z.id === pan.zoneId)
      if (!zone) return
      const w = ((zone.widthPct ?? 30) / 100) * width
      const h = ((zone.heightPct ?? 30) / 100) * height
      let drawW = Math.max(w, w * 1.5)
      let drawH = Math.max(h, h * 1.5)
      if (zone.imageSrc) { drawW = Math.max(w, w * 1.5); drawH = Math.max(h, h * 1.5) }
      const maxOffX = Math.max(0, (drawW - w) / 2)
      const maxOffY = Math.max(0, (drawH - h) / 2)
      const newOffX = Math.max(-maxOffX, Math.min(maxOffX, pan.startOffX + (px - pan.startPx)))
      const newOffY = Math.max(-maxOffY, Math.min(maxOffY, pan.startOffY + (py - pan.startPy)))
      onZoneResize(pan.zoneId, { imageOffsetX: newOffX, imageOffsetY: newOffY })
      return
    }

    const pending = pendingDragRef.current
    if (!pending) return
    const stage = e.target.getStage()
    if (!stage) return
    const pointer = stage.getPointerPosition()
    if (!pointer) return
    const px = pointer.x / scale
    const py = pointer.y / scale
    const dx = px - pending.startX
    const dy = py - pending.startY
    if (dx * dx + dy * dy < 9) return

    const node = nodeRefs.current[pending.zoneId]
    pendingDragRef.current = null
    if (!node) return

    handleZoneDragStart(pending.zoneId)
    node.setAttr('draggable', true)
    ;(node as Konva.Node & { startDrag: (evt?: Event) => void }).startDrag(e.evt as Event)
  }, [scale, zones, width, height, onZoneResize, handleZoneDragStart])

  const handleStagePointerUp = useCallback(() => {
    isDraggingRef.current = false
    panDragRef.current = null
    pendingDragRef.current = null
  }, [])

  return (
    <Stage
      ref={node => { internalStageRef.current = node; if (stageRef) stageRef(node) }}
      width={width * scale}
      height={height * scale}
      scaleX={scale}
      scaleY={scale}
      onMouseDown={handleStagePointerDown}
      onTouchStart={handleStagePointerDown}
      onMouseMove={handleStagePointerMove}
      onTouchMove={handleStagePointerMove}
      onMouseUp={handleStagePointerUp}
      onTouchEnd={handleStagePointerUp}
    >
      <Layer>
        {zones.map(zone => {
          if (zone.type === 'image') {
            return (
              <ImageZone
                key={zone.id}
                zone={zone}
                cardW={width}
                cardH={height}
                isSelected={zone.id === canvasSelectedZoneId}
                isPanMode={panModeZoneId === zone.id}
                onDragStart={() => handleZoneDragStart(zone.id)}
                onDragEnd={e => handleDragEnd(zone.id, e)}
                registerRef={node => { nodeRefs.current[zone.id] = node }}
                registerInnerRef={node => { innerNodeRefs.current[zone.id] = node }}
              />
            )
          }

          if (zone.type === 'qr') {
            return (
              <QRZone
                key={zone.id}
                zone={zone}
                cardW={width}
                cardH={height}
                isSelected={zone.id === canvasSelectedZoneId}
                onDragStart={() => handleZoneDragStart(zone.id)}
                onDragEnd={e => handleDragEnd(zone.id, e)}
                registerRef={node => { nodeRefs.current[zone.id] = node }}
              />
            )
          }

          // Text zone
          const x = (zone.xPct / 100) * width
          const y = (zone.yPct / 100) * height
          const fontStyle =
            zone.bold && zone.italic ? 'bold italic'
            : zone.bold ? 'bold'
            : zone.italic ? 'italic'
            : 'normal'
          const safeText = zone.text && zone.text.length > 0 ? zone.text : 'Text'
          const safeFontSize = zone.fontSize > 0 ? zone.fontSize : 24
          const safeFontFamily = zone.fontFamily || 'sans-serif'
          const boxW = (Math.max(zone.widthPct ?? 80, 20) / 100) * width
          const boxH = Math.max(safeFontSize * 1.4, 24)
          const effectiveH = measuredH[zone.id] ?? boxH
          const boxX =
            zone.align === 'center' ? x - boxW / 2
            : zone.align === 'right' ? x - boxW
            : x
          const boxY = y - effectiveH / 2

          return (
            <Text
              key={`${zone.id}-${fontBust}`}
              id={zone.id}
              ref={el => { nodeRefs.current[zone.id] = el }}
              text={safeText}
              x={boxX}
              y={boxY}
              width={boxW}
              fontSize={safeFontSize}
              fill={zone.color || '#000'}
              fontFamily={safeFontFamily}
              fontStyle={fontStyle}
              textDecoration={zone.underline ? 'underline' : ''}
              align={zone.align}
              opacity={zone.id === editingTextZoneId ? 0 : zone.opacity}
              draggable={zone.id === canvasSelectedZoneId && zone.id !== editingTextZoneId}
              onDragStart={() => handleZoneDragStart(zone.id)}
              onDragEnd={e => handleDragEnd(zone.id, e)}
              perfectDrawEnabled
              shadowForStrokeEnabled={false}
              hitStrokeWidth={0}
            />
          )
        })}

        <Transformer
          ref={transformerRef}
          rotateEnabled={false}
          keepRatio={isQRSelected}
          enabledAnchors={
            isQRSelected
              ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
              : ['top-left', 'top-right', 'bottom-left', 'bottom-right',
                 'middle-left', 'middle-right', 'top-center', 'bottom-center']
          }
          borderEnabled={!isQRSelected && !panModeZoneId}
          anchorFill={isImageSelected && !panModeZoneId ? '#6366f1' : undefined}
          onTransformEnd={handleTransformEnd}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 20 || newBox.height < 20) return oldBox
            return newBox
          }}
        />

        <Transformer
          ref={innerTransformerRef}
          rotateEnabled={false}
          keepRatio={true}
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
          borderStroke="#F97316"
          borderDash={[6, 3]}
          anchorFill="#F97316"
          anchorStroke="#fff"
          onTransformEnd={handleInnerTransformEnd}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 20 || newBox.height < 20) return oldBox
            return newBox
          }}
        />
      </Layer>
    </Stage>
  )
}
